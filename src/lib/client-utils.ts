// ============================================
// 브라우저 전용 유틸
// ============================================

export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP 상태 코드 → 이해하기 쉬운 한국어 안내 (서버가 JSON이 아닌 오류 페이지를 줄 때) */
function describeStatus(status: number): string {
  if (status === 401) return '로그인이 만료되었습니다. 페이지를 새로고침 후 다시 로그인해주세요.';
  if (status === 413) return '요청 데이터가 너무 큽니다.';
  if (status === 429) return '요청 한도 초과 — 잠시 후 다시 시도해주세요.';
  if (status === 504 || status === 524) return '서버 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
  if (status >= 500) return `서버 오류가 발생했습니다 (${status}).`;
  return `요청 실패 (${status})`;
}

/** 서버 응답 본문에서 오류 메시지 추출 (JSON이 아니어도 안전) */
async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  try {
    const data = JSON.parse(raw);
    if (data?.error) return data.error;
  } catch {
    /* JSON 아님 (Vercel 시간 초과 페이지 등) */
  }
  return describeStatus(response.status);
}

/** 일시적 오류(429/5xx/네트워크)는 자동 재시도하는 fetch */
async function fetchWithRetry(url: string, init: RequestInit, attempts: number): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, init);
      // 일시적 오류만 재시도 (500은 서버가 이미 내부 재시도 후 낸 확정 오류)
      const retryable = [429, 502, 503, 504].includes(response.status);
      if (response.ok || !retryable || i === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) throw new RequestError(0, '네트워크 연결을 확인해주세요.');
    }
    await sleep(2000 * 2 ** i + Math.random() * 1000);
  }
  throw lastError;
}

/** JSON POST → data 반환. 실패 시 RequestError */
export async function postJson<T>(url: string, body: unknown, attempts = 3): Promise<T> {
  const response = await fetchWithRetry(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    attempts
  );
  if (!response.ok) throw new RequestError(response.status, await readError(response));
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(response.status, '서버 응답을 해석할 수 없습니다.');
  }
  if (!data?.success) throw new RequestError(response.status, data?.error || '요청이 실패했습니다.');
  return data.data as T;
}

/** JSON POST → 바이너리(ArrayBuffer) 반환 */
export async function postForBinary(url: string, body: unknown, attempts = 4): Promise<ArrayBuffer> {
  const response = await fetchWithRetry(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    attempts
  );
  if (!response.ok) throw new RequestError(response.status, await readError(response));
  return response.arrayBuffer();
}

/**
 * 동시에 최대 limit개씩 작업 실행. 각 작업의 성공/실패를 개별로 반환.
 * signal로 중단 가능 (남은 작업은 시작하지 않음).
 */
export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal
): Promise<Array<{ ok: true; value: T } | { ok: false; error: Error }>> {
  const results: Array<{ ok: true; value: T } | { ok: false; error: Error }> = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      if (signal?.aborted) {
        results[i] = { ok: false, error: new Error('중단됨') };
        continue;
      }
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error: any) {
        results[i] = { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** Blob 다운로드 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** UTF-8(BOM 포함) 텍스트 파일 다운로드 — 일부 편집 프로그램의 한글/다국어 깨짐 방지 */
export function downloadText(content: string, filename: string) {
  downloadBlob(new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' }), filename);
}

/** 업로드 파일 → 텍스트 (UTF-8 실패 시 한국어 EUC-KR(CP949)로 재시도) */
export async function readSubtitleFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('euc-kr').decode(buffer);
  }
}

/** 16bit 모노 PCM → WAV Blob */
export function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt 청크 크기
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // 바이트/초
  v.setUint16(32, 2, true); // 블록 정렬
  v.setUint16(34, 16, true); // 비트 수
  writeStr(36, 'data');
  v.setUint32(40, dataBytes, true);
  return new Blob([header, samples.buffer as ArrayBuffer], { type: 'audio/wav' });
}

/** 초 → "00:01:23" */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
