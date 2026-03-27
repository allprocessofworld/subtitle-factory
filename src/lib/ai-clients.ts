// ============================================
// AI API 클라이언트 래퍼
// ============================================
// Gemini: 1차 번역 (가성비) + 다국어 번역
// Claude: 영어 폴리싱 (품질)
// 모든 API 키는 서버 사이드에서만 접근

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// ---- Gemini 클라이언트 ----

/** Gemini API로 텍스트 생성 */
export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // gemini-2.0-flash-lite-lite: 가성비 최고 모델
  // 100만 토큰당 입력 $0.10, 출력 $0.40
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-lite-lite',
    generationConfig: {
      temperature: 0.3,        // 번역은 창의성보다 정확성 → 낮은 temperature
      maxOutputTokens: 16384,  // 60분 분량 자막 대응
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error('Gemini가 빈 응답을 반환했습니다.');
    }
    
    return text;
  } catch (error: any) {
    // 레이트 리밋 에러 처리
    if (error?.status === 429) {
      throw new Error('Gemini API 요청 한도 초과 — 잠시 후 다시 시도해주세요.');
    }
    // 안전 필터 차단 처리
    if (error?.message?.includes('SAFETY')) {
      throw new Error('Gemini 안전 필터에 의해 차단됨 — 자막 내용을 확인해주세요.');
    }
    throw new Error(`Gemini API 오류: ${error?.message || '알 수 없는 오류'}`);
  }
}

// ---- Claude 클라이언트 ----

/** Claude API로 텍스트 생성 (영어 폴리싱 전용) */
export async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,       // 60분 분량 자막 대응
      temperature: 0.4,         // 약간의 창의성 허용 (자연스러운 표현을 위해)
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    // 텍스트 블록만 추출
    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude가 텍스트 응답을 반환하지 않았습니다.');
    }

    return textBlock.text;
  } catch (error: any) {
    if (error?.status === 429) {
      throw new Error('Claude API 요청 한도 초과 — 잠시 후 다시 시도해주세요.');
    }
    if (error?.status === 529) {
      throw new Error('Claude API 서버 과부하 — 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`Claude API 오류: ${error?.message || '알 수 없는 오류'}`);
  }
}
