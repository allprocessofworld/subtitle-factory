'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, Mic, Volume2, RotateCcw, Square } from 'lucide-react';
import { DUBBING_LANGUAGES, DUBBING_MP3_KBPS, DUBBING_SAMPLE_RATE, MP3_DELAY_SAMPLES, SrtBlock } from '@/types';
import { parseSrt, parseTimecodeRange } from '@/lib/srt-utils';
import {
  downloadBlob, encodeMp3, encodeWav, formatSeconds, getJson, postForBinary, readSubtitleFile, runPool,
} from '@/lib/client-utils';
import { ProgressBox, WarningBox, formatBlockNumbers } from '@/components/shared';

/** 요금제 확인 전 기본 동시 처리 수 (서버가 ElevenLabs 요금제를 확인해 덮어씀) */
const DEFAULT_CONCURRENCY = 5;
/** 이 이상 뒤로 밀리면 "싱크 밀림"으로 보고 */
const DRIFT_TOLERANCE_SEC = 0.15;

interface LangState {
  file: File;
  blocks: SrtBlock[];
  charCount: number;
}

interface DubbingResult {
  /** MP3 (기본 다운로드·미리듣기) */
  mp3: Blob;
  mp3Url: string;
  /** 파일 이름 (확장자 제외) */
  baseName: string;
  duration: number;
  failed: number[]; // 음성 생성 실패한 블록 인덱스 (무음 처리됨)
  drifted: number; // 자막 시작 시점보다 늦게 시작한 블록 수
  maxDrift: number; // 최대 밀림(초)
}

/**
 * 블록별 음성을 타임코드 위치에 배치해 하나의 PCM 트랙으로 합침.
 * trimStart: 맨 앞에서 잘라낼 샘플 수 (MP3 인코더 지연 보정용, 첫 음성 앞 무음 범위 안에서만)
 */
function assembleTimeline(blocks: SrtBlock[], clips: (Int16Array | null)[], trimStart = 0) {
  const sr = DUBBING_SAMPLE_RATE;
  const placements: { at: number; clip: Int16Array }[] = [];
  let cursor = 0; // 앞 음성이 끝난 시점(초)
  let drifted = 0;
  let maxDrift = 0;
  let lastEnd = 0;

  blocks.forEach((block, i) => {
    const { start, end } = parseTimecodeRange(block.timecode);
    if (Number.isFinite(end)) lastEnd = Math.max(lastEnd, end);
    const clip = clips[i];
    if (!clip || !Number.isFinite(start)) return;
    // 앞 음성과 겹치지 않도록, 필요하면 뒤로 민다
    const at = Math.max(start, cursor);
    const drift = at - start;
    if (drift > DRIFT_TOLERANCE_SEC) {
      drifted++;
      maxDrift = Math.max(maxDrift, drift);
    }
    placements.push({ at, clip });
    cursor = at + clip.length / sr;
  });

  const totalSec = Math.max(cursor, lastEnd) + 0.5;
  const firstSample = placements.length ? Math.round(placements[0].at * sr) : 0;
  const trim = Math.min(trimStart, firstSample);
  const out = new Int16Array(Math.ceil(totalSec * sr) - trim);
  for (const { at, clip } of placements) {
    out.set(clip, Math.round(at * sr) - trim);
  }
  return { samples: out, duration: totalSec, drifted, maxDrift };
}

