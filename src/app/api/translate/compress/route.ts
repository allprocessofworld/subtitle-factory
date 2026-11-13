// ============================================
// API: 영어 자막 압축 (다국어 번역 전처리, 자막 한 구간 단위)
// ============================================
// 다국어 번역 시 글자 수 초과를 막기 위해 영어 문장을 15~20% 줄인다.
// 압축이 빠진 줄은 클라이언트에서 원문 영어를 그대로 번역 소스로 사용한다.

import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai-clients';
import { getEnCompressionPrompt } from '@/lib/prompts';
import {
  requireSession, readJson, validateTexts, optionalContext, runNumberedTask, errorResponse,
} from '@/lib/server-utils';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await readJson(request);
    const texts = validateTexts(body.texts);
    const contextBefore = optionalContext(body.contextBefore);

    const result = await runNumberedTask(
      texts,
      (numbered) => getEnCompressionPrompt(numbered, contextBefore),
      (prompt) => callGemini(prompt)
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error, '영어 압축 오류');
  }
}
