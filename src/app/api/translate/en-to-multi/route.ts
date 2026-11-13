// ============================================
// API: 영어 → 한 개 언어 번역 (자막 한 구간 단위)
// ============================================
// 브라우저가 (언어 × 구간) 단위로 동시에 여러 번 호출한다.
// → 34개 언어를 한 요청에 몰아 처리하던 방식의 시간 초과 문제 해결,
//   일부 언어가 실패해도 나머지는 정상 완료되고 실패 언어만 다시 시도 가능.

import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai-clients';
import { getMultilingualTranslationPrompt } from '@/lib/prompts';
import { MULTILINGUAL_LANGUAGES } from '@/types';
import {
  requireSession, readJson, validateTexts, optionalString, optionalContext,
  runNumberedTask, errorResponse, HttpError, MAX_GLOSSARY_CHARS,
} from '@/lib/server-utils';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await readJson(request);
    const texts = validateTexts(body.texts);
    const glossary = optionalString(body.glossary, MAX_GLOSSARY_CHARS);
    const contextBefore = optionalContext(body.contextBefore);

    const lang = MULTILINGUAL_LANGUAGES.find((l) => l.code === body.languageCode);
    if (!lang) throw new HttpError(400, `지원하지 않는 언어 코드: ${body.languageCode}`);

    const result = await runNumberedTask(
      texts,
      (numbered) => getMultilingualTranslationPrompt(numbered, lang.nameEn, lang.code, glossary, contextBefore),
      (prompt) => callGemini(prompt)
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error, '다국어 번역 오류');
  }
}
