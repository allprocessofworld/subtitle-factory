'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle, Globe, Package } from 'lucide-react';
import { MULTILINGUAL_LANGUAGES } from '@/types';
import JSZip from 'jszip';

interface TranslatedFile {
  languageCode: string;
  languageName: string;
  srt: string;
  filename: string;
}

export default function EnToMultiTab() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    MULTILINGUAL_LANGUAGES.map((l) => l.code)
  );
  const [results, setResults] = useState<TranslatedFile[]>([]);
  const [failedLanguages, setFailedLanguages] = useState<string[]>([]);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const srtFile = acceptedFiles[0];
    if (srtFile) {
      if (!srtFile.name.toLowerCase().endsWith('.srt')) {
        setError('.srt 파일만 업로드할 수 있습니다.');
        return;
      }
      setFile(srtFile);
      setResults([]);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/srt': ['.srt'] },
    maxFiles: 1,
    maxSize: 1024 * 1024,
  });

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectAll = () => setSelectedLanguages(MULTILINGUAL_LANGUAGES.map((l) => l.code));
  const deselectAll = () => setSelectedLanguages([]);

  const handleTranslate = async () => {
    if (!file || selectedLanguages.length === 0) return;

    setIsLoading(true);
    setError('');
    setResults([]);
    setProgress(`${selectedLanguages.length}개 언어 번역 준비 중...`);

    try {
      const formData = new FormData();
      formData.append('srtFile', file);
      formData.append('languages', selectedLanguages.join(','));

      setProgress('영어 문장 압축 → 다국어 번역 진행 중... (1~3분 소요)');

      const response = await fetch('/api/translate/en-to-multi', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setResults(data.data.files);
      setFailedLanguages(data.data.failedLanguages || []);
      setProgress('');
    } catch (err: any) {
      setError(err.message || '번역 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /** 개별 SRT 다운로드 */
  const downloadSingle = (content: string, filename: string) => {
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

  /** 전체 ZIP 다운로드 */
  const downloadAll = async () => {
    const zip = new JSZip();
    for (const file of results) {
      // BOM + SRT 내용
      zip.file(file.filename, '\uFEFF' + file.srt);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '다국어_자막.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
              영어 → 다국어 번역 (34개 언어)
            </h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              영어 자막(.srt)을 업로드하면 다국어 번역 시 글자 수 초과를 방지하기 위해
              먼저 <strong>영어 문장을 압축</strong>한 후, 선택한 언어들로 번역합니다.
              모든 번역은 <strong>Gemini</strong>로 처리되어 비용이 매우 저렴합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 파일 업로드 */}
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
                {(file.size / 1024).toFixed(1)}KB · 클릭하여 변경
              </p>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-surface-400" />
              <p className="font-medium text-surface-600">
                영어 자막 파일(.srt)을 드래그하거나 클릭
              </p>
              <p className="text-sm text-surface-400">최대 1MB</p>
            </>
          )}
        </div>
      </div>

      {/* 언어 선택 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-surface-800">
            번역 언어 선택 ({selectedLanguages.length}/{MULTILINGUAL_LANGUAGES.length})
          </h3>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
              전체 선택
            </button>
            <span className="text-surface-300">|</span>
            <button onClick={deselectAll} className="text-xs text-surface-500 hover:text-surface-700 font-medium">
              전체 해제
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {MULTILINGUAL_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguages.includes(lang.code);
            return (
              <button
                key={lang.code}
                onClick={() => toggleLanguage(lang.code)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition-all
                  ${isSelected 
                    ? 'bg-brand-50 text-brand-700 border border-brand-200 font-medium' 
                    : 'bg-surface-50 text-surface-500 border border-transparent hover:bg-surface-100'
                  }`}
              >
                {lang.name}
              </button>
            );
          })}
        </div>

        {/* 번역 버튼 */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleTranslate}
            disabled={!file || isLoading || selectedLanguages.length === 0}
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

        {progress && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700">{progress}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-3 p-4 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* 결과 */}
      {results.length > 0 && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <h3 className="font-display font-bold text-lg">
                {results.length}개 언어 번역 완료!
              </h3>
            </div>
            <button onClick={downloadAll} className="btn-primary">
              <Package className="w-4 h-4" />
              전체 ZIP 다운로드
            </button>
          </div>

          {failedLanguages.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
              ⚠️ 번역 실패: {failedLanguages.join(', ')}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {results.map((file) => (
              <button
                key={file.languageCode}
                onClick={() => downloadSingle(file.srt, file.filename)}
                className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl
                           hover:bg-surface-100 transition-colors text-left text-sm"
              >
                <Download className="w-4 h-4 text-brand-500 flex-shrink-0" />
                <span className="text-surface-700 truncate">{file.filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
