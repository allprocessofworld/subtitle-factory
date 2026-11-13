import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: '허슬플레이 번역 웹앱',
  description: '산업 다큐멘터리 영상의 다국어 자막 번역 & 더빙 생성 도구',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
