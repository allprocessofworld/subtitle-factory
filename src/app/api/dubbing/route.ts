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

// ---- GET: ElevenLabs 요금제에 맞는 동시 처리 수 ----
// 요금제별 TTS 동시 요청 한도 (Flash 외 모델 기준 — eleven_turbo_v2_5에 안전한 값)
// https://elevenlabs.io/docs/help-center/technical/how-many-text-to-speech-requests-can-i-make-and-can-i-increase-it
const TIER_CONCURRENCY: Array<[string, number]> = [
  ['enterprise', 15],
  ['business', 15],
  ['scale', 15],
  ['pro', 10],
  ['creator', 5],
  ['starter', 3],
  ['free', 2],
];
/** 요금제를 확인할 수 없을 때 기본값 (Creator 이상 가정) */
const DEFAULT_CONCURRENCY = 5;

let cachedPlan: { tier: string | null; concurrency: number; at: number } | null = null;

async function detectConcurrency(): Promise<{ tier: string | null; concurrency: number; source: string }> {
  const override = parseInt(process.env.DUBBING_CONCURRENCY || '', 10);
  if (override > 0) return { tier: null, concurrency: Math.min(override, 30), source: 'env' };

  if (cachedPlan && Date.now() - cachedPlan.at < 10 * 60 * 1000) {
    return { tier: cachedPlan.tier, concurrency: cachedPlan.concurrency, source: 'elevenlabs' };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { tier: null, concurrency: DEFAULT_CONCURRENCY, source: 'default' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const tier = String(data?.tier || '').toLowerCase();
    const match = TIER_CONCURRENCY.find(([name]) => tier.includes(name));
    const concurrency = match ? match[1] : DEFAULT_CONCURRENCY;
    cachedPlan = { tier: tier || null, concurrency, at: Date.now() };
    return { tier: tier || null, concurrency, source: 'elevenlabs' };
  } catch (error) {
    // API 키에 구독 정보 읽기 권한(user_read)이 없거나 일시 오류 → 기본값
    console.warn('[ElevenLabs 요금제 확인 실패 — 기본 동시 처리 수 사용]', error);
    return { tier: null, concurrency: DEFAULT_CONCURRENCY, source: 'default' };
  }
}

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ success: true, data: await detectConcurrency() });
  } catch (error) {
    return errorResponse(error, '더빙 설정 조회 오류');
  }
}

/** ElevenLabs 오류 응답 → 한국어 안내 */
function describeElevenLabsError(httpStatus: number, body: string): string {
  let code = '';
  let message = body.slice(0, 300);
  try {
    const detail = JSON.parse(body)?.detail;
    code = String(detail?.status || detail?.code || '');
    message = String(detail?.message || message);
  } catch {
    /* JSON 아님 */
  }
  if (code === 'api_key_id_used_as_api_key') {
    return 'ElevenLabs API 키 대신 "키 ID"가 설정되어 있습니다. sk_로 시작하는 실제 API 키로 바꿔주세요.';
  }
  if (httpStatus === 401 || code.includes('invalid_api_key')) {
    return 'ElevenLabs API 키가 올바르지 않습니다. 환경변수 ELEVENLABS_API_KEY를 확인해주세요.';
  }
  if (code.includes('quota_exceeded')) return 'ElevenLabs 크레딧이 부족합니다. 요금제·잔여 크레딧을 확인해주세요.';
  if (code.includes('missing_permissions')) return `ElevenLabs API 키에 필요한 권한이 없습니다. (${message})`;
  if (httpStatus === 429) return 'ElevenLabs 동시 요청 한도 초과 — 잠시 후 자동으로 다시 시도합니다.';
  return `ElevenLabs API 오류 (${httpStatus}): ${message}`;
}

// ---- POST: 자막 한 줄 → PCM 음성 ----
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
        signal: AbortSignal.timeout(50000),
      }
    ).catch((error) => {
      // 네트워크 오류·시간 초과 → 502 (브라우저가 잠시 후 재시도)
      throw new HttpError(502, `ElevenLabs 서버에 연결할 수 없습니다. (${error?.name === 'TimeoutError' ? '응답 시간 초과' : error?.message})`);
    });

    if (!response.ok) {
      // 429(동시 요청 초과)·5xx는 브라우저가 잠시 후 재시도, 그 외(키 오류·크레딧 부족 등)는 즉시 실패
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      throw new HttpError(status, describeElevenLabsError(response.status, await response.text()));
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
