'use client';

import { useRef, useState } from 'react';
import { Search, Loader2, CheckCircle2, Youtube, Copy, Check, Globe, RotateCcw, XCircle, Square } from 'lucide-react';
import { MULTILINGUAL_LANGUAGES, MultiLanguageResult } from '@/types';
import { postJson, runPool } from '@/lib/client-utils';
import { ErrorBox, ProgressBox, WarningBox } from '@/components/shared';

const CONCURRENCY = 5;

type Metadata = { title: string; description: string; thumbnailUrl: string };
type LangOutcome = { status: 'running' } | { status: 'done'; value: MultiLanguageResult } | { status: 'failed'; error: string };

export default function YouTubeTab() {
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, LangOutcome>>({});
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  /** YouTube 영상 정보 가져오기 */
  const fetchMetadata = async () => {
    if (!url.trim()) return;
    setIsFetching(true);
    setError('');
    setMetadata(null);
    setOutcomes({});
    try {
      const data = await postJson<{ metadata: Metadata }>('/api/youtube', { youtubeUrl: url.trim(), action: 'fetch' });
      setMetadata(data.metadata);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  /** 언어별 번역 (codes 미지정 시 전체) */
  const translate = async (codes: string[]) => {
    if (!metadata || codes.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError('');
    setOutcomes((prev) => {
      const next = { ...prev };
      codes.forEach((c) => (next[c] = { status: 'running' }));
      return next;
    });

    await runPool(
      codes.map((code) => async () => {
        try {
          const value = await postJson<MultiLanguageResult>('/api/youtube', {
            action: 'translate',
            title: metadata.title,
            description: metadata.description,
            languageCode: code,
          });
          setOutcomes((prev) => ({ ...prev, [code]: { status: 'done', value } }));
        } catch (err: any) {
          setOutcomes((prev) => ({ ...prev, [code]: { status: 'failed', error: err.message } }));
        }
      }),
      CONCURRENCY,
      controller.signal
    );

    // 중단으로 시작하지 못한 언어는 실패로 표시
    setOutcomes((prev) => {
      const next = { ...prev };
      codes.forEach((c) => {
        if (next[c]?.status === 'running') next[c] = { status: 'failed', error: '중단됨' };
      });
      return next;
    });
    setIsLoading(false);
    abortRef.current = null;
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      setError('클립보드에 복사할 수 없습니다. 브라우저 권한을 확인해주세요.');
    }
  };

  const entries = MULTILINGUAL_LANGUAGES.filter((l) => outcomes[l.code]);
  const doneCount = entries.filter((l) => outcomes[l.code].status !== 'running').length;
  const failedCodes = entries.filter((l) => outcomes[l.code].status === 'failed').map((l) => l.code);
  const successCount = entries.filter((l) => outcomes[l.code].status === 'done').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Youtube className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">YouTube 제목/설명 다국어 번역</h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              YouTube URL을 입력하면 제목과 설명을 자동으로 가져온 후, 34개 언어로 번역합니다. 각 언어별{' '}
              <strong>복사 버튼</strong>으로 유튜브 스튜디오에 바로 붙여넣을 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {/* URL 입력 */}
      <div className="card p-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube 동영상 URL을 붙여넣기 하세요"
            className="input-field flex-1"
            onKeyDown={(e) => e.key === 'Enter' && !isFetching && !isLoading && fetchMetadata()}
          />
          <button onClick={fetchMetadata} disabled={!url.trim() || isFetching || isLoading} className="btn-secondary">
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            가져오기
          </button>
        </div>
        <ErrorBox message={error} />
      </div>

      {/* 영상 정보 미리보기 */}
      {metadata && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <h3 className="font-medium text-surface-800">영상 정보</h3>
          <div className="flex gap-4">
            {metadata.thumbnailUrl && (
              <img src={metadata.thumbnailUrl} alt="썸네일" className="w-40 h-auto rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-surface-900 mb-2">{metadata.title}</p>
              <pre className="text-xs text-surface-500 whitespace-pre-wrap line-clamp-4">{metadata.description}</pre>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {isLoading && (
              <button onClick={() => abortRef.current?.abort()} className="btn-secondary">
                <Square className="w-4 h-4" />
                중단
              </button>
            )}
            <button
              onClick={() => translate(MULTILINGUAL_LANGUAGES.map((l) => l.code))}
              disabled={isLoading}
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
                  34개 언어로 번역
                </>
              )}
            </button>
          </div>
          {isLoading && (
            <ProgressBox label={`번역 중... (${doneCount}/${entries.length} 언어)`} done={doneCount} total={entries.length} />
          )}
        </div>
      )}

      {/* 번역 결과 */}
      {entries.length > 0 && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <h3 className="font-display font-bold text-lg">{successCount}개 언어 번역 완료</h3>
          </div>

          {failedCodes.length > 0 && !isLoading && (
            <WarningBox>
              <p>
                <strong>{failedCodes.length}개 언어 번역 실패</strong> — 아래 빨간색 항목은 복사할 수 없습니다.
              </p>
              <button onClick={() => translate(failedCodes)} className="btn-secondary text-xs mt-2 !py-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                실패한 {failedCodes.length}개 언어 다시 번역
              </button>
            </WarningBox>
          )}

          <div className="space-y-3">
            {entries.map((lang) => {
              const o = outcomes[lang.code];
              if (o.status === 'running') {
                return (
                  <div key={lang.code} className="border border-surface-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-surface-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang.name} 번역 중...
                  </div>
                );
              }
              if (o.status === 'failed') {
                return (
                  <div key={lang.code} className="border border-red-200 bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-red-700">
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">{lang.name}</span>
                    <span className="truncate">번역 실패: {o.error}</span>
                  </div>
                );
              }
              const t = o.value;
              return (
                <div key={lang.code} className="border border-surface-200 rounded-xl overflow-hidden">
                  <div className="bg-surface-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="font-medium text-sm text-surface-700">{t.languageName}</span>
                    <div className="flex gap-2">
                      <CopyButton text={t.title} label="제목 복사" copyKey={`title-${t.languageCode}`} copiedKey={copiedKey} onCopy={copyToClipboard} />
                      <CopyButton text={t.description} label="설명 복사" copyKey={`desc-${t.languageCode}`} copiedKey={copiedKey} onCopy={copyToClipboard} />
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="text-xs text-surface-400 mb-1 block">
                        제목 <span className={t.title.length > 100 ? 'text-red-500' : ''}>({t.title.length}/100자)</span>
                      </label>
                      <p className="text-sm text-surface-800 font-medium">{t.title}</p>
                    </div>
                    <div>
                      <label className="text-xs text-surface-400 mb-1 block">설명</label>
                      <pre className="text-xs text-surface-600 whitespace-pre-wrap max-h-32 overflow-auto">{t.description}</pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 복사 버튼 컴포넌트 */
function CopyButton({ text, label, copyKey, copiedKey, onCopy }: {
  text: string;
  label: string;
  copyKey: string;
  copiedKey: string;
  onCopy: (text: string, key: string) => void;
}) {
  const isCopied = copiedKey === copyKey;
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all
        ${isCopied
          ? 'bg-green-100 text-green-700'
          : 'bg-white text-surface-500 hover:text-surface-700 border border-surface-200 hover:bg-surface-50'}`}
    >
      {isCopied ? (
        <>
          <Check className="w-3 h-3 copy-success" />
          복사됨!
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          {label}
        </>
      )}
    </button>
  );
}
