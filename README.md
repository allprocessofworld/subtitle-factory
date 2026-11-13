# 허슬플레이 번역 웹앱

![허슬플레이](public/logo.png)

산업 다큐멘터리 영상의 **다국어 자막 번역** & **더빙 음성 생성** 웹 애플리케이션

## ✨ 주요 기능

| # | 기능 | 설명 |
|---|------|------|
| 1 | **한→영 번역** | 한국어 SRT → 영어 SRT + ElevenLabs용 더빙 대본 (Gemini 1차번역 → Claude 폴리싱, 용어집 지원) |
| 2 | **다국어 번역** | 영어 SRT → 35개 언어 SRT (문장 압축 후 번역, 용어집 지원, 실패 언어만 재시도) |
| 3 | **더빙 생성** | 6개국 SRT → **타임코드에 맞춘** MP3 더빙 (ElevenLabs TTS, 자막 줄별 생성 후 배치 · WAV도 선택 가능) |
| 4 | **YouTube 번역** | YouTube URL → 제목/설명 37개 언어(영어·한국어 포함) 번역 + 복사 버튼 |

언어 목록은 YouTube 스튜디오 '언어' 화면과 같습니다. 포르투갈어는 포르투갈식(`포르투갈어`)과 브라질식(`포르투갈어(브라질)`)을 따로 만듭니다.

### 처리 방식
- 모든 작업은 브라우저가 자막을 구간(60~80줄)으로 나눠 서버에 동시에 요청합니다. 요청 하나가 짧아서 **Vercel 시간 제한에 걸리지 않고**, 진행률이 표시되며, 실패한 구간·언어만 다시 시도할 수 있습니다.
- AI 응답에서 빠진 줄은 자동으로 한 번 더 요청하고, 그래도 빠지면 **화면에 자막 번호와 함께 경고**합니다 (조용히 원문이 섞이지 않음).
- 더빙은 각 자막 줄의 음성을 해당 타임코드 위치에 배치한 MP3 1개로 출력합니다(24kHz/모노/96kbps, 60분 약 43MB). MP3 인코더 지연(약 45ms)은 자동 보정되며, 무압축 WAV(60분 약 170MB)도 받을 수 있습니다. 동시 처리 수는 ElevenLabs 요금제를 자동 확인해 정합니다. 편집 타임라인 0초에 놓으면 영상과 싱크가 맞습니다. 음성이 자막 구간보다 길면 다음 줄이 밀리며, 몇 줄이 몇 초 밀렸는지 표시됩니다.

## 💰 예상 비용 (20분 영상 1편 기준)

- 한→영 번역: **약 $0.15~0.30** (Gemini + Claude Sonnet 5.5)
- 35개 언어 번역: **약 $0.30** (Gemini)
- YouTube 번역: **약 $0.10** (Gemini)
- 더빙: ElevenLabs 요금제에 따라 다름 (글자 수만큼 크레딧 차감 — 화면에 총 글자 수 표시)

## 🚀 배포 가이드 (완전 초보용)

### 1단계: 필수 계정 만들기 (모두 무료)

#### 1-1. Google Cloud (로그인 + YouTube API용)

