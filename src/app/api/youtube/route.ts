// ============================================
// API: YouTube 메타데이터 가져오기 & 언어별 번역
// ============================================
// action: 'fetch'     → YouTube Data API v3로 제목/설명/썸네일 수집
// action: 'translate' → 제목/설명을 한 개 언어로 번역 (브라우저가 언어별로 동시에 호출)

import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai-clients';
import { getYouTubeTranslationPrompt } from '@/lib/prompts';
import { MULTILINGUAL_LANGUAGES } from '@/types';
import { requireSession, readJson, errorResponse, HttpError } from '@/lib/server-utils';

export const maxDuration = 60;

/** YouTube URL에서 Video ID 추출 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
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
  if (!apiKey) throw new HttpError(500, 'YOUTUBE_API_KEY가 설정되지 않았습니다.');

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
  );
  if (!response.ok) throw new HttpError(502, `YouTube API 오류 (${response.status})`);

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new HttpError(404, '영상을 찾을 수 없습니다. URL을 확인해주세요. (비공개 영상은 가져올 수 없습니다)');
  }

  const snippet = data.items[0].snippet;
  return {
    title: snippet.title || '',
    description: snippet.description || '',
    thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || '',
  };
}

/** AI 응답에서 JSON 객체 추출 (코드블록으로 감싼 경우 등 대응) */
function parseJsonObject(text: string): any {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('번역 결과(JSON)를 해석할 수 없습니다.');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const body = await readJson(request);

    if (body.action === 'fetch') {
      const videoId = typeof body.youtubeUrl === 'string' ? extractVideoId(body.youtubeUrl) : null;
      if (!videoId) throw new HttpError(400, '올바른 YouTube URL이 아닙니다.');
      const metadata = await fetchYouTubeMetadata(videoId);
      return NextResponse.json({ success: true, data: { metadata, videoId } });
    }

    if (body.action === 'translate') {
      const title = typeof body.title === 'string' ? body.title.slice(0, 500) : '';
      const description = typeof body.description === 'string' ? body.description.slice(0, 10000) : '';
      if (!title && !description) throw new HttpError(400, '번역할 제목/설명이 없습니다.');

      const lang = MULTILINGUAL_LANGUAGES.find((l) => l.code === body.languageCode);
      if (!lang) throw new HttpError(400, `지원하지 않는 언어 코드: ${body.languageCode}`);

      const prompt = getYouTubeTranslationPrompt(title, description, lang.nameEn, lang.code);
      let parsed: any;
      try {
        parsed = parseJsonObject(await callGemini(prompt, { json: true }));
      } catch {
        // JSON이 깨진 경우 1회 재시도
        parsed = parseJsonObject(await callGemini(prompt, { json: true }));
      }

      const translatedTitle = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
      const translatedDesc = typeof parsed?.description === 'string' ? parsed.description.trim() : '';
      if ((title && !translatedTitle) || (description && !translatedDesc)) {
        throw new Error('번역 결과가 비어 있습니다.');
      }

      return NextResponse.json({
        success: true,
        data: {
          languageCode: lang.code,
          languageName: lang.name,
          title: translatedTitle,
          description: translatedDesc,
        },
      });
    }

    throw new HttpError(400, '알 수 없는 요청입니다.');
  } catch (error) {
    return errorResponse(error, 'YouTube 처리 오류');
  }
}
