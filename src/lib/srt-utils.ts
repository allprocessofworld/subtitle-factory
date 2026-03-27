// ============================================
// SRT 파일 파싱 & 직렬화 유틸리티
// ============================================
// SRT(SubRip Subtitle) 형식을 파싱하고 다시 문자열로 변환하는 함수들
// 타임코드의 정확한 보존이 핵심 — 번역 시 타임코드는 절대 변경하면 안 됨

import { SrtBlock } from '@/types';

/**
 * SRT 문자열을 파싱하여 SrtBlock 배열로 변환
 * 
 * SRT 형식:
 * 1
 * 00:00:01,401 --> 00:00:04,537
 * 자막 텍스트
 * (빈 줄)
 */
export function parseSrt(srtContent: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];

  // BOM(Byte Order Mark) 제거 — Windows에서 생성된 파일에 종종 포함됨
  const cleaned = srtContent.replace(/^\uFEFF/, '').trim();

  // 빈 줄 기준으로 블록 분리 (연속된 빈 줄도 처리)
  const rawBlocks = cleaned.split(/\n\s*\n/);

  for (const raw of rawBlocks) {
    const lines = raw.trim().split('\n');
    if (lines.length < 2) continue;

    // 첫 번째 줄: 순번 (숫자만 허용)
    const index = parseInt(lines[0].trim(), 10);
    if (isNaN(index)) continue;

    // 두 번째 줄: 타임코드 (-->로 구분)
    const timecode = lines[1].trim();
    if (!timecode.includes('-->')) continue;

    // 세 번째 줄 이후: 자막 텍스트 (여러 줄 가능)
    const text = lines.slice(2).join('\n').trim();
    if (!text) continue;

    blocks.push({ index, timecode, text });
  }

  return blocks;
}

/**
 * SrtBlock 배열을 SRT 문자열로 변환
 * 타임코드는 원본 그대로 유지
 */
export function serializeSrt(blocks: SrtBlock[]): string {
  return blocks
    .map((block) => `${block.index}\n${block.timecode}\n${block.text}`)
    .join('\n\n') + '\n';
}

/**
 * SRT 블록에서 텍스트만 추출 (번역 요청용)
 * 각 블록의 텍스트를 ||| 구분자로 연결
 * → AI 모델에게 "이 구분자를 유지하라"고 지시하면 순서 보존 가능
 */
export function extractTexts(blocks: SrtBlock[]): string {
  return blocks.map((b, i) => `[${i + 1}] ${b.text}`).join('\n');
}

/**
 * 번역된 텍스트를 다시 SRT 블록에 매핑
 * @param originalBlocks 원본 SRT 블록 (타임코드 보존용)
 * @param translatedTexts 번역된 텍스트 배열
 */
export function mapTranslatedTexts(
  originalBlocks: SrtBlock[],
  translatedTexts: string[]
): SrtBlock[] {
  return originalBlocks.map((block, i) => ({
    ...block,
    text: translatedTexts[i] || block.text, // 번역 누락 시 원본 유지
  }));
}

/**
 * 번역 결과 텍스트 파싱
 * AI 모델이 [번호] 형식으로 반환한 텍스트를 배열로 변환
 */
export function parseTranslatedResponse(response: string, expectedCount: number): string[] {
  const results: string[] = [];
  const lines = response.trim().split('\n');
  
  let currentIndex = -1;
  let currentText = '';

  for (const line of lines) {
    // [번호] 패턴 매칭
    const match = line.match(/^\[(\d+)\]\s*(.*)/);
    if (match) {
      // 이전 블록 저장
      if (currentIndex > 0) {
        results[currentIndex - 1] = currentText.trim();
      }
      currentIndex = parseInt(match[1], 10);
      currentText = match[2];
    } else if (currentIndex > 0) {
      // 여러 줄 텍스트 이어 붙이기
      currentText += '\n' + line;
    }
  }
  
  // 마지막 블록 저장
  if (currentIndex > 0) {
    results[currentIndex - 1] = currentText.trim();
  }

  // 누락된 인덱스는 빈 문자열로 채움
  while (results.length < expectedCount) {
    results.push('');
  }

  return results.slice(0, expectedCount);
}

/**
 * SRT 블록을 ElevenLabs SSML 형식으로 변환
 * 타임코드 정보를 포함하여 더빙 시 동기화에 활용
 */
export function generateSSML(blocks: SrtBlock[]): string {
  let ssml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  ssml += `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="en-US">\n`;
  
  for (const block of blocks) {
    // 타임코드에서 시작/끝 시간 추출
    const [startTime] = block.timecode.split(' --> ');
    // 각 자막 블록 사이에 적절한 정지(break)를 삽입
    ssml += `  <!-- Block ${block.index} | ${block.timecode} -->\n`;
    ssml += `  <p>${escapeXml(block.text)}</p>\n`;
    ssml += `  <break time="300ms"/>\n`;
  }
  
  ssml += `</speak>\n`;
  return ssml;
}

/** XML 특수문자 이스케이프 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
