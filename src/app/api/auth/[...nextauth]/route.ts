// ============================================
// Google OAuth 인증 설정
// ============================================
// 우리 회사 멤버만 로그인할 수 있도록
// ALLOWED_EMAILS 환경변수에 등록된 이메일만 허용

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    // 로그인 시도 시 이메일 검증
    async signIn({ user }) {
      const allowedEmails = (process.env.ALLOWED_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

      // 허용 목록이 비어있으면 모든 구글 계정 허용 (개발 편의)
      if (allowedEmails.length === 0) return true;

      const userEmail = user.email?.toLowerCase() || '';
      return allowedEmails.includes(userEmail);
    },
    // JWT에 사용자 정보 포함
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    // 세션에 사용자 정보 노출
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',       // 로그인 페이지 = 메인 페이지
    error: '/',        // 에러 시 메인으로 리다이렉트
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
