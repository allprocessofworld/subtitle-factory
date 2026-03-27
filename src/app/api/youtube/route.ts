// ============================================
// API: YouTube 메타데이터 가져오기 & 다국어 번역
// ============================================
// 1. YouTube Data API v3로 영상 정보 수집
// 2. Gemini로 34개 언어 번역

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { callGemini } from '@/lib/ai-clients';
import { getYouTubeTranslationPrompt } from '@/lib/prompts';
import { MULTILINGUAL_LANGUAGES, MultiLanguageResult } from '@/types';

export const maxDuration = 300;

/** YouTube URL에서 Video ID 추출 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** YouTube Data API로 영상 정보 가져오기 */
async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY가 설정되지 않았습니다.');

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`YouTube API 오류 (${response.status})`);
  }

  const data = await response.json();
  
  if (!data.items || data.items.length === 0) {
    throw new Error('영상을 찾을 수 없습니다. URL을 확인해주세요.');
  }

  const snippet = data.items[0].snippet;
  return {
    title: snippet.title || '',
    description: snippet.description || '',
    thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || '',
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 2. 요청 파싱
    const body = await request.json();
    const { youtubeUrl, action } = body;

    if (!youtubeUrl) {
      return NextResponse.json(
        { success: false, error: 'YouTube URL이 필요합니다.' },
        { status: 400 }
      );
    }

    // 3. Video ID 추출
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: '올바른 YouTube URL이 아닙니다.' },
        { status: 400 }
      );
    }

    // 4. 메타데이터 가져오기
    const metadata = await fetchYouTubeMetadata(videoId);

    // action이 'fetch'면 메타데이터만 반환
    if (action === 'fetch') {
      return NextResponse.json({
        success: true,
        data: { metadata, videoId },
      });
    }

    // 5. 다국어 번역 (action === 'translate')
    const results: MultiLanguageResult[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < MULTILINGUAL_LANGUAGES.length; i += BATCH_SIZE) {
      const batch = MULTILINGUAL_LANGUAGES.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (lang) => {
        try {
          const prompt = getYouTubeTranslationPrompt(
            metadata.title,
            metadata.description,
            lang.nameEn,
            lang.code
          );

          const response = await callGemini(prompt);

          // JSON 파싱 (AI가 마크다운 코드 블록으로 감싸는 경우 처리)
          const cleaned = response.replace(/```json\s*|```\s*/g, '').trim();
          const parsed = JSON.parse(cleaned);

          return {
            languageCode: lang.code,
            languageName: lang.name,
            title: parsed.title || '',
            description: parsed.description || '',
          };
        } catch (error: any) {
          console.error(`[${lang.name} YouTube 번역 실패]`, error.message);
          return {
            languageCode: lang.code,
            languageName: lang.name,
            title: `[번역 실패] ${metadata.title}`,
            description: `[번역 실패] ${metadata.description}`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 배치 간 딜레이
      if (i + BATCH_SIZE < MULTILINGUAL_LANGUAGES.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        metadata,
        videoId,
        translations: results,
      },
    });
  } catch (error: any) {
    console.error('[YouTube 메타데이터 오류]', error);
    return NextResponse.json(
      { success: false, error: error.message || '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
