// ============================================
// 브라우저 전용: 자막을 구간으로 나눠 API에 병렬 요청하고 결과를 합친다
// ============================================

import { ChunkResult } from '@/types';
import { chunk } from '@/lib/srt-utils';
import { postJson, runPool } from '@/lib/client-utils';

export interface ChunkedOptions {
  /** API 경로 */
  endpoint: string;
  /** 전체 원문 (자막 블록 순서) */
  sources: string[];
  /** 처리할 블록 인덱스 (기본: 전체). 재시도 시 누락분만 지정 */
  indices?: number[];
  /** texts 외에 함께 보낼 값 (용어집, 언어 코드 등) */
  extraBody?: Record<string, unknown>;
  /** 한 요청당 줄 수 */
  chunkSize: number;
  /** 동시 요청 수 */
  concurrency: number;
  /** 진행 상황 콜백 (완료 구간 수, 전체 구간 수) */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ChunkedResult {
  /** sources와 같은 길이. 실패/누락 줄은 '' */
  texts: string[];
  /** 결과가 없는 블록 인덱스 */
  missing: number[];
  /** 구간 실패 오류·경고 메시지 (중복 제거) */
  messages: string[];
}

/** 문맥으로 함께 보낼 앞 구간 줄 수 */
const CONTEXT_LINES = 3;

export async function translateInChunks(opts: ChunkedOptions, previous?: string[]): Promise<ChunkedResult> {
  const { endpoint, sources, extraBody = {}, chunkSize, concurrency, onProgress, signal } = opts;
  const indices = opts.indices ?? sources.map((_, i) => i);
  const texts = previous ? previous.slice() : new Array(sources.length).fill('');
  const messages = new Set<string>();

  const groups = chunk(indices, chunkSize);
  let done = 0;
  onProgress?.(0, groups.length);

  const results = await runPool(
    groups.map((group) => async () => {
      const first = group[0];
      const contextBefore = sources.slice(Math.max(0, first - CONTEXT_LINES), first);
      const data = await postJson<ChunkResult>(endpoint, {
        ...extraBody,
        texts: group.map((i) => sources[i]),
        contextBefore,
      });
      group.forEach((blockIndex, j) => {
        if (data.texts[j]) texts[blockIndex] = data.texts[j];
      });
      if (data.warning) messages.add(data.warning);
      done++;
      onProgress?.(done, groups.length);
    }),
    concurrency,
    signal
  );

  results.forEach((r) => {
    if (!r.ok) messages.add(r.error.message);
  });

  const missing = indices.filter((i) => !texts[i]);
  return { texts, missing, messages: Array.from(messages) };
}
