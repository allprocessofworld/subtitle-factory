# 🏭 자막 공장 (Subtitle Factory)

산업 다큐멘터리 영상의 **다국어 자막 번역** & **더빙 음성 생성** 웹 애플리케이션

## ✨ 주요 기능

| # | 기능 | 설명 |
|---|------|------|
| 1 | **한→영 번역** | 한국어 SRT → 영어 SRT + SSML (Gemini 1차번역 → Claude 폴리싱) |
| 2 | **다국어 번역** | 영어 SRT → 34개 언어 SRT (문장 압축 후 번역) |
| 3 | **더빙 생성** | 6개국 SRT → MP3 더빙 (ElevenLabs TTS) |
| 4 | **YouTube 번역** | YouTube URL → 제목/설명 34개 언어 번역 + 복사 버튼 |

## 💰 예상 비용 (20분 영상 1편 기준)

- 한→영 번역: **약 $0.15** (Gemini + Claude)
- 34개 언어 번역: **약 $0.30** (Gemini)
- YouTube 번역: **약 $0.10** (Gemini)
- 더빙: ElevenLabs 요금제에 따라 다름

## 🚀 배포 가이드 (완전 초보용)

### 1단계: 필수 계정 만들기 (모두 무료)

#### 1-1. Google Cloud (로그인 + YouTube API용)

