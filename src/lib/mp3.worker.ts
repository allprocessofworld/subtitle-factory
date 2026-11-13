// ============================================
// MP3 인코딩 Web Worker (화면 멈춤 없이 백그라운드에서 변환)
// ============================================

import { encodePcmToMp3 } from '@/lib/mp3-encode';

self.onmessage = (event: MessageEvent<{ samples: Int16Array; sampleRate: number; kbps: number }>) => {
  const { samples, sampleRate, kbps } = event.data;
  try {
    const blob = encodePcmToMp3(samples, sampleRate, kbps, (value) =>
      (self as unknown as Worker).postMessage({ type: 'progress', value })
    );
    (self as unknown as Worker).postMessage({ type: 'done', blob });
  } catch (error: any) {
    (self as unknown as Worker).postMessage({ type: 'error', message: error?.message || 'MP3 변환 실패' });
  }
};