export default function DubbingTab() {
  const [langs, setLangs] = useState<Record<string, LangState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [processing, setProcessing] = useState<{ code: string; phase: 'tts' | 'mp3'; done: number; total: number } | null>(null);
  const [plan, setPlan] = useState<{ tier: string | null; concurrency: number } | null>(null);
  const [results, setResults] = useState<Record<string, DubbingResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clipsRef = useRef<Record<string, (Int16Array | null)[]>>({});
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<string[]>([]);

  // 탭을 벗어나면 오디오 메모리 해제
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // ElevenLabs 요금제에 맞는 동시 처리 수 조회
  useEffect(() => {
    getJson<{ tier: string | null; concurrency: number }>('/api/dubbing')
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);
  const concurrency = plan?.concurrency ?? DEFAULT_CONCURRENCY;

  const setLangError = (code: string, message?: string) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[code] = message;
      else delete next[code];
      return next;
    });

  const handleFileSelect = async (code: string, selected: File) => {
    if (!selected.name.toLowerCase().endsWith('.srt')) {
      setLangError(code, '.srt 파일만 가능합니다.');
      return;
    }
    const blocks = parseSrt(await readSubtitleFile(selected));
    if (blocks.length === 0) {
      setLangError(code, 'SRT 파일을 해석할 수 없습니다.');
      return;
    }
    if (blocks.some((b) => !Number.isFinite(parseTimecodeRange(b.timecode).start))) {
      setLangError(code, '타임코드 형식이 올바르지 않은 블록이 있습니다.');
      return;
    }
    clipsRef.current[code] = new Array(blocks.length).fill(null);
    setLangs((prev) => ({
      ...prev,
      [code]: { file: selected, blocks, charCount: blocks.reduce((s, b) => s + b.text.length, 0) },
    }));
    setResults((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    setLangError(code);
  };

  /** 한 언어 더빙 생성. onlyIndices가 있으면 그 블록만 다시 생성 */
  const generate = async (code: string, signal: AbortSignal, onlyIndices?: number[]) => {
    const lang = DUBBING_LANGUAGES.find((l) => l.code === code)!;
    const { blocks } = langs[code];
    const clips = clipsRef.current[code] ?? new Array(blocks.length).fill(null);
    clipsRef.current[code] = clips;

    const indices = onlyIndices ?? blocks.map((_, i) => i);
    let done = 0;
    setProcessing({ code, phase: 'tts', done: 0, total: indices.length });

    const outcomes = await runPool(
      indices.map((i) => async () => {
        const buf = await postForBinary('/api/dubbing', {
          text: blocks[i].text,
          languageCode: code,
          previousText: blocks[i - 1]?.text,
          nextText: blocks[i + 1]?.text,
        });
        clips[i] = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
        done++;
        setProcessing({ code, phase: 'tts', done, total: indices.length });
      }),
      concurrency,
      signal
    );

    const failedNow = indices.filter((_, k) => !outcomes[k].ok);
    const failedAll = blocks.map((_, i) => i).filter((i) => !clips[i]);
    if (failedAll.length === blocks.length) {
      const firstError = outcomes.find((o) => !o.ok);
      throw new Error(firstError && !firstError.ok ? firstError.error.message : '더빙 생성 실패');
    }

    // 타임라인 정보 계산 후 MP3로 변환 (WAV는 다운로드 시에만 생성 — 메모리 절약)
    const { duration, drifted, maxDrift } = assembleTimeline(blocks, clips);
    setProcessing({ code, phase: 'mp3', done: 0, total: 100 });
    const mp3 = await encodeMp3(
      () => assembleTimeline(blocks, clips, MP3_DELAY_SAMPLES).samples,
      DUBBING_SAMPLE_RATE,
      DUBBING_MP3_KBPS,
      (value) => setProcessing({ code, phase: 'mp3', done: Math.round(value * 100), total: 100 })
    );
    const mp3Url = URL.createObjectURL(mp3);
    urlsRef.current.push(mp3Url);

    setResults((prev) => {
      if (prev[code]) URL.revokeObjectURL(prev[code].mp3Url);
      return {
        ...prev,
        [code]: { mp3, mp3Url, baseName: lang.name, duration, failed: failedAll, drifted, maxDrift },
      };
    });

    if (failedNow.length > 0) {
      const firstError = outcomes.find((o) => !o.ok);
      setLangError(code, firstError && !firstError.ok ? firstError.error.message : undefined);
    }
  };

  const runFor = async (codes: string[], retryFailed = false) => {
    if (codes.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    for (const code of codes) {
      if (controller.signal.aborted) break;
      setLangError(code);
      try {
        await generate(code, controller.signal, retryFailed ? results[code]?.failed : undefined);
      } catch (err: any) {
        setLangError(code, err.message);
      }
    }
    setProcessing(null);
    setIsLoading(false);
    abortRef.current = null;
  };

  /** 무압축 WAV — 요청 시에만 생성 */
  const downloadWav = (code: string) => {
    const { blocks } = langs[code];
    const { samples } = assembleTimeline(blocks, clipsRef.current[code] || []);
    downloadBlob(encodeWav(samples, DUBBING_SAMPLE_RATE), `${results[code].baseName}.wav`);
  };

  const assignedCodes = DUBBING_LANGUAGES.map((l) => l.code).filter((c) => langs[c]);
  const totalChars = assignedCodes.reduce((s, c) => s + langs[c].charCount, 0);
  const processingName = processing ? DUBBING_LANGUAGES.find((l) => l.code === processing.code)?.name : '';
  const resultCodes = DUBBING_LANGUAGES.map((l) => l.code).filter((c) => results[c]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mic className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">다국어 더빙 생성 (6개 언어)</h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              각 언어별 자막(.srt)을 업로드하면 <strong>ElevenLabs</strong> TTS로 자막 한 줄씩 음성을 만들어{' '}
              <strong>각 자막의 타임코드 위치에 배치</strong>한 MP3 파일 한 개를 생성합니다(무압축 WAV도 선택 가능). 편집 타임라인
              0초 지점에 놓으면 영상과 싱크가 맞습니다. 음성이 자막 구간보다 길면 다음 줄이 그만큼 뒤로 밀리며, 결과에
              표시됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 언어별 파일 업로드 */}
      <div className="card p-6">
        <h3 className="font-medium text-surface-800 mb-4">언어별 SRT 파일 지정 ({assignedCodes.length}/6)</h3>

        <div className="space-y-3">
          {DUBBING_LANGUAGES.map((lang) => {
            const assigned = langs[lang.code];
            const langError = errors[lang.code];
            return (
              <div key={lang.code} className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                <div className="w-24 text-sm font-medium text-surface-700 flex-shrink-0">{lang.name}</div>
                <label className={`flex-1 min-w-0 ${isLoading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="file"
                    accept=".srt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(lang.code, f);
                      e.target.value = '';
                    }}
                  />
                  <div
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors
                    ${assigned
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-surface-50 border-surface-200 text-surface-400 hover:bg-surface-100'}`}
                  >
                    {assigned ? (
                      <>
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{assigned.file.name}</span>
                        <span className="ml-auto text-xs text-green-600 flex-shrink-0">
                          {assigned.blocks.length}줄 · {assigned.charCount.toLocaleString()}자
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        SRT 파일 선택...
                      </>
                    )}
                  </div>
                </label>
                {langError && <span className="text-xs text-red-500 w-full sm:w-auto sm:max-w-xs">{langError}</span>}
              </div>
            );
          })}
        </div>

        {assignedCodes.length > 0 && (
          <p className="mt-4 text-xs text-surface-400">
            총 {totalChars.toLocaleString()}자 — ElevenLabs 크레딧이 글자 수만큼 차감됩니다. · 동시 처리 {concurrency}줄
            {plan?.tier ? ` (ElevenLabs ${plan.tier} 요금제 기준)` : ''}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {isLoading && (
            <button onClick={() => abortRef.current?.abort()} className="btn-secondary">
              <Square className="w-4 h-4" />
              중단
            </button>
          )}
          <button onClick={() => runFor(assignedCodes)} disabled={assignedCodes.length === 0 || isLoading} className="btn-primary">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {processingName} 더빙 생성 중...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                {assignedCodes.length}개 언어 더빙 생성
              </>
            )}
          </button>
        </div>

        {isLoading && processing && (
          <ProgressBox
            tone="violet"
            label={
              processing.phase === 'mp3'
                ? `${processingName} MP3 변환 중...`
                : `${processingName} 더빙 생성 중... (${processing.done}/${processing.total}줄) — 60분 분량은 언어당 수 분이 걸릴 수 있습니다.`
            }
            done={processing.done}
            total={processing.total}
          />
        )}
      </div>

      {/* 결과 */}
      {resultCodes.length > 0 && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <h3 className="font-display font-bold text-lg">{resultCodes.length}개 더빙 완료</h3>
          </div>

          <div className="space-y-3">
            {resultCodes.map((code) => {
              const r = results[code];
              const blocks = langs[code]?.blocks || [];
              return (
                <div key={code} className="p-4 bg-surface-50 rounded-xl space-y-3">
                  <div className="flex items-center gap-4">
                    <Volume2 className="w-5 h-5 text-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-800">
                        {r.baseName}.mp3{' '}
                        <span className="text-xs font-normal text-surface-400">
                          길이 {formatSeconds(r.duration)} · {(r.mp3.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </p>
                      <audio controls preload="none" className="w-full mt-2 h-8" src={r.mp3Url} />
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <button onClick={() => downloadBlob(r.mp3, `${r.baseName}.mp3`)} className="btn-secondary text-sm">
                        <Download className="w-4 h-4" />
                        MP3 다운로드
                      </button>
                      <button
                        onClick={() => downloadWav(code)}
                        disabled={isLoading}
                        className="text-xs text-surface-400 hover:text-surface-600"
                        title="무압축 원본 (용량 큼, 60분 약 170MB)"
                      >
                        WAV(무압축)로 받기
                      </button>
                    </div>
                  </div>

                  {(r.failed.length > 0 || r.drifted > 0) && (
                    <WarningBox>
                      {r.failed.length > 0 && (
                        <p>
                          <strong>{r.failed.length}개 줄 음성 생성 실패 (무음 처리됨)</strong> — 자막 번호{' '}
                          {formatBlockNumbers(r.failed.map((i) => blocks[i]?.index), 10)}
                        </p>
                      )}
                      {r.drifted > 0 && (
                        <p>
                          {r.drifted}개 줄이 앞 음성이 길어 자막 시작보다 늦게 시작합니다 (최대 {r.maxDrift.toFixed(1)}초
                          밀림). 해당 자막을 짧게 줄이면 싱크가 정확해집니다.
                        </p>
                      )}
                      {r.failed.length > 0 && !isLoading && (
                        <button onClick={() => runFor([code], true)} className="btn-secondary text-xs mt-2 !py-1.5">
                          <RotateCcw className="w-3.5 h-3.5" />
                          실패한 {r.failed.length}줄 다시 생성
                        </button>
                      )}
                    </WarningBox>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
