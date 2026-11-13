// ============================================
// API 라우트 공통 유틸 (서버 전용)
// ============================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { numberTexts, parseNumberedResponse } from '@/lib/srt-utils';

/** 한 번의 요청으로 받을 수 있는 자막 줄 수 / 글자 수 상한 (남용·과금 폭주 방지) */
export const MAX_LINES_PER_REQUEST = 150;
export const MAX_CHARS_PER_REQUEST = 30000;
export const MAX_GLOSSARY_CHARS = 5000;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 로그인 세션 확인 — 없으면 401 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new HttpError(401, '로그인이 필요합니다. 페이지를 새로고침 후 다시 로그인해주세요.');
  return session;
}

/** 공통 오류 응답 */
export function errorResponse(error: any, logLabel: string) {
  if (error instanceof HttpError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(`[${logLabel}]`, error);
  return NextResponse.json(
    { success: false, error: error?.message || '처리 중 오류가 발생했습니다.' },
    { status: 500 }
  );
}

/** 요청 본문 JSON 파싱 */
export async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  }
}

/** 문자열 배열 검증 */
export function validateTexts(value: unknown, field = 'texts'): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string')) {
    throw new HttpError(400, `${field} 값이 올바르지 않습니다.`);
  }
  if (value.length > MAX_LINES_PER_REQUEST) {
    throw new HttpError(400, `한 번에 최대 ${MAX_LINES_PER_REQUEST}줄까지 처리할 수 있습니다.`);
  }
  const totalChars = value.reduce((sum, t) => sum + t.length, 0);
  if (totalChars > MAX_CHARS_PER_REQUEST) {
    throw new HttpError(400, '요청한 자막 분량이 너무 큽니다.');
  }
  return value as string[];
}

/** 선택 입력값(용어집 등) 검증 */
export function optionalString(value: unknown, maxChars: number): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, '입력값 형식이 올바르지 않습니다.');
  return value.slice(0, maxChars);
}

/** 문맥용 앞 구간 줄 (최대 5줄) */
export function optionalContext(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v): v is string => typeof v === 'string')
    .slice(-5)
    .map((v) => v.slice(0, 500));
}

/**
 * 번호 매긴 텍스트를 AI에 보내고 결과를 같은 순서의 배열로 돌려받는다.
 * 응답에서 빠진 번호가 있으면, 빠진 줄만 모아 한 번 더 요청한다.
 * 그래도 빠진 줄은 missing(0부터 시작하는 인덱스)으로 보고한다.
 */
export async function runNumberedTask(
  sourceTexts: string[],
  buildPrompt: (numbered: string) => string,
  call: (prompt: string) => Promise<string>
): Promise<{ texts: string[]; missing: number[] }> {
  const first = await call(buildPrompt(numberTexts(sourceTexts)));
  const texts = parseNumberedResponse(first, sourceTexts.length);

  let missing = texts.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
  if (missing.length > 0) {
    try {
      const retrySources = missing.map((i) => sourceTexts[i]);
      const retry = await call(buildPrompt(numberTexts(retrySources)));
      const retryTexts = parseNumberedResponse(retry, retrySources.length);
      missing.forEach((originalIndex, j) => {
        if (retryTexts[j]) texts[originalIndex] = retryTexts[j];
      });
    } catch (error) {
      console.error('[누락 줄 재요청 실패]', error);
    }
    missing = texts.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
  }

  return { texts, missing };
}
