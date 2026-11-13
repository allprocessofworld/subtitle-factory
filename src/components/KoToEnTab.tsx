'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, Loader2, CheckCircle2, Sparkles, RotateCcw, Square } from 'lucide-react';
import { SrtBlock } from '@/types';
import { parseSrt, serializeSrt, replaceTexts, generateNarrationScript } from '@/lib/srt-utils';
import { downloadText, readSubtitleFile } from '@/lib/client-utils';
import { translateInChunks } from '@/lib/chunked-translate';
import { SrtDropzone, ProgressBox, ErrorBox, WarningBox, GlossaryInput, formatBlockNumbers } from '@/components/shared';

const CHUNK_SIZE = 60; // 한 요청당 자막 줄 수 (Gemini + Claude 2단계를 서버 시간 안에 처리)
const CONCURRENCY = 3;

export default function KoToEnTab() {
  const [file, setFile] = useState<File | null>(null);
  const [blocks, setBlocks] = useState<SrtBlock[]>([]);
  const [glossary, setGlossary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [translated, setTranslated] = useState<string[] | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = async (picked: File) => {
    setError('');
    setTranslated(null);
    setMissing([]);
    setMessages([]);
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

  const run = async (indices?: number[]) => {
    if (blocks.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError('');
    try {
      const result = await translateInChunks(
        {
          endpoint: '/api/translate/ko-to-en',
          sources: blocks.map((b) => b.text),
          indices,
          extraBody: { glossary },
          chunkSize: CHUNK_SIZE,
          concurrency: CONCURRENCY,
          onProgress: (done, total) => setProgress({ done, total }),
          signal: controller.signal,
        },
        indices ? translated ?? undefined : undefined
      );
      setTranslated(result.texts);
      setMissing(result.missing);
      setMessages(result.messages);
      if (result.missing.length === blocks.length) {
        setError(result.messages[0] || '번역에 실패했습니다.');
        setTranslated(null);
      }
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const outputBlocks = useMemo(
    () => (translated ? replaceTexts(blocks, translated) : []),
    [blocks, translated]
  );

  const baseName = file ? file.name.replace(/\.srt$/i, '') : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 카드 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">한국어 → 영어 번역</h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              한국어 자막(.srt)을 업로드하면 <strong>Gemini</strong>로 정확한 기술 용어를 번역하고,
              <strong> Claude</strong>가 한국어 원문과 대조하며 원어민 수준의 자연스러운 영어로 다듬습니다.
              영어 자막(.srt)과 ElevenLabs 붙여넣기용 나레이션 대본(.txt)이 함께 생성됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 파일 업로드 + 용어집 */}
      <div className="card p-6">
        <SrtDropzone
          file={file}
          onFile={handleFile}
          onError={setError}
          disabled={isLoading}
          placeholder="한국어 자막 파일(.srt)을 드래그하거나 클릭하여 선택"
          hint="20분~60분 분량 · 최대 1MB"
          fileInfo={blocks.length > 0 ? `${blocks.length}개 자막 블록` : undefined}
        />

        <GlossaryInput value={glossary} onChange={setGlossary} mode="ko-en" disabled={isLoading} />

        <div className="mt-4 flex justify-end gap-2">
          {isLoading && (
            <button onClick={() => abortRef.current?.abort()} className="btn-secondary">
              <Square className="w-4 h-4" />
              중단
            </button>
          )}
          <button onClick={() => run()} disabled={blocks.length === 0 || isLoading} className="btn-primary">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                번역 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                번역 시작
              </>
            )}
          </button>
        </div>

        {isLoading && (
          <ProgressBox
            label="Gemini 1차 번역 → Claude 폴리싱 중... (구간별로 동시에 처리합니다)"
            done={progress?.done}
            total={progress?.total}
          />
        )}
        <ErrorBox message={error} />
      </div>

      {/* 결과 */}
      {translated && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`w-6 h-6 ${missing.length ? 'text-amber-500' : 'text-green-500'}`} />
            <h3 className="font-display font-bold text-lg text-surface-900">
              {missing.length ? '일부 번역 완료' : '번역 완료!'}
            </h3>
            <span className="text-sm text-surface-400">{blocks.length}개 자막 블록</span>
          </div>

          {(missing.length > 0 || messages.length > 0) && (
            <WarningBox>
              {missing.length > 0 && (
                <p>
                  <strong>{missing.length}개 블록이 번역되지 않아 한국어 원문이 그대로 들어가 있습니다.</strong>
                  <br />
                  자막 번호: {formatBlockNumbers(missing.map((i) => blocks[i].index))}
                </p>
              )}
              {messages.map((m) => (
                <p key={m}>{m}</p>
              ))}
              {missing.length > 0 && (
                <button
                  onClick={() => run(missing)}
                  disabled={isLoading}
                  className="btn-secondary text-xs mt-2 !py-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  누락된 {missing.length}개 다시 번역
                </button>
              )}
            </WarningBox>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => downloadText(serializeSrt(outputBlocks), '영어.srt')}
              className="flex items-center gap-3 p-4 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-surface-800">영어.srt</p>
                <p className="text-xs text-surface-400">영어 자막 파일 · 원본: {baseName}</p>
              </div>
            </button>

            <button
              onClick={() => downloadText(generateNarrationScript(outputBlocks), '영어_더빙대본.txt')}
              className="flex items-center gap-3 p-4 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-surface-800">영어_더빙대본.txt</p>
                <p className="text-xs text-surface-400">ElevenLabs 붙여넣기용 (자막 간격 → break 태그)</p>
              </div>
            </button>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-600 hover:text-brand-700 py-2">
              번역 결과 미리보기
            </summary>
            <pre className="mt-2 p-4 bg-surface-50 rounded-xl text-xs text-surface-600 overflow-auto max-h-80 whitespace-pre-wrap font-mono">
              {serializeSrt(outputBlocks)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
