// ============================================
// API: 영어 → 다국어 번역 (34개 언어)
// ============================================
// 2단계 파이프라인:
// 1단계: 영어 자막 문장 압축 (다국어 번역 시 길이 초과 방지)
// 2단계: 압축된 영어 → 각 언어별 번역
// 
// 비용 최적화: Gemini 2.0 Flash 사용 (100만 토큰당 혼합 $0.25)
// 34개 언어 × 20분 자막 ≈ 총 $0.30 미만

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseSrt, serializeSrt, extractTexts, parseTranslatedResponse, mapTranslatedTexts } from '@/lib/srt-utils';
import { callGemini } from '@/lib/ai-clients';
import { getEnCompressionPrompt, getMultilingualTranslationPrompt } from '@/lib/prompts';
import { MULTILINGUAL_LANGUAGES } from '@/types';

export const maxDuration = 300;

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
    const selectedLanguages = formData.get('languages') as string; // 쉼표 구분 언어코드

    if (!file) {
      return NextResponse.json({ success: false, error: '영어 SRT 파일이 필요합니다.' }, { status: 400 });
    }

    const srtContent = await file.text();
    const blocks = parseSrt(srtContent);

    if (blocks.length === 0) {
      return NextResponse.json({ success: false, error: 'SRT 파일을 파싱할 수 없습니다.' }, { status: 400 });
    }

    // 3. 번역 대상 언어 목록 결정
    const targetLanguageCodes = selectedLanguages
      ? selectedLanguages.split(',').map((c) => c.trim())
      : MULTILINGUAL_LANGUAGES.map((l) => l.code);

    const targetLanguages = MULTILINGUAL_LANGUAGES.filter((l) =>
      targetLanguageCodes.includes(l.code)
    );

    // 4. 1단계 — 영어 문장 압축 (다국어 번역 전처리)
    const originalTexts = extractTexts(blocks);
    const compressionPrompt = getEnCompressionPrompt(originalTexts);
    const compressedResponse = await callGemini(compressionPrompt);
    const compressedTexts = parseTranslatedResponse(compressedResponse, blocks.length);

    // 압축된 텍스트를 새 블록에 매핑 (번역 소스로 사용)
    const compressedBlocks = mapTranslatedTexts(blocks, compressedTexts);
    const compressedExtracted = extractTexts(compressedBlocks);

    // 5. 2단계 — 각 언어별 번역 (병렬 처리, 최대 5개씩)
    const results: Record<string, string> = {};
    const BATCH_SIZE = 5; // 동시 요청 제한 (레이트 리밋 방지)

    for (let i = 0; i < targetLanguages.length; i += BATCH_SIZE) {
      const batch = targetLanguages.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (lang) => {
        const prompt = getMultilingualTranslationPrompt(
          compressedExtracted,
          lang.nameEn,
          lang.code
        );
        
        try {
          const translated = await callGemini(prompt);
          const translatedTexts = parseTranslatedResponse(translated, blocks.length);
          const translatedBlocks = mapTranslatedTexts(blocks, translatedTexts);
          
          return {
            code: lang.code,
            name: lang.name,
            srt: serializeSrt(translatedBlocks),
          };
        } catch (error: any) {
          console.error(`[${lang.name} 번역 실패]`, error.message);
          return {
            code: lang.code,
            name: lang.name,
            srt: null,
            error: error.message,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.srt) {
          results[result.code] = result.srt;
        }
      }

      // 배치 간 1초 딜레이 (레이트 리밋 방지)
      if (i + BATCH_SIZE < targetLanguages.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // 6. 결과 반환
    const translatedFiles = Object.entries(results).map(([code, srt]) => {
      const lang = MULTILINGUAL_LANGUAGES.find((l) => l.code === code);
      return {
        languageCode: code,
        languageName: lang?.name || code,
        srt,
        filename: `${lang?.name || code}.srt`,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        files: translatedFiles,
        totalLanguages: targetLanguages.length,
        successCount: translatedFiles.length,
        failedLanguages: targetLanguages
          .filter((l) => !results[l.code])
          .map((l) => l.name),
      },
    });
  } catch (error: any) {
    console.error('[다국어 번역 오류]', error);
    return NextResponse.json(
      { success: false, error: error.message || '번역 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
