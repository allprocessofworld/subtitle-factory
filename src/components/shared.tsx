'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, AlertTriangle, Loader2, BookOpen } from 'lucide-react';

const MAX_FILE_BYTES = 1024 * 1024; // 1MB

// ---- SRT 파일 드롭존 ----

export function SrtDropzone({
  file,
  onFile,
  onError,
  placeholder,
  hint = '최대 1MB',
  fileInfo,
  disabled,
}: {
  file: File | null;
  onFile: (file: File) => void;
  onError: (message: string) => void;
  placeholder: string;
  hint?: string;
  /** 파일 선택 후 표시할 정보 (예: 자막 블록 수) */
  fileInfo?: string;
  disabled?: boolean;
}) {
  const onDrop = useCallback(
    (accepted: File[], rejected: { file: File }[]) => {
      const picked = accepted[0] || rejected[0]?.file;
      if (!picked) return;
      if (!picked.name.toLowerCase().endsWith('.srt')) {
        onError('.srt 파일만 업로드할 수 있습니다.');
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        onError('파일 크기가 1MB를 초과합니다.');
        return;
      }
      onFile(picked);
    },
    [onFile, onError]
  );

  // .srt는 브라우저마다 MIME 타입이 제각각이라 확장자로만 검사
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/x-subrip': ['.srt'], 'text/plain': ['.srt'] },
    maxFiles: 1,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${file ? 'border-green-300 bg-green-50/30' : ''} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />
      {file ? (
        <>
          <FileText className="w-10 h-10 text-green-500" />
          <p className="font-medium text-surface-700">{file.name}</p>
          <p className="text-sm text-surface-400">
            {(file.size / 1024).toFixed(1)}KB{fileInfo ? ` · ${fileInfo}` : ''} · 클릭하여 다른 파일 선택
          </p>
        </>
      ) : (
        <>
          <Upload className="w-10 h-10 text-surface-400" />
          <p className="font-medium text-surface-600">{placeholder}</p>
          <p className="text-sm text-surface-400">{hint}</p>
        </>
      )}
    </div>
  );
}

// ---- 진행률 / 오류 / 경고 ----

export function ProgressBox({ label, done, total, tone = 'blue' }: {
  label: string;
  done?: number;
  total?: number;
  tone?: 'blue' | 'violet';
}) {
  const pct = total ? Math.round(((done || 0) / total) * 100) : null;
  const color = tone === 'violet'
    ? { bg: 'bg-violet-50', text: 'text-violet-700', icon: 'text-violet-600', bar: 'bg-violet-500' }
    : { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600', bar: 'bg-blue-500' };
  return (
    <div className={`mt-4 p-4 ${color.bg} rounded-xl`}>
      <div className="flex items-center gap-3">
        <Loader2 className={`w-5 h-5 ${color.icon} animate-spin flex-shrink-0`} />
        <p className={`text-sm ${color.text} flex-1`}>{label}</p>
        {pct !== null && <span className={`text-sm font-medium ${color.text}`}>{pct}%</span>}
      </div>
      {pct !== null && (
        <div className="mt-3 h-1.5 bg-white rounded-full overflow-hidden">
          <div className={`h-full ${color.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mt-4 flex items-start gap-3 p-4 bg-red-50 rounded-xl">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 whitespace-pre-wrap">{message}</p>
    </div>
  );
}

export function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl text-sm text-amber-800">
      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">{children}</div>
    </div>
  );
}

/** 누락된 자막 번호를 "3, 15, 16 … 외 12개" 형태로 */
export function formatBlockNumbers(numbers: number[], max = 15): string {
  const head = numbers.slice(0, max).join(', ');
  return numbers.length > max ? `${head} … 외 ${numbers.length - max}개` : head;
}

// ---- 용어집 입력 ----

export const GLOSSARY_PRESETS: Record<string, { label: string; ko: string; en: string }> = {
  ceramics: {
    label: '도자기·세라믹',
    ko: [
      '슬립 = slip (ceramic casting liquid)',
      '드레인 캐스팅 = drain casting',
      '솔리드 캐스팅 = solid casting',
      '초벌 소성 = bisque firing',
      '시유 = glazing',
      '파팅 라인 = parting line',
      '석고 몰드 = plaster mold',
      '포트밀 = pot mill / ball mill',
      '유약 = glaze',
      '가마 = kiln',
      '기물 = ware / piece',
      '정형 = trimming / fettling',
      '연마 = grinding / polishing',
    ].join('\n'),
    en: ['slip', 'drain casting', 'solid casting', 'bisque firing', 'glazing', 'parting line', 'plaster mold', 'ball mill', 'glaze', 'kiln', 'fettling'].join('\n'),
  },
};

/**
 * 용어집 입력란 (영상마다 지정, 브라우저에 최근 값 기억)
 * mode='ko-en': "한국어 = 영어" / mode='en': 영어 기술 용어 목록
 */
export function GlossaryInput({
  value,
  onChange,
  mode,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: 'ko-en' | 'en';
  disabled?: boolean;
}) {
  const storageKey = `subtitle-factory:glossary:${mode}`;
  const [loaded, setLoaded] = useState(false);

  // 최근 입력값 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && !value) onChange(saved);
    } catch {
      /* 저장소 사용 불가 — 무시 */
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 변경 시 저장
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* 무시 */
    }
  }, [value, loaded, storageKey]);

  const lineCount = value.split('\n').filter((l) => l.trim()).length;

  return (
    <details className="group mt-4" open={lineCount > 0}>
      <summary className="cursor-pointer text-sm font-medium text-surface-700 flex items-center gap-2 py-1">
        <BookOpen className="w-4 h-4 text-brand-500" />
        용어집 {lineCount > 0 ? `(${lineCount}개)` : '(선택)'}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-surface-400">
          {mode === 'ko-en'
            ? '한 줄에 하나씩 "한국어 = 영어" 형식으로 입력하세요. 번역 시 반드시 이 용어를 사용합니다. 예) 사출 성형 = injection molding'
            : '이 영상의 핵심 영어 기술 용어를 한 줄에 하나씩 입력하세요. 모든 언어에서 정확하고 일관되게 번역합니다. 예) injection molding'}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          maxLength={5000}
          disabled={disabled}
          placeholder={mode === 'ko-en' ? '사출 성형 = injection molding\n금형 = mold' : 'injection molding\nmold'}
          className="input-field font-mono text-xs"
        />
        <div className="flex gap-2 text-xs">
          <span className="text-surface-400">프리셋:</span>
          {Object.entries(GLOSSARY_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode === 'ko-en' ? preset.ko : preset.en)}
              className="text-brand-600 hover:text-brand-700 font-medium"
            >
              {preset.label}
            </button>
          ))}
          <span className="text-surface-300">|</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('')}
            className="text-surface-500 hover:text-surface-700 font-medium"
          >
            비우기
          </button>
        </div>
      </div>
    </details>
  );
}