1. [Google Cloud Console](https://console.cloud.google.com/) 접속 → 구글 계정 로그인
2. 상단 "프로젝트 선택" → "새 프로젝트" → 이름: `subtitle-factory` → 만들기
3. 좌측 메뉴 "API 및 서비스" → "사용자 인증 정보"
4. **OAuth 동의 화면** 설정:
   - "외부" 선택 → 앱 이름: `자막 공장` → 이메일 입력 → 저장
5. **OAuth 2.0 클라이언트 ID** 만들기:
   - "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
   - 애플리케이션 유형: "웹 애플리케이션"
   - 이름: `subtitle-factory`
   - 승인된 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`
   - (배포 후 추가): `https://your-domain.vercel.app/api/auth/callback/google`
   - → **클라이언트 ID**와 **클라이언트 시크릿** 복사해두기
6. **API 키** 만들기:
   - "사용자 인증 정보 만들기" → "API 키" → 복사해두기
7. "API 및 서비스" → "라이브러리" → "YouTube Data API v3" 검색 → **사용** 클릭

#### 1-2. Google AI Studio (Gemini API용)

1. [Google AI Studio](https://aistudio.google.com/apikey) 접속
2. "Create API Key" → API 키 복사해두기

#### 1-3. Anthropic (Claude API용)

1. [Anthropic Console](https://console.anthropic.com/) 접속 → 회원가입
2. "Settings" → "API Keys" → "Create Key" → 복사해두기
3. 크레딧 충전 필요 (최소 $5)

#### 1-4. ElevenLabs (더빙 TTS용)

1. [ElevenLabs](https://elevenlabs.io/) 접속 → 회원가입
2. "Settings" → "API Keys" → 복사해두기
3. Starter 요금제 이상 필요 ($5/월)

### 2단계: 코드 설정

```bash
# 1. 프로젝트 폴더로 이동 (이 파일이 있는 폴더)
cd subtitle-factory

# 2. 의존성 설치
npm install

# 3. 환경변수 파일 생성
cp .env.example .env.local
```

#### `.env.local` 파일 편집 (메모장이나 VS Code로 열기):

```env
# Google OAuth
GOOGLE_CLIENT_ID=위에서_복사한_클라이언트ID
GOOGLE_CLIENT_SECRET=위에서_복사한_시크릿

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=아무거나_긴_문자열_입력

# 로그인 허용 이메일 (쉼표로 구분)
ALLOWED_EMAILS=ceo@company.com,member1@gmail.com

# API 키들
GEMINI_API_KEY=위에서_복사한_Gemini_키
ANTHROPIC_API_KEY=위에서_복사한_Anthropic_키
ELEVENLABS_API_KEY=위에서_복사한_ElevenLabs_키
YOUTUBE_API_KEY=위에서_복사한_YouTube_키
```

### 3단계: 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 → Google 로그인 → 사용!

### 4단계: Vercel 배포 (인터넷에 공개)

1. [GitHub](https://github.com) 계정 만들기
2. GitHub에 이 프로젝트 업로드 (새 저장소 만들기)
3. [Vercel](https://vercel.com) 접속 → GitHub로 로그인
4. "Import Project" → 방금 만든 저장소 선택
5. "Environment Variables" 탭에서 `.env.local`의 모든 항목 입력
6. `NEXTAUTH_URL`을 Vercel에서 부여받은 도메인으로 변경
   - 예: `https://subtitle-factory.vercel.app`
7. "Deploy" 클릭!

#### 배포 후 추가 설정:

- Google Cloud Console → OAuth 2.0 클라이언트 ID → 승인된 리디렉션 URI에 추가:
  `https://subtitle-factory.vercel.app/api/auth/callback/google`

### ⚠️ Vercel 무료 플랜 제한

- 서버리스 함수 타임아웃: **60초** (34개 언어 번역 시 시간 초과 가능)
- **해결 방법**: Vercel Pro ($20/월) 가입 시 **300초**로 연장
- 또는: 번역 언어를 5~10개씩 나눠서 실행

## 📁 프로젝트 구조

```
subtitle-factory/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # Google 로그인
│   │   │   ├── translate/
│   │   │   │   ├── ko-to-en/route.ts        # 한→영 번역 API
│   │   │   │   └── en-to-multi/route.ts     # 다국어 번역 API
│   │   │   ├── dubbing/route.ts             # 더빙 생성 API
│   │   │   └── youtube/route.ts             # YouTube 번역 API
│   │   ├── layout.tsx
│   │   ├── page.tsx                         # 메인 페이지
│   │   └── globals.css
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── KoToEnTab.tsx                    # 한→영 탭
│   │   ├── EnToMultiTab.tsx                 # 다국어 탭
│   │   ├── DubbingTab.tsx                   # 더빙 탭
│   │   └── YouTubeTab.tsx                   # YouTube 탭
│   ├── lib/
│   │   ├── ai-clients.ts                   # Gemini/Claude API 래퍼
│   │   ├── prompts.ts                      # AI 프롬프트 템플릿
│   │   └── srt-utils.ts                    # SRT 파싱 유틸리티
│   └── types/
│       └── index.ts                        # TypeScript 타입 정의
├── .env.example                            # 환경변수 예시
├── package.json
├── tailwind.config.ts
└── README.md                               # 이 파일
```

## 🔧 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|----------|
| 프레임워크 | Next.js 14 | 프론트+백엔드 올인원, 배포 최적화 |
| 1차 번역 | Gemini 2.0 Flash | 가성비 최고 ($0.10/1M 입력) |
| 영어 폴리싱 | Claude Sonnet 4.6 | 문체 유창함 1위 |
| 다국어 번역 | Gemini 2.0 Flash | 대량 처리에 적합한 저비용 |
| 더빙 | ElevenLabs | 다국어 TTS 품질 최고 |
| 인증 | NextAuth.js | Google OAuth 연동 간편 |
| 스타일링 | Tailwind CSS | 빠른 UI 구축 |

## ❓ 자주 묻는 질문

**Q: 번역 비용이 얼마나 드나요?**
A: 20분 영상 1편 기준 전체 번역(한→영 + 34개 언어) 약 $0.50 미만입니다.

**Q: 번역 품질은 어떤가요?**
A: 한→영은 Gemini로 정확한 기술 용어를 잡고, Claude로 원어민 수준으로 다듬어 전문 번역가 수준입니다.

**Q: 로그인 허용 멤버를 추가하려면?**
A: `.env.local`의 `ALLOWED_EMAILS`에 이메일 추가 후 재배포하면 됩니다.

**Q: 파일명이 영어로 나와요**
A: 모든 파일명은 한국어로 생성됩니다 (예: `그리스어.srt`, `덴마크어.mp3`).
