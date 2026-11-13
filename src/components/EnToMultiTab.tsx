'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, CheckCircle2, Globe, Package, RotateCcw, Square, AlertTriangle, XCircle } from 'lucide-react';
import JSZip from 'jszip';
import { MULTILINGUAL_LANGUAGES, SrtBlock } from '@/types';
import { parseSrt, serializeSrt, replaceTexts } from '@/lib/srt-utils';
import { downloadBlob, downloadText, readSubtitleFile, runPool } from '@/lib/client-utils';
import { translateInChunks } from '@/lib/chunked-translate';
import { SrtDropzone, ProgressBox, ErrorBox, WarningBox, GlossaryInput, formatBlockNumbers } from '@/components/shared';

const CHUNK_SIZE = 80;
const LANGUAGE_CONCURRENCY = 3; // 동시에 번역할 언어 수
const CHUNK_CONCURRENCY = 2; // 언어 하나당 동시 구간 요청 수

type LangStatus = 'pending' | 'running' | 'done' | 'partial' | 'failed';

interface LangResult {
  status: LangStatus;
  texts?: string[];
  missing?: number[];
  message?: string;
}

const LANG_BY_CODE = Object.fromEntries(MULTILINGUAL_LANGUAGES.map((l) => [l.code, l]));

export default function EnToMultiTab() {
  const [file, setFile] = useState<File | null>(null);
  const [blocks, setBlocks] = useState<SrtBlock[]>([]);
  const [glossary, setGlossary] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(MULTILINGUAL_LANGUAGES.map((l) => l.code));
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [compressProgress, setCompressProgress] = useState<{ done: number; total: number } | null>(null);
  const [compressedSources, setCompressedSources] = useState<string[] | null>(null);
  const [compressNote, setCompressNote] = useState('');
  const [results, setResults] = useState<Record<string, LangResult>>({});
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = async (picked: File) => {
    setError('');
    setResults({});
    setCompressedSources(null);
    setCompressNote('');
    const parsed = parseSrt(await readSubtitleFile(picked));
    if (parsed.length === 0) {
      setFile(null);
      setBlocks([]);
      setError('SRT 파일을 해석할 수 없습니다. 형식을 확인해주세요.');
      return;
    }
    setFile(picked);
    setBlocks(parsed);
  };

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const updateResult = (code: string, value: LangResult) => setResults((prev) => ({ ...prev, [code]: value }));

  /** 1단계: 영어 압축 (압축이 빠진 줄은 원문 영어 사용) */
  const compress = async (signal: AbortSignal): Promise<string[]> => {
    setStage('영어 문장 압축 중...');
    const originals = blocks.map((b) => b.text);
    const result = await translateInChunks({
      endpoint: '/api/translate/compress',
      sources: originals,
      chunkSize: CHUNK_SIZE,
      concurrency: 4,
      onProgress: (done, total) => setCompressProgress({ done, total }),
      signal,
    });
    setCompressProgress(null);
    if (result.missing.length > 0) {
      setCompressNote(`${result.missing.length}개 줄은 압축하지 못해 원문 영어로 번역했습니다.`);
    }
    return originals.map((t, i) => result.texts[i] || t);
  };

  /** 2단계: 언어별 번역 */
  const translateLanguages = async (codes: string[], sources: string[], signal: AbortSignal) => {
    setStage('다국어 번역 중...');
    codes.forEach((code) => updateResult(code, { status: 'pending' }));
    await runPool(
      codes.map((code) => async () => {
        if (signal.aborted) return;
        updateResult(code, { status: 'running' });
        const r = await translateInChunks({
          endpoint: '/api/translate/en-to-multi',
          sources,
          extraBody: { languageCode: code, glossary },
          chunkSize: CHUNK_SIZE,
          concurrency: CHUNK_CONCURRENCY,
          signal,
        });
        if (r.missing.length === sources.length) {
          updateResult(code, { status: 'failed', message: r.messages[0] || '번역 실패' });
        } else {
          updateResult(code, {
            status: r.missing.length ? 'partial' : 'done',
            texts: r.texts,
            missing: r.missing,
            message: r.messages.join(' / ') || undefined,
          });
        }
      }),
      LANGUAGE_CONCURRENCY,
      signal
    );
  };

  const start = async (codes: string[], reuseCompressed: boolean) => {
    if (blocks.length === 0 || codes.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError('');
    try {
      const sources = reuseCompressed && compressedSources ? compressedSources : await compress(controller.signal);
      setCompressedSources(sources);
      await translateLanguages(codes, sources, controller.signal);
    } catch (err: any) {
      setError(err.message || '번역 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setStage('');
      setCompressProgress(null);
      abortRef.current = null;
    }
  };

  const handleStart = () => {
    setResults({});
    start(selectedLanguages, false);
  };

  /** 실패·일부 누락 언어만 다시 (압축 결과 재사용) */
  const retryCodes = Object.entries(results)
    .filter(([, r]) => r.status === 'failed' || r.status === 'partial' || r.status === 'pending')
    .map(([code]) => code);

  const finished = Object.entries(results).filter(([, r]) => r.texts && (r.status === 'done' || r.status === 'partial'));
  const doneCount = Object.values(results).filter((r) => ['done', 'partial', 'failed'].includes(r.status)).length;
  const totalCount = Object.keys(results).length;

  const buildSrt = (code: string) => serializeSrt(replaceTexts(blocks, results[code].texts!));
  const filenameOf = (code: string) => `${LANG_BY_CODE[code]?.name || code}.srt`;

  const downloadAll = async () => {
    const zip = new JSZip();
    for (const [code] of finished) zip.file(filenameOf(code), '﻿' + buildSrt(code));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), '다국어_자막.zip');
  };

  const partials = finished.filter(([, r]) => r.status === 'partial');
  const failed = Object.entries(results).filter(([, r]) => r.status === 'failed');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">영어 → 다국어 번역 ({MULTILINGUAL_LANGUAGES.length}개 언어)</h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              영어 자막(.srt)을 업로드하면 다국어 번역 시 글자 수 초과를 방지하기 위해 먼저{' '}
              <strong>영어 문장을 압축</strong>한 후, 선택한 언어들로 번역합니다. 언어별로 따로 처리되므로
              일부 언어가 실패해도 나머지는 정상 완료되며, 실패한 언어만 다시 시도할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {/* 파일 업로드 */}
      <div className="card p-6">
        <SrtDropzone
          file={file}
          onFile={handleFile}
          onError={setError}
          disabled={isLoading}
          placeholder="영어 자막 파일(.srt)을 드래그하거나 클릭"
          hint="최대 1MB"
          fileInfo={blocks.length > 0 ? `${blocks.length}개 자막 블록` : undefined}
        />
        <GlossaryInput value={glossary} onChange={setGlossary} mode="en" disabled={isLoading} />
      </div>

      {/* 언어 선택 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-surface-800">
            번역 언어 선택 ({selectedLanguages.length}/{MULTILINGUAL_LANGUAGES.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedLanguages(MULTILINGUAL_LANGUAGES.map((l) => l.code))}
              disabled={isLoading}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              전체 선택
            </button>
            <span className="text-surface-300">|</span>
            <button
              onClick={() => setSelectedLanguages([])}
              disabled={isLoading}
              className="text-xs text-surface-500 hover:text-surface-700 font-medium"
            >
              전체 해제
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {MULTILINGUAL_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguages.includes(lang.code);
            const r = results[lang.code];
            return (
              <button
                key={lang.code}
                onClick={() => toggleLanguage(lang.code)}
                disabled={isLoading}
                className={`flex items-center justify-between gap-1 text-left px-3 py-2 rounded-lg text-sm transition-all
                  ${isSelected
                    ? 'bg-brand-50 text-brand-700 border border-brand-200 font-medium'
                    : 'bg-surface-50 text-surface-500 border border-transparent hover:bg-surface-100'}`}
              >
                <span className="truncate">{lang.name}</span>
                <StatusIcon status={r?.status} />
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {isLoading && (
            <button onClick={() => abortRef.current?.abort()} className="btn-secondary">
              <Square className="w-4 h-4" />
              중단
            </button>
          )}
          <button
            onClick={handleStart}
            disabled={blocks.length === 0 || isLoading || selectedLanguages.length === 0}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                번역 중...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                {selectedLanguages.length}개 언어 번역 시작
              </>
            )}
          </button>
        </div>

        {isLoading && (
          <ProgressBox
            label={compressProgress ? stage : `${stage} (${doneCount}/${totalCount} 언어 완료)`}
            done={compressProgress ? compressProgress.done : doneCount}
            total={compressProgress ? compressProgress.total : totalCount}
          />
        )}
        <ErrorBox message={error} />
      </div>

      {/* 결과 */}
      {(finished.length > 0 || failed.length > 0) && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <h3 className="font-display font-bold text-lg">{finished.length}개 언어 번역 완료</h3>
            </div>
            <button onClick={downloadAll} disabled={finished.length === 0} className="btn-primary">
              <Package className="w-4 h-4" />
              전체 ZIP 다운로드
            </button>
          </div>

          {(failed.length > 0 || partials.length > 0 || compressNote) && (
            <WarningBox>
              {compressNote && <p>{compressNote}</p>}
              {failed.length > 0 && (
                <p>
                  <strong>번역 실패:</strong>{' '}
                  {failed.map(([code, r]) => `${LANG_BY_CODE[code]?.name} (${r.message})`).join(', ')}
                </p>
              )}
              {partials.map(([code, r]) => (
                <p key={code}>
                  <strong>{LANG_BY_CODE[code]?.name}:</strong> {r.missing!.length}개 블록이 영어 원문으로 남아 있음 —
                  자막 번호 {formatBlockNumbers(r.missing!.map((i) => blocks[i].index), 8)}
                </p>
              ))}
              {!isLoading && retryCodes.length > 0 && (
                <button onClick={() => start(retryCodes, true)} className="btn-secondary text-xs mt-2 !py-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  실패·누락 {retryCodes.length}개 언어 다시 번역
                </button>
              )}
            </WarningBox>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {finished.map(([code, r]) => (
              <button
                key={code}
                onClick={() => downloadText(buildSrt(code), filenameOf(code))}
                className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors text-left text-sm"
              >
                <Download className={`w-4 h-4 flex-shrink-0 ${r.status === 'partial' ? 'text-amber-500' : 'text-brand-500'}`} />
                <span className="text-surface-700 truncate">{filenameOf(code)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status?: LangStatus }) {
  if (!status) return null;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />;
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
  if (status === 'partial') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-surface-300 flex-shrink-0" />;
}
