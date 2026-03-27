'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState } from 'react';
import { LogOut, Subtitles, Globe, Mic, Youtube, Factory } from 'lucide-react';
import KoToEnTab from '@/components/KoToEnTab';
import EnToMultiTab from '@/components/EnToMultiTab';
import DubbingTab from '@/components/DubbingTab';
import YouTubeTab from '@/components/YouTubeTab';

const TABS = [
  { id: 'ko-to-en', label: '한→영 번역', icon: Subtitles, desc: 'SRT + SSML' },
  { id: 'en-to-multi', label: '다국어 번역', icon: Globe, desc: '34개 언어' },
  { id: 'dubbing', label: '더빙 생성', icon: Mic, desc: '6개 언어 TTS' },
  { id: 'youtube', label: 'YouTube 번역', icon: Youtube, desc: '제목/설명' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HomePage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>('ko-to-en');

  // ---- 로딩 중 ----
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-500 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  // ---- 비로그인 상태 → 로그인 화면 ----
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="card p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Factory className="w-8 h-8 text-brand-600" />
          </div>
          <h1 className="font-display text-3xl font-bold text-surface-900 mb-2">
            자막 공장
          </h1>
          <p className="text-surface-500 mb-8 text-sm leading-relaxed">
            산업 다큐멘터리 영상의<br />
            다국어 자막 번역 & 더빙 생성 도구
          </p>
          <button
            onClick={() => signIn('google')}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 
                       bg-white border border-surface-200 rounded-xl
                       hover:bg-surface-50 transition-all duration-200
                       shadow-sm hover:shadow-md font-medium text-surface-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google 계정으로 로그인
          </button>
          <p className="text-xs text-surface-400 mt-4">
            회사 멤버 전용 — 등록된 이메일만 접속 가능
          </p>
        </div>
      </div>
    );
  }

  // ---- 로그인 완료 → 메인 대시보드 ----
  return (
    <div className="min-h-screen bg-surface-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-surface-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Factory className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display text-xl font-bold text-surface-900">
              자막 공장
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-surface-500 hidden sm:inline">
              {session.user?.name}
            </span>
            {session.user?.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            )}
            <button
              onClick={() => signOut()}
              className="p-2 text-surface-400 hover:text-surface-600 
                         hover:bg-surface-100 rounded-lg transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 py-2 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button flex items-center gap-2 whitespace-nowrap
                    ${isActive ? 'tab-active' : 'tab-inactive'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  <span className={`text-xs ${isActive ? 'text-brand-200' : 'text-surface-400'}`}>
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'ko-to-en' && <KoToEnTab />}
        {activeTab === 'en-to-multi' && <EnToMultiTab />}
        {activeTab === 'dubbing' && <DubbingTab />}
        {activeTab === 'youtube' && <YouTubeTab />}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-surface-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-surface-400">
          자막 공장 v1.0 — AI 기반 다국어 자막 번역 & 더빙 생성 시스템
        </div>
      </footer>
    </div>
  );
}
