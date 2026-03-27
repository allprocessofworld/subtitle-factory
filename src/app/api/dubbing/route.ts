// ============================================
// API: 다국어 더빙 WAV 생성 (ElevenLabs)
// ============================================
// 6개 언어의 SRT 파일을 ElevenLabs TTS로 변환
// 각 자막 블록을 개별 음성으로 생성 후 연결

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { parseSrt } from '@/lib/srt-utils';
import { DUBBING_LANGUAGES } from '@/types';

export const maxDuration = 300;

/** 타임코드 문자열을 초(seconds)로 변환 */
function timecodeToSeconds(tc: string): number {
  // "00:01:23,456" → 83.456
  const [time, ms] = tc.split(',');
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
}

/** ElevenLabs TTS API 호출 */
async function generateSpeech(
  text: string,
  voiceId: string,
  languageCode: string
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY가 설정되지 않았습니다.');

  // ElevenLabs 언어 코드 매핑
  const elevenLabsLangMap: Record<string, string> = {
    da: 'da', // 덴마크어
    nl: 'nl', // 네덜란드어
    sv: 'sv', // 스웨덴어
    de: 'de', // 독일어
    pt: 'pt', // 포르투갈어
    es: 'es', // 스페인어
  };

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg', // MP3 형식으로 수신 (파일 크기 절감)
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5', // 다국어 지원 모델
        language_code: elevenLabsLangMap[languageCode] || languageCode,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,           // 다큐멘터리 나레이션 스타일
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API 오류 (${response.status}): ${errorText}`);
  }

  return response.arrayBuffer();
}

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 2. 요청 데이터 파싱
    const formData = await request.formData();
    const languageCode = formData.get('languageCode') as string;
    const file = formData.get('srtFile') as File;

    if (!file || !languageCode) {
      return NextResponse.json(
        { success: false, error: 'SRT 파일과 언어 코드가 필요합니다.' },
        { status: 400 }
      );
    }

    // 3. 언어별 Voice ID 찾기
    const langConfig = DUBBING_LANGUAGES.find((l) => l.code === languageCode);
    if (!langConfig) {
      return NextResponse.json(
        { success: false, error: `지원하지 않는 언어: ${languageCode}` },
        { status: 400 }
      );
    }

    // 4. SRT 파싱
    const srtContent = await file.text();
    const blocks = parseSrt(srtContent);

    if (blocks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'SRT 파일을 파싱할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 5. 전체 자막 텍스트를 하나로 합쳐서 TTS 생성
    //    (블록별 개별 호출보다 비용 효율적이고 자연스러운 리듬)
    const fullText = blocks.map((b) => b.text).join('. ');

    const audioBuffer = await generateSpeech(
      fullText,
      langConfig.voiceId,
      languageCode
    );

    // 6. MP3 파일로 응답
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(langConfig.name)}.mp3"`,
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error('[더빙 생성 오류]', error);
    return NextResponse.json(
      { success: false, error: error.message || '더빙 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
