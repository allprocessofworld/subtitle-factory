/** @type {import('next').NextConfig} */
const nextConfig = {
  // API 라우트의 응답 크기 제한 해제 (대용량 WAV 파일 전송용)
  api: {
    responseLimit: false,
  },
  // 서버 액션 타임아웃 연장 (긴 번역 작업 대응)
  experimental: {
    serverActionsBodySizeLimit: '50mb',
  },
};

module.exports = nextConfig;
