// ============================================
// 자막 공장 - 전체 타입 정의
// ============================================

/** SRT 자막 한 줄(블록)의 구조 */
export interface SrtBlock {
  /** 자막 순번 (1, 2, 3...) */
  index: number;
  /** 시작~끝 타임코드 (예: "00:00:01,401 --> 00:00:04,537") */
  timecode: string;
  /** 자막 텍스트 (여러 줄일 수 있음) */
  text: string;
}

/** 다국어 번역 결과 (YouTube 제목/설명) */
export interface MultiLanguageResult {
  /** 언어 코드 */
  languageCode: string;
  /** 한국어 언어명 */
  languageName: string;
  /** 번역된 제목 */
  title: string;
  /** 번역된 설명 */
  description: string;
}

/** API 응답 공통 구조 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 자막 구간 번역 API 응답 */
export interface ChunkResult {
  /** 입력과 같은 순서의 결과 (누락된 줄은 빈 문자열) */
  texts: string[];
  /** 결과가 빠진 줄의 인덱스 (0부터) */
  missing: number[];
  /** 부분 실패 등 안내 메시지 */
  warning?: string;
}

/** 자막 다국어 번역 목록 — YouTube 스튜디오 번역 언어 목록과 같은 순서 (원본 한국어·영어 제외) */
export const MULTILINGUAL_LANGUAGES = [
  { code: 'el', name: '그리스어', nameEn: 'Greek' },
  { code: 'nl', name: '네덜란드어', nameEn: 'Dutch' },
  { code: 'no', name: '노르웨이어', nameEn: 'Norwegian' },
  { code: 'da', name: '덴마크어', nameEn: 'Danish' },
  { code: 'de', name: '독일어', nameEn: 'German' },
  { code: 'ru', name: '러시아어', nameEn: 'Russian' },
  { code: 'mr', name: '마라티어', nameEn: 'Marathi' },
  { code: 'ms', name: '말레이어', nameEn: 'Malay' },
  { code: 'vi', name: '베트남어', nameEn: 'Vietnamese' },
  { code: 'bn', name: '벵골어', nameEn: 'Bengali' },
  { code: 'sv', name: '스웨덴어', nameEn: 'Swedish' },
  { code: 'es', name: '스페인어', nameEn: 'Spanish' },
  { code: 'sk', name: '슬로바키아어', nameEn: 'Slovak' },
  { code: 'ar', name: '아랍어', nameEn: 'Arabic' },
  { code: 'ur', name: '우르두어', nameEn: 'Urdu' },
  { code: 'uk', name: '우크라이나어', nameEn: 'Ukrainian' },
  { code: 'it', name: '이탈리아어', nameEn: 'Italian' },
  { code: 'id', name: '인도네시아어', nameEn: 'Indonesian' },
  { code: 'ja', name: '일본어', nameEn: 'Japanese' },
  { code: 'zh-CN', name: '중국어(간체)', nameEn: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: '중국어(번체)', nameEn: 'Chinese (Traditional)' },
  { code: 'cs', name: '체코어', nameEn: 'Czech' },
  { code: 'ta', name: '타밀어', nameEn: 'Tamil' },
  { code: 'th', name: '태국어', nameEn: 'Thai' },
  { code: 'te', name: '텔루구어', nameEn: 'Telugu' },
  { code: 'tr', name: '튀르키예어', nameEn: 'Turkish' },
  { code: 'pa', name: '펀자브어', nameEn: 'Punjabi' },
  { code: 'pt-PT', name: '포르투갈어', nameEn: 'European Portuguese (as spoken in Portugal, not Brazilian)' },
  { code: 'pt-BR', name: '포르투갈어(브라질)', nameEn: 'Brazilian Portuguese (as spoken in Brazil)' },
  { code: 'pl', name: '폴란드어', nameEn: 'Polish' },
  { code: 'fr', name: '프랑스어', nameEn: 'French' },
  { code: 'fi', name: '핀란드어', nameEn: 'Finnish' },
  { code: 'fil', name: '필리핀어', nameEn: 'Filipino' },
  { code: 'hu', name: '헝가리어', nameEn: 'Hungarian' },
  { code: 'hi', name: '힌디어', nameEn: 'Hindi' },
] as const;

/**
 * YouTube 제목·설명 번역 목록 — 자막 번역 언어 + 영어(미국)·한국어
 * (YouTube 스튜디오 '언어' 화면과 같은 37개, 같은 순서)
 */
export const YOUTUBE_LANGUAGES = [
  ...MULTILINGUAL_LANGUAGES.slice(0, MULTILINGUAL_LANGUAGES.findIndex((l) => l.code === 'ur')),
  { code: 'en-US', name: '영어(미국)', nameEn: 'American English' },
  ...MULTILINGUAL_LANGUAGES.slice(
    MULTILINGUAL_LANGUAGES.findIndex((l) => l.code === 'ur'),
    MULTILINGUAL_LANGUAGES.findIndex((l) => l.code === 'hu')
  ),
  { code: 'ko', name: '한국어', nameEn: 'Korean' },
  ...MULTILINGUAL_LANGUAGES.slice(MULTILINGUAL_LANGUAGES.findIndex((l) => l.code === 'hu')),
];

/** 더빙 음성 샘플레이트 (ElevenLabs pcm_24000 — 모든 유료 요금제에서 사용 가능) */
export const DUBBING_SAMPLE_RATE = 24000;

/** 더빙 MP3 비트레이트 (24kHz 모노 음성 기준 방송 품질 — 60분 약 43MB) */
export const DUBBING_MP3_KBPS = 96;

/**
 * MP3 인코더/디코더가 앞에 붙이는 지연(약 45ms @24kHz)을 ffmpeg로 실측한 값.
 * 앞쪽 무음에서 이만큼 잘라내 MP3로 재생해도 자막 타임코드와 싱크가 맞도록 보정한다.
 */
export const MP3_DELAY_SAMPLES = 1076;

/** 더빙 지원 6개국 언어 + Voice ID 매핑 */
export const DUBBING_LANGUAGES = [
  { code: 'da', name: '덴마크어', nameEn: 'Danish', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'nl', name: '네덜란드어', nameEn: 'Dutch', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'sv', name: '스웨덴어', nameEn: 'Swedish', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'de', name: '독일어', nameEn: 'German', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'pt', name: '포르투갈어', nameEn: 'Portuguese', voiceId: '4za2kOXGgUd57HRSQ1fn' },
  { code: 'es', name: '스페인어', nameEn: 'Spanish', voiceId: '4za2kOXGgUd57HRSQ1fn' },
] as const;
