// ============================================
// API: 한국어 → 영어 번역 (자막 한 구간 단위)
// ============================================
// 브라우저가 SRT를 구간(최대 150줄)으로 나눠 여러 번 호출한다 → 서버 시간 제한에 걸리지 않음.
// 1단계: Gemini 1차 번역 (정확한 기술 용어)
// 2단계: Claude 폴리싱 (한국어 원문 + 1차 번역을 함께 보고 자연스러운 영어로)
// Claude 단계가 실패한 줄은 Gemini 1차 번역으로 대체한다.

import { NextRequest, NextResponse } from 'next/server';
import { callGemini, callClaude } from '@/lib/ai-clients';
import { getKoToEnTranslationPrompt, getEnPolishingPrompt } from '@/lib/prompts';
import {
  requireSession, readJson, validateTexts, optionalString, optionalContext,
  runNumberedTask, errorResponse, MAX_GLOSSARY_CHARS,
} from '@/lib/server-utils';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await readJson(request);
    const texts = validateTexts(body.texts);
    const glossary = optionalString(body.glossary, MAX_GLOSSARY_CHARS);
    const contextBefore = optionalContext(body.contextBefore);

    // 1단계 — Gemini 1차 번역
    const draft = await runNumberedTask(
      texts,
      (numbered) => getKoToEnTranslationPrompt(numbered, glossary, contextBefore),
      (prompt) => callGemini(prompt)
    );

    // 2단계 — Claude 폴리싱 (1차 번역이 있는 줄만)
    let polished: string[] = draft.texts.slice();
    let polishWarning: string | undefined;
    const polishIdx = draft.texts.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);

    if (polishIdx.length > 0) {
      const paired = polishIdx.map((i) => `KO: ${texts[i]}\n    EN: ${draft.texts[i]}`);
      try {
        const result = await runNumberedTask(
          paired,
          (numbered) => getEnPolishingPrompt(numbered, glossary, contextBefore),
          (prompt) => callClaude(prompt)
        );
        polishIdx.forEach((originalIndex, j) => {
          if (result.texts[j]) polished[originalIndex] = result.texts[j];
        });
        if (result.missing.length > 0) {
          polishWarning = `${result.missing.length}줄은 Claude 폴리싱이 빠져 1차 번역을 사용했습니다.`;
        }
      } catch (error: any) {
        // Claude 장애 시 전체 실패 대신 1차 번역으로 진행
        console.error('[Claude 폴리싱 실패 — 1차 번역 사용]', error);
        polishWarning = `Claude 폴리싱 실패로 이 구간은 Gemini 1차 번역을 사용했습니다. (${error.message})`;
        polished = draft.texts.slice();
      }
    }

    return NextResponse.json({
      success: true,
      data: { texts: polished, missing: draft.missing, warning: polishWarning },
    });
  } catch (error) {
    return errorResponse(error, 'KO→EN 번역 오류');
  }
}
