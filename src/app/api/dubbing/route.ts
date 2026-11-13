// ============================================
// API: 자막 한 줄 → 더빙 음성 (ElevenLabs TTS)
// ============================================
// 브라우저가 자막 블록마다 호출해 PCM 음성을 받고,
// 각 블록의 타임코드 위치에 배치해 영상과 싱크가 맞는 WAV 한 개로 합친다.
// 출력: 24kHz / 16bit / 모노 raw PCM (pcm_44100은 ElevenLabs Pro 이상 요금제 필요)

import { NextRequest, NextResponse } from 'next/server';
import { DUBBING_LANGUAGES, DUBBING_SAMPLE_RATE } from '@/types';
import { requireSession, readJson, errorResponse, HttpError } from '@/lib/server-utils';

export const maxDuration = 60;

const MAX_TEXT_CHARS = 1000; // 자막 한 줄 기준 넉넉한 상한

function optionalNeighbor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.slice(0, MAX_TEXT_CHARS) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ELEVENLABS_API_KEY가 설정되지 않았습니다.');

    const body = await readJson(request);
    const text = typeof body.text === 'string' ? body.text.replace(/\s*\n\s*/g, ' ').trim() : '';
    if (!text) throw new HttpError(400, '음성으로 만들 텍스트가 없습니다.');
    if (text.length > MAX_TEXT_CHARS) throw new HttpError(400, '자막 한 줄이 너무 깁니다.');

    const lang = DUBBING_LANGUAGES.find((l) => l.code === body.languageCode);
    if (!lang) throw new HttpError(400, `지원하지 않는 언어: ${body.languageCode}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${lang.voiceId}?output_format=pcm_${DUBBING_SAMPLE_RATE}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // 다국어 지원 모델
          language_code: lang.code,
          // 앞뒤 자막을 함께 보내 줄 사이 억양·리듬을 자연스럽게 이어줌
          previous_text: optionalNeighbor(body.previousText),
          next_text: optionalNeighbor(body.nextText),
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3, // 다큐멘터리 나레이션 스타일
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = (await response.text()).slice(0, 500);
      // 429(동시 요청·한도 초과)·5xx는 브라우저가 잠시 후 재시도, 그 외(키 오류·크레딧 부족 등)는 즉시 실패
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      throw new HttpError(status, `ElevenLabs API 오류 (${response.status}): ${errorText}`);
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Sample-Rate': String(DUBBING_SAMPLE_RATE),
      },
    });
  } catch (error) {
    return errorResponse(error, '더빙 생성 오류');
  }
}
