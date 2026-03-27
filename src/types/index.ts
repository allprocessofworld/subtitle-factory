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

/** 번역 작업 요청 */
export interface TranslationRequest {
  /** 원본 SRT 파일 내용 (텍스트) */
  srtContent: string;
  /** 원본 언어 */
  sourceLanguage: string;
  /** 대상 언어 */
  targetLanguage: string;
  /** 번역 유형 */
  type: 'ko-to-en' | 'en-to-multi';
}

/** 번역 결과 */
export interface TranslationResult {
  /** 번역된 SRT 파일 내용 */
  translatedSrt: string;
  /** SSML 내용 (영어 번역 시에만) */
  ssml?: string;
  /** 언어 코드 */
  language: string;
  /** 한국어 파일명 */
  filename: string;
}

/** 더빙 요청 */
export interface DubbingRequest {
  /** SRT 파일 내용 */
  srtContent: string;
  /** 언어 코드 */
  language: string;
  /** ElevenLabs Voice ID */
  voiceId: string;
}

/** YouTube 메타데이터 */
export interface YouTubeMetadata {
  /** 영상 제목 */
  title: string;
  /** 영상 설명 */
  description: string;
  /** 썸네일 URL */
  thumbnailUrl?: string;
}

/** 다국어 번역 결과 */
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

/** 작업 진행 상태 */
export interface TaskProgress {
  /** 현재 단계 설명 */
  stage: string;
  /** 전체 대비 진행률 (0~100) */
  progress: number;
  /** 현재 처리 중인 언어 */
  currentLanguage?: string;
}

/** 다국어 목록 (34개 언어) */
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
  { code: 'pl', name: '폴란드어', nameEn: 'Polish' },
  { code: 'pt', name: '포르투갈어', nameEn: 'Portuguese' },
  { code: 'fr', name: '프랑스어', nameEn: 'French' },
  { code: 'fi', name: '핀란드어', nameEn: 'Finnish' },
  { code: 'fil', name: '필리핀어', nameEn: 'Filipino' },
  { code: 'hu', name: '헝가리어', nameEn: 'Hungarian' },
  { code: 'hi', name: '힌디어', nameEn: 'Hindi' },
] as const;

/** 더빙 지원 6개국 언어 + Voice ID 매핑 */
export const DUBBING_LANGUAGES = [
  { code: 'da', name: '덴마크어', nameEn: 'Danish', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'nl', name: '네덜란드어', nameEn: 'Dutch', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'sv', name: '스웨덴어', nameEn: 'Swedish', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'de', name: '독일어', nameEn: 'German', voiceId: 'ygiXC2Oa1BiHksD3WkJZ' },
  { code: 'pt', name: '포르투갈어', nameEn: 'Portuguese', voiceId: '4za2kOXGgUd57HRSQ1fn' },
  { code: 'es', name: '스페인어', nameEn: 'Spanish', voiceId: '4za2kOXGgUd57HRSQ1fn' },
] as const;
