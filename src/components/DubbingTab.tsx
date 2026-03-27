'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle, Mic, Volume2 } from 'lucide-react';
import { DUBBING_LANGUAGES } from '@/types';

interface DubbingResult {
  languageCode: string;
  languageName: string;
  audioUrl: string;
  filename: string;
}

export default function DubbingTab() {
  // 각 언어별 파일 상태
  const [files, setFiles] = useState<Record<string, File>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [processingLang, setProcessingLang] = useState('');
  const [results, setResults] = useState<DubbingResult[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** 특정 언어에 파일 연결 */
  const handleFileSelect = (languageCode: string, selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.srt')) {
      setErrors((prev) => ({ ...prev, [languageCode]: '.srt 파일만 가능합니다.' }));
      return;
    }
    setFiles((prev) => ({ ...prev, [languageCode]: selectedFile }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[languageCode];
      return next;
    });
  };

  /** 개별 언어 더빙 생성 */
  const generateDubbing = async (languageCode: string) => {
    const file = files[languageCode];
    if (!file) return;

    const lang = DUBBING_LANGUAGES.find((l) => l.code === languageCode);
    if (!lang) return;

    setProcessingLang(lang.name);

    const formData = new FormData();
    formData.append('srtFile', file);
    formData.append('languageCode', languageCode);

    const response = await fetch('/api/dubbing', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '더빙 생성 실패');
    }

    // 오디오 바이너리를 Blob으로 변환
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return {
      languageCode,
      languageName: lang.name,
      audioUrl,
      filename: `${lang.name}.mp3`,
    };
  };

  /** 전체 더빙 시작 */
  const handleGenerateAll = async () => {
    const validLanguages = Object.keys(files);
    if (validLanguages.length === 0) return;

    setIsLoading(true);
    setResults([]);
    setErrors({});
    const newResults: DubbingResult[] = [];

    for (const langCode of validLanguages) {
      try {
        const result = await generateDubbing(langCode);
        if (result) {
          newResults.push(result);
          setResults([...newResults]); // 실시간 업데이트
        }
      } catch (err: any) {
        setErrors((prev) => ({
          ...prev,
          [langCode]: err.message,
        }));
      }
    }

    setProcessingLang('');
    setIsLoading(false);
  };

  /** 오디오 다운로드 */
  const downloadAudio = (audioUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const assignedCount = Object.keys(files).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 설명 */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mic className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-surface-900 mb-1">
              다국어 더빙 생성 (6개 언어)
            </h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              각 언어별 자막(.srt) 파일을 업로드하면 <strong>ElevenLabs</strong> TTS로
              더빙 음성 파일(MP3)을 생성합니다. 각 언어에 맞는 SRT 파일을 지정해주세요.
            </p>
          </div>
        </div>
      </div>

      {/* 언어별 파일 업로드 */}
      <div className="card p-6">
        <h3 className="font-medium text-surface-800 mb-4">
          언어별 SRT 파일 지정 ({assignedCount}/6)
        </h3>

        <div className="space-y-3">
          {DUBBING_LANGUAGES.map((lang) => {
            const assignedFile = files[lang.code];
            const langError = errors[lang.code];

            return (
              <div key={lang.code} className="flex items-center gap-3">
                <div className="w-24 text-sm font-medium text-surface-700 flex-shrink-0">
                  {lang.name}
                </div>

                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept=".srt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(lang.code, f);
                    }}
                  />
                  <div
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors
                    ${assignedFile
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-surface-50 border-surface-200 text-surface-400 hover:bg-surface-100'
                    }`}
                  >
                    {assignedFile ? (
                      <>
                        <FileText className="w-4 h-4" />
                        {assignedFile.name}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        SRT 파일 선택...
                      </>
                    )}
                  </div>
                </label>

                {langError && (
                  <span className="text-xs text-red-500">{langError}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 더빙 생성 버튼 */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleGenerateAll}
            disabled={assignedCount === 0 || isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {processingLang} 더빙 생성 중...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                {assignedCount}개 언어 더빙 생성
              </>
            )}
          </button>
        </div>

        {isLoading && (
          <div className="mt-4 p-4 bg-violet-50 rounded-xl">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
              <p className="text-sm text-violet-700">
                <strong>{processingLang}</strong> 더빙 생성 중...
                ElevenLabs API 호출에 시간이 걸릴 수 있습니다.
              </p>
            </div>
            {results.length > 0 && (
              <p className="mt-2 text-xs text-violet-500">
                {results.length}개 완료 / {assignedCount}개 중
              </p>
            )}
          </div>
        )}
      </div>

      {/* 결과 */}
      {results.length > 0 && (
        <div className="card p-6 space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            <h3 className="font-display font-bold text-lg">
              {results.length}개 더빙 완료!
            </h3>
          </div>

          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.languageCode}
                className="flex items-center gap-4 p-4 bg-surface-50 rounded-xl"
              >
                <Volume2 className="w-5 h-5 text-violet-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-surface-800">{result.filename}</p>
                  <audio controls className="w-full mt-2 h-8" src={result.audioUrl} />
                </div>
                <button
                  onClick={() => downloadAudio(result.audioUrl, result.filename)}
                  className="btn-secondary text-sm"
                >
                  <Download className="w-4 h-4" />
                  다운로드
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
