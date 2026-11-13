// ============================================
// AI API 클라이언트 래퍼 (서버 전용)
// ============================================
// Gemini: 1차 번역 / 압축 / 다국어 번역 / YouTube 번역 (가성비)
// Claude: 영어 폴리싱 (품질)
// 모든 API 키는 서버 사이드에서만 접근

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

const GEMINI_MODEL = 'gemini-2.5-flash-lite'; // 100만 토큰당 입력 $0.10 / 출력 $0.40
const CLAUDE_MODEL = 'claude-sonnet-5-5';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 일시적인 오류(요청 한도·서버 과부하·네트워크)면 지수 백오프로 재시도 */
async function withRetry<T>(fn: () => Promise<T>, isRetryable: (e: any) => boolean, attempts = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i === attempts - 1 || !isRetryable(error)) break;
      await sleep(1500 * 2 ** i + Math.random() * 500);
    }
  }
  throw lastError;
}

// ---- Gemini 클라이언트 ----

let genAI: GoogleGenerativeAI | null = null;

/** Gemini API로 텍스트 생성. json=true면 JSON 전용 응답 모드 사용 */
export async function callGemini(prompt: string, options: { json?: boolean } = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  genAI ??= new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.3, // 번역은 창의성보다 정확성
      maxOutputTokens: 32768,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const isRetryable = (e: any) => {
    const status = e?.status ?? 0;
    return status === 429 || status >= 500 || /fetch failed|ECONNRESET|ETIMEDOUT/i.test(e?.message || '');
  };

  try {
    const result = await withRetry(() => model.generateContent(prompt), isRetryable);
    const response = result.response;
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      throw new Error('SAFETY');
    }
    const text = response.text();
    if (!text) throw new Error('Gemini가 빈 응답을 반환했습니다.');
    return text;
  } catch (error: any) {
    if (error?.status === 429) {
      throw new Error('Gemini API 요청 한도 초과 — 잠시 후 다시 시도해주세요.');
    }
    if (error?.message?.includes('SAFETY')) {
      throw new Error('Gemini 안전 필터에 의해 차단됨 — 자막 내용을 확인해주세요.');
    }
    throw new Error(`Gemini API 오류: ${error?.message || '알 수 없는 오류'}`);
  }
}

// ---- Claude 클라이언트 ----

let anthropic: Anthropic | null = null;

/** Claude API로 텍스트 생성 (영어 폴리싱 전용) */
export async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  // SDK가 429/5xx/네트워크 오류를 자동 재시도 (maxRetries)
  anthropic ??= new Anthropic({ apiKey, maxRetries: 3 });

  try {
    // 스트리밍 + finalMessage(): 긴 응답에서도 HTTP 타임아웃 없이 완성본을 받음
    const stream = anthropic.beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      output_config: { effort: 'medium' }, // 자막 다듬기 — 깊은 추론보다 속도·비용 우선
      // 안전 분류기가 드물게 거절할 경우 서버에서 자동으로 대체 모델로 재시도
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error('Claude가 요청을 거절했습니다.');
    }
    const text = message.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text) throw new Error('Claude가 텍스트 응답을 반환하지 않았습니다.');
    return text;
  } catch (error: any) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Claude API 요청 한도 초과 — 잠시 후 다시 시도해주세요.');
    }
    if (error instanceof Anthropic.APIError && error.status === 529) {
      throw new Error('Claude API 서버 과부하 — 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`Claude API 오류: ${error?.message || '알 수 없는 오류'}`);
  }
}
