// ============================================
// API: 한국어 → 영어 번역 + SSML 생성
// ============================================
// 2단계 파이프라인:
// 1단계: Gemini로 1차 번역 (정확한 기술 용어)
// 2단계: Claude로 영어 폴리싱 (자연스러운 표현)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { parseSrt, serializeSrt, extractTexts, parseTranslatedResponse, mapTranslatedTexts, generateSSML } from '@/lib/srt-utils';
import { callGemini, callClaude } from '@/lib/ai-clients';
import { getKoToEnTranslationPrompt, getEnPolishingPrompt } from '@/lib/prompts';

export const maxDuration = 300; // Vercel Pro: 최대 5분 (무료는 60초)

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 2. 요청 데이터 파싱
    const formData = await request.formData();
    const file = formData.get('srtFile') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'SRT 파일이 필요합니다.' }, { status: 400 });
    }

    // 3. 파일 크기 검증 (최대 1MB)
    if (file.size > 1024 * 1024) {
      return NextResponse.json({ success: false, error: '파일 크기가 1MB를 초과합니다.' }, { status: 400 });
    }

    const srtContent = await file.text();
    const blocks = parseSrt(srtContent);

    if (blocks.length === 0) {
      return NextResponse.json({ success: false, error: 'SRT 파일을 파싱할 수 없습니다. 형식을 확인해주세요.' }, { status: 400 });
    }

    // 4. 텍스트 추출
    const textsForTranslation = extractTexts(blocks);

    // 5. 1단계 — Gemini로 1차 번역 (기술 용어 정확성)
    const geminiPrompt = getKoToEnTranslationPrompt(textsForTranslation);
    const rawTranslation = await callGemini(geminiPrompt);

    // 6. 2단계 — Claude로 폴리싱 (자연스러운 영어)
    const polishPrompt = getEnPolishingPrompt(rawTranslation);
    const polishedTranslation = await callClaude(polishPrompt);

    // 7. 번역 결과를 SRT 블록에 매핑
    const translatedTexts = parseTranslatedResponse(polishedTranslation, blocks.length);
    const translatedBlocks = mapTranslatedTexts(blocks, translatedTexts);

    // 8. 영어 SRT 파일 생성
    const translatedSrt = serializeSrt(translatedBlocks);

    // 9. SSML 생성 (ElevenLabs 더빙용)
    const ssml = generateSSML(translatedBlocks);

    return NextResponse.json({
      success: true,
      data: {
        translatedSrt,
        ssml,
        blockCount: blocks.length,
        srtFilename: '영어.srt',
        ssmlFilename: '영어_더빙용.ssml',
      },
    });
  } catch (error: any) {
    console.error('[KO→EN 번역 오류]', error);
    return NextResponse.json(
      { success: false, error: error.message || '번역 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
