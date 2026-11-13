// ============================================
// 16bit 모노 PCM → MP3 (lamejs, LGPL-3.0 — 별도 청크로 로드)
// ============================================

import { Mp3Encoder } from '@breezystack/lamejs';

const FRAME = 1152;

export function encodePcmToMp3(
  samples: Int16Array,
  sampleRate: number,
  kbps: number,
  onProgress?: (value: number) => void
): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const step = FRAME * 64;
  for (let i = 0; i < samples.length; i += step) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + step));
    if (out.length) parts.push(new Uint8Array(out));
    if (onProgress && (i / step) % 20 === 0) onProgress(i / samples.length);
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}
