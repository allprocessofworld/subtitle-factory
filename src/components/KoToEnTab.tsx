'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export default function KoToEnTab() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{
    translatedSrt: string;
    ssml: string;
    blockCount: number;
    srtFilename: string;
    ssmlFilename: string;
  } | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const srtFile = acceptedFiles[0];
    if (srtFile) {
      // .srt 확장자 검증
      if (!srtFile.name.toLowerCase().endsWith('.srt')) {
        setError('.srt 파일만 업로드할 수 있습니다.');
        return;
      }
      setFile(srtFile);
      setResult(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/srt': ['.srt'], 'application/x-subrip': ['.srt'] },
    maxFiles: 1,
    maxSize: 1024 * 1024, // 1MB
  });

  const handleTranslate = async () => {
    if (!file) return;

    setIsLoading(true);
    setError('');
    setProgress('Gemini로 1차 번역 중...');

    try {
      const formData = new FormData();
      formData.append('srtFile', file);

      setProgress('Gemini 1차 번역 → Claude 폴리싱 중...');

      const response = await fetch('/api/translate/ko-to-en', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '번역에 실패했습니다.');
      }

      setResult(data.data);
      setProgress('');
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /** 파일 다운로드 헬퍼 */
  const downloadFile = (content: string, filename: string) => {
    // BOM 추가 (한국어 파일명 호환)
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 카드 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
              한국어 → 영어 번역
            </h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              한국어 자막(.srt)을 업로드하면 <strong>Gemini</strong>로 정확한 기술 용어를 번역하고,
              <strong> Claude</strong>로 원어민 수준의 자연스러운 영어로 폴리싱합니다.
              영어 자막(.srt)과 ElevenLabs 더빙용 SSML 파일이 함께 생성됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 파일 업로드 영역 */}
      <div className="card p-6">
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${file ? 'border-green-300 bg-green-50/30' : ''}`}
        >
          <input {...getInputProps()} />
          {file ? (
            <>
              <FileText className="w-10 h-10 text-green-500" />
              <p className="font-medium text-surface-700">{file.name}</p>
              <p className="text-sm text-surface-400">
                {(file.size / 1024).toFixed(1)}KB · 클릭하여 다른 파일 선택
              </p>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-surface-400" />
              <p className="font-medium text-surface-600">
                한국어 자막 파일(.srt)을 드래그하거나 클릭하여 선택
              </p>
              <p className="text-sm text-surface-400">
                20분~60분 분량 · 최대 1MB
              </p>
            </>
          )}
        </div>

        {/* 번역 버튼 */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleTranslate}
            disabled={!file || isLoading}
            className="btn-primary"
          >
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

        {/* 진행 상태 */}
        {progress && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700">{progress}</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <h3 className="font-display font-bold text-lg text-surface-900">
              번역 완료!
            </h3>
            <span className="text-sm text-surface-400">
              {result.blockCount}개 자막 블록
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 영어 SRT 다운로드 */}
            <button
              onClick={() => downloadFile(result.translatedSrt, result.srtFilename)}
              className="flex items-center gap-3 p-4 bg-surface-50 rounded-xl
                         hover:bg-surface-100 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-surface-800">{result.srtFilename}</p>
                <p className="text-xs text-surface-400">영어 자막 파일</p>
              </div>
            </button>

            {/* SSML 다운로드 */}
            <button
              onClick={() => downloadFile(result.ssml, result.ssmlFilename)}
              className="flex items-center gap-3 p-4 bg-surface-50 rounded-xl
                         hover:bg-surface-100 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Download className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-surface-800">{result.ssmlFilename}</p>
                <p className="text-xs text-surface-400">ElevenLabs 더빙용 SSML</p>
              </div>
            </button>
          </div>

          {/* 미리보기 */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-600 hover:text-brand-700 py-2">
              번역 결과 미리보기
            </summary>
            <pre className="mt-2 p-4 bg-surface-50 rounded-xl text-xs text-surface-600 
                            overflow-auto max-h-80 whitespace-pre-wrap font-mono">
              {result.translatedSrt}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
