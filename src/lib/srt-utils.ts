import { SrtBlock } from '@/types';

export function parseSrt(srtContent: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const cleaned = srtContent.replace(/^\uFEFF/, '').trim();
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

export function extractTexts(blocks: SrtBlock[]): string {
  return blocks.map((b, i) => `[${i + 1}] ${b.text}`).join('\n');
}

export function mapTranslatedTexts(originalBlocks: SrtBlock[], translatedTexts: string[]): SrtBlock[] {
  return originalBlocks.map((block, i) => ({ ...block, text: translatedTexts[i] || block.text }));
}

export function parseTranslatedResponse(response: string, expectedCount: number): string[] {
  const results: (string | undefined)[] = new Array(expectedCount).fill(undefined);
  const lines = response.trim().split('\n');
  let currentIndex = -1;
  let currentLines: string[] = [];
  const saveCurrentBlock = () => {
    if (currentIndex >= 1 && currentIndex <= expectedCount) {
      results[currentIndex - 1] = currentLines.join('\n').trim();
    }
  };
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.*)/);
    if (match) {
      saveCurrentBlock();
      currentIndex = parseInt(match[1], 10);
      currentLines = match[2] ? [match[2]] : [];
    } else if (currentIndex >= 1) {
      currentLines.push(line);
    }
  }
  saveCurrentBlock();
  return results.map((r) => r || '');
}

export function generateSSML(blocks: SrtBlock[]): string {
  let ssml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  ssml += `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="en-US">\n`;
  for (const block of blocks) {
    ssml += `  <!-- Block ${block.index} | ${block.timecode} -->\n`;
    ssml += `  <p>${escapeXml(block.text)}</p>\n`;
    ssml += `  <break time="300ms"/>\n`;
  }
  ssml += `</speak>\n`;
  return ssml;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}