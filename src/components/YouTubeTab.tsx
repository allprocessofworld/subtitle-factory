'use client';

import { useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, Youtube, Copy, Check, Globe } from 'lucide-react';
import { MultiLanguageResult } from '@/types';

export default function YouTubeTab() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [metadata, setMetadata] = useState<{ title: string; description: string; thumbnailUrl: string } | null>(null);
  const [translations, setTranslations] = useState<MultiLanguageResult[]>([]);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  /** YouTube 영상 정보 가져오기 */
  const fetchMetadata = async () => {
    if (!url.trim()) return;
    
    setIsFetching(true);
    setError('');
    setMetadata(null);
    setTranslations([]);

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: url, action: 'fetch' }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setMetadata(data.data.metadata);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  /** 다국어 번역 실행 */
  const translateAll = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: url, action: 'translate' }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setMetadata(data.data.metadata);
      setTranslations(data.data.translations);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /** 클립보드 복사 */
  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Youtube className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
              YouTube 제목/설명 다국어 번역
            </h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              YouTube URL을 입력하면 제목과 설명을 자동으로 가져온 후,
              34개 언어로 번역합니다. 각 언어별 <strong>복사 버튼</strong>으로
              유튜브 스튜디오에 바로 붙여넣을 수 있습니다.
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
            onKeyDown={(e) => e.key === 'Enter' && fetchMetadata()}
          />
          <button
            onClick={fetchMetadata}
            disabled={!url.trim() || isFetching}
            className="btn-secondary"
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            가져오기
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* 영상 정보 미리보기 */}
      {metadata && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <h3 className="font-medium text-surface-800">영상 정보</h3>

          <div className="flex gap-4">
            {metadata.thumbnailUrl && (
              <img
                src={metadata.thumbnailUrl}
                alt="썸네일"
                className="w-40 h-auto rounded-xl object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-surface-900 mb-2">{metadata.title}</p>
              <pre className="text-xs text-surface-500 whitespace-pre-wrap line-clamp-4">
                {metadata.description}
              </pre>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={translateAll}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  34개 언어 번역 중... (1~3분 소요)
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  34개 언어로 번역
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 번역 결과 */}
      {translations.length > 0 && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <h3 className="font-display font-bold text-lg">
              {translations.length}개 언어 번역 완료!
            </h3>
          </div>

          <div className="space-y-3">
            {translations.map((t) => (
              <div
                key={t.languageCode}
                className="border border-surface-200 rounded-xl overflow-hidden"
              >
                {/* 언어 헤더 */}
                <div className="bg-surface-50 px-4 py-2.5 flex items-center justify-between">
                  <span className="font-medium text-sm text-surface-700">
                    {t.languageName}
                  </span>
                  <div className="flex gap-2">
                    <CopyButton
                      text={t.title}
                      label="제목 복사"
                      copyKey={`title-${t.languageCode}`}
                      copiedKey={copiedKey}
                      onCopy={copyToClipboard}
                    />
                    <CopyButton
                      text={t.description}
                      label="설명 복사"
                      copyKey={`desc-${t.languageCode}`}
                      copiedKey={copiedKey}
                      onCopy={copyToClipboard}
                    />
                  </div>
                </div>

                {/* 번역 내용 */}
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-xs text-surface-400 mb-1 block">제목</label>
                    <p className="text-sm text-surface-800 font-medium">{t.title}</p>
                  </div>
                  <div>
                    <label className="text-xs text-surface-400 mb-1 block">설명</label>
                    <pre className="text-xs text-surface-600 whitespace-pre-wrap max-h-32 overflow-auto">
                      {t.description}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 복사 버튼 컴포넌트 */
function CopyButton({
  text,
  label,
  copyKey,
  copiedKey,
  onCopy,
}: {
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
          : 'bg-white text-surface-500 hover:text-surface-700 border border-surface-200 hover:bg-surface-50'
        }`}
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
