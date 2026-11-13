import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/** 로그인 허용 이메일 목록 (환경변수 ALLOWED_EMAILS, 쉼표 구분) */
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const allowedEmails = getAllowedEmails();
      // 보안: 허용 목록이 비어 있으면 아무도 로그인할 수 없음
      // (이전에는 전체 허용 → 아무 Google 계정이나 들어와 API 비용을 쓸 수 있었음)
      if (allowedEmails.length === 0) {
        console.error('[로그인 거부] ALLOWED_EMAILS 환경변수가 비어 있습니다.');
        return false;
      }
      // Google에서 소유 확인(verified)된 이메일만 인정
      if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) {
        return false;
      }
      return allowedEmails.includes(user.email?.toLowerCase() || '');
    },
  },
  pages: {
    // 거부 시 기본 영문 오류 페이지 대신 메인 화면에서 안내
    error: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
