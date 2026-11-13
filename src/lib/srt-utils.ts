import { SrtBlock } from '@/types';

// ============================================
// SRT 파싱 / 직렬화 / 번역 응답 매핑 유틸리티
// (서버·브라우저 양쪽에서 사용 — Node 전용 API 사용 금지)
// ============================================

/** SRT 텍스트를 블록 배열로 파싱 (BOM, Windows 줄바꿈(CRLF) 대응) */
export function parseSrt(srtContent: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const cleaned = srtContent
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const rawBlocks = cleaned.split(/\n\s*\n/);
  for (const raw of rawBlocks) {
    const lines = raw.trim().split('\n');
    if (lines.length < 2) continue;
    const index = parseInt(lines[0].trim(), 10);
    if (isNaN(index)) continue;
    const timecode = lines[1].trim();
    if (!timecode.includes('-->')) continue;
    const text = lines.slice(2).join('\n').trim();
    if (!text) continue;
    blocks.push({ index, timecode, text });
  }
  return blocks;
}

export function serializeSrt(blocks: SrtBlock[]): string {
  return blocks.map((block) => `${block.index}\n${block.timecode}\n${block.text}`).join('\n\n') + '\n';
}

/** 텍스트 배열 → "[1] ...\n[2] ..." 번호 매긴 프롬프트용 문자열 */
export function numberTexts(texts: string[]): string {
  return texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');
}

/** 블록의 텍스트를 교체 (빈 문자열이면 원문 유지) */
export function replaceTexts(blocks: SrtBlock[], texts: string[]): SrtBlock[] {
  return blocks.map((block, i) => ({ ...block, text: texts[i] || block.text }));
}

/**
 * "[N] 텍스트" 형식의 AI 응답을 배열로 변환.
 * 누락된 번호는 빈 문자열('')로 남겨 호출 측에서 누락을 감지할 수 있게 한다.
 */
export function parseNumberedResponse(response: string, expectedCount: number): string[] {
  const results: string[] = new Array(expectedCount).fill('');
  const lines = response.replace(/\r\n?/g, '\n').trim().split('\n');
  let currentIndex = -1;
  let currentLines: string[] = [];
  const saveCurrentBlock = () => {
    if (currentIndex >= 1 && currentIndex <= expectedCount) {
      results[currentIndex - 1] = currentLines.join('\n').trim();
    }
  };
  for (const line of lines) {
    const match = line.match(/^\s*\[(\d+)\]\s*(.*)/);
    if (match) {
      saveCurrentBlock();
      currentIndex = parseInt(match[1], 10);
      currentLines = match[2] ? [match[2]] : [];
    } else if (currentIndex >= 1) {
      // 코드블록 펜스 등 잡음 제거
      if (/^\s*```/.test(line)) continue;
      currentLines.push(line);
    }
  }
  saveCurrentBlock();
  return results;
}

/** "00:01:23,456" 또는 "00:01:23.456" → 83.456초 */
export function timecodeToSeconds(tc: string): number {
  const m = tc.trim().match(/(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/);
  if (!m) return NaN;
  const [, h, min, s, ms] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

/** "시작 --> 끝" 타임코드를 초 단위로 분해 */
export function parseTimecodeRange(timecode: string): { start: number; end: number } {
  const [startStr, endStr] = timecode.split('-->');
  return { start: timecodeToSeconds(startStr || ''), end: timecodeToSeconds(endStr || '') };
}

/** 배열을 size 단위로 나누기 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * ElevenLabs 붙여넣기용 나레이션 대본 생성.
 * ElevenLabs는 <speak>/<p> 형태의 SSML 문서를 지원하지 않고 <break time="x.xs" /> 태그만 인식하므로,
 * 자막 사이의 실제 공백 시간을 break 태그(최대 3초)로 넣은 텍스트를 만든다.
 */
export function generateNarrationScript(blocks: SrtBlock[]): string {
  const parts: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const text = blocks[i].text.replace(/\s*\n\s*/g, ' ').trim();
    parts.push(text);
    if (i < blocks.length - 1) {
      const cur = parseTimecodeRange(blocks[i].timecode);
      const next = parseTimecodeRange(blocks[i + 1].timecode);
      const gap = next.start - cur.end;
      if (Number.isFinite(gap) && gap >= 0.3) {
        parts.push(`<break time="${Math.min(gap, 3).toFixed(1)}s" />`);
      }
    }
  }
  return parts.join(' ') + '\n';
}