1. [Google Cloud Console](https://console.cloud.google.com/) 접속 → 구글 계정 로그인
2. 상단 "프로젝트 선택" → "새 프로젝트" → 이름: `subtitle-factory` → 만들기
3. 좌측 메뉴 "API 및 서비스" → "사용자 인증 정보"
4. **OAuth 동의 화면** 설정:
   - "외부" 선택 → 앱 이름: `허슬플레이 번역 웹앱` → 이메일 입력 → 저장
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

### ⚠️ 참고: 요청 한도

- 작업을 짧은 요청 여러 개로 나눠 처리하므로 Vercel 무료 플랜에서도 시간 초과 없이 동작하도록 설계했습니다.
- **Gemini 무료 등급 API 키는 분당 15회로 제한**됩니다. 한도에 걸리면 앱이 안내를 띄우고 자동으로 기다렸다가 이어서 진행하지만(22줄·34개 언어 기준 약 2분), 긴 영상은 오래 걸립니다. 결제를 등록하면 한도가 크게 늘어납니다.
- **ElevenLabs**는 요금제별 동시 요청 수 제한이 있어, 앱이 요금제를 확인해 자동으로 맞춥니다(Creator 5 · Pro 10 · Scale/Business 15줄).

## 📁 프로젝트 구조

```
subtitle-factory/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # Google 로그인
│   │   │   ├── translate/
│   │   │   │   ├── ko-to-en/route.ts        # 한→영 번역 API (구간 단위)
│   │   │   │   ├── compress/route.ts        # 영어 압축 API (구간 단위)
│   │   │   │   └── en-to-multi/route.ts     # 다국어 번역 API (언어 × 구간 단위)
│   │   │   ├── dubbing/route.ts             # 더빙 API (자막 한 줄 → PCM 음성)
│   │   │   └── youtube/route.ts             # YouTube 번역 API
│   │   ├── layout.tsx
│   │   ├── page.tsx                         # 메인 페이지
│   │   └── globals.css
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── KoToEnTab.tsx                    # 한→영 탭
│   │   ├── EnToMultiTab.tsx                 # 다국어 탭
│   │   ├── DubbingTab.tsx                   # 더빙 탭 (타임코드 배치 → WAV)
│   │   ├── YouTubeTab.tsx                   # YouTube 탭
│   │   └── shared.tsx                       # 공통 UI (업로드, 진행률, 용어집)
│   ├── lib/
│   │   ├── ai-clients.ts                   # Gemini/Claude API 래퍼 (재시도 포함)
│   │   ├── prompts.ts                      # AI 프롬프트 템플릿
│   │   ├── server-utils.ts                 # API 공통 (인증, 입력 검증, 누락 줄 재요청)
│   │   ├── chunked-translate.ts            # 브라우저: 구간 분할 병렬 요청
│   │   ├── client-utils.ts                 # 브라우저: 요청/재시도/다운로드/WAV/MP3
│   │   ├── mp3.worker.ts, mp3-encode.ts    # 브라우저: MP3 변환 (백그라운드)
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
| 프레임워크 | Next.js 15 (React 19) | 프론트+백엔드 올인원, 배포 최적화 |
| 1차 번역 | Gemini 3.5 Flash-Lite | 저비용·고속 (`GEMINI_MODEL`로 변경 가능) |
| 영어 폴리싱 | Claude Sonnet 5.5 | 자연스러운 영어 문체 |
| 다국어 번역 | Gemini 3.5 Flash-Lite | 대량 처리에 적합한 저비용 |
| MP3 변환 | lamejs (@breezystack/lamejs, LGPL-3.0) | 브라우저에서 변환, 별도 파일로 로드 |
| 더빙 | ElevenLabs | 다국어 TTS 품질 최고 |
| 인증 | NextAuth.js | Google OAuth 연동 간편 |
| 스타일링 | Tailwind CSS | 빠른 UI 구축 |

## ❓ 자주 묻는 질문

**Q: 번역 비용이 얼마나 드나요?**
A: 20분 영상 1편 기준 전체 번역(한→영 + 35개 언어) 약 $0.50 미만입니다.

**Q: 번역 품질은 어떤가요?**
A: 한→영은 Gemini로 정확한 기술 용어를 잡고, Claude로 원어민 수준으로 다듬어 전문 번역가 수준입니다.

**Q: 로그인 허용 멤버를 추가하려면?**
A: Vercel 환경변수 `ALLOWED_EMAILS`에 이메일 추가 후 재배포하면 됩니다. (비워두면 아무도 로그인할 수 없습니다)

**Q: 용어집은 어떻게 쓰나요?**
A: 번역 탭의 '용어집'에 한 줄에 하나씩 입력합니다. 한→영은 `사출 성형 = injection molding`, 다국어는 영어 용어만 적습니다. 마지막 입력값은 브라우저에 저장됩니다.

**Q: 파일명이 영어로 나와요**
A: 모든 파일명은 한국어로 생성됩니다 (예: `그리스어.srt`, `덴마크어.wav`).
