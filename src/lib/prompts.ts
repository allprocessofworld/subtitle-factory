// ============================================
// AI 모델용 프롬프트 템플릿
// ============================================
// 각 번역 단계별 최적화된 프롬프트
// XML 태그 구조를 활용하여 출력 품질 극대화

/**
 * 한국어 → 영어 1차 번역 프롬프트 (Gemini용)
 * 목적: 정확한 기술 용어 번역 + SRT 구조 보존
 */
export function getKoToEnTranslationPrompt(subtitleTexts: string): string {
  return `You are an expert translator specializing in Korean manufacturing and industrial documentary subtitles. Translate the following Korean subtitle texts into English.

<rules>
1. Translate ONLY the dialogue text. Preserve the numbering format [N] exactly.
2. Maintain technical accuracy for manufacturing terminology:
   - 슬립 (slip) → "slip" (ceramic casting liquid)
   - 드레인 캐스팅 → "drain casting"
   - 솔리드 캐스팅 → "solid casting"
   - 초벌 소성 → "bisque firing"
   - 시유 → "glazing"
   - 파팅 라인 → "parting line"
   - 석고 몰드 → "plaster mold"
   - 포트밀 → "pot mill" / "ball mill"
   - 유약 → "glaze"
   - 가마 → "kiln"
   - 기물 → "ware" or "piece"
   - 정형 → "trimming" / "fettling"
   - 연마 → "grinding" / "polishing"
3. Keep translations natural and concise for subtitles.
4. Each subtitle line should be short enough to read comfortably (max ~12 words per line).
5. Do NOT add any explanation, commentary, or notes.
6. Output ONLY the translated lines with their [N] numbering.
</rules>

<subtitles>
${subtitleTexts}
</subtitles>

Translate now. Output format: [N] translated text`;
}

/**
 * 영어 자막 폴리싱 프롬프트 (Claude용)
 * 목적: 원어민 수준의 자연스러운 표현 + 더빙용 자연스러운 리듬
 */
export function getEnPolishingPrompt(subtitleTexts: string): string {
  return `You are a native English-speaking documentary narrator and localization expert. Your task is to polish these English subtitle translations to sound perfectly natural — as if originally written in English by a skilled documentary scriptwriter.

<context>
These subtitles are for a Korean manufacturing/industrial documentary being dubbed into English. The tone should be:
- Authoritative yet warm (like a Discovery Channel narrator)
- Clear and precise with technical terms
- Engaging and slightly dramatic where appropriate
- Natural spoken English rhythm (these will be used for dubbing)
</context>

<rules>
1. Preserve the [N] numbering format exactly.
2. DO NOT change technical manufacturing terms — they are already correct.
3. Make sentences flow naturally as spoken narration, not written text.
4. Keep subtitle length concise — each line should be comfortable to read in the given timeframe.
5. Improve awkward phrasing while keeping the original meaning intact.
6. Use active voice where possible.
7. Output ONLY the polished lines with their [N] numbering.
8. Do NOT add any explanation or notes.
</rules>

<subtitles>
${subtitleTexts}
</subtitles>

Polish now. Output format: [N] polished text`;
}

/**
 * 영어 → 다국어 번역 프롬프트 (Gemini용)
 * 목적: 문장 길이 제한 + 정확한 번역
 */
export function getMultilingualTranslationPrompt(
  subtitleTexts: string,
  targetLanguageName: string,
  targetLanguageCode: string
): string {
  return `You are an expert subtitle translator. Translate the following English subtitle texts into ${targetLanguageName} (${targetLanguageCode}).

<critical_rules>
1. Preserve the [N] numbering format exactly.
2. CRITICAL — CHARACTER LIMIT: Each translated subtitle line MUST NOT exceed the character count of the original English line. If the translation is longer, you MUST compress it while keeping the core meaning. This is essential because longer text will not fit in the subtitle display.
3. Keep manufacturing/industrial terminology accurate.
4. Adapt the text culturally — use natural phrasing in ${targetLanguageName}, not word-for-word translation.
5. For technical terms with no direct equivalent, use the internationally recognized English term.
6. Output ONLY the translated lines with their [N] numbering.
7. Do NOT add any explanation or notes.
</critical_rules>

<subtitles>
${subtitleTexts}
</subtitles>

Translate now. Output format: [N] translated text`;
}

/**
 * 영어 자막 압축 프롬프트 (다국어 번역 전처리)
 * 목적: 다국어 번역 시 길이 초과 방지를 위한 영어 문장 압축
 */
export function getEnCompressionPrompt(subtitleTexts: string): string {
  return `You are a subtitle compression specialist. Compress these English subtitle texts to be approximately 15-20% shorter while maintaining all essential meaning. This compressed version will serve as the source for translation into multiple languages (where translated text tends to be longer than English).

<rules>
1. Preserve the [N] numbering format exactly.
2. Remove filler words, redundant phrases, and unnecessary qualifiers.
3. Use shorter synonyms where possible (e.g., "utilizes" → "uses", "in order to" → "to").
4. Keep ALL technical manufacturing terms intact — do NOT simplify or remove them.
5. Maintain the documentary narration tone.
6. Every compressed line must still make complete sense on its own.
7. Output ONLY the compressed lines with their [N] numbering.
</rules>

<subtitles>
${subtitleTexts}
</subtitles>

Compress now. Output format: [N] compressed text`;
}

/**
 * YouTube 메타데이터 번역 프롬프트 (Gemini용)
 * 목적: 제목/설명의 자연스러운 현지화
 */
export function getYouTubeTranslationPrompt(
  title: string,
  description: string,
  targetLanguageName: string,
  targetLanguageCode: string
): string {
  return `Translate the following YouTube video title and description into ${targetLanguageName} (${targetLanguageCode}).

<rules>
1. The title should be catchy and optimized for YouTube search in ${targetLanguageName}.
2. Keep the description's structure (line breaks, sections) intact.
3. Translate hashtags if they exist — use locally popular equivalents.
4. Do NOT translate channel names, brand names, or proper nouns.
5. URLs must remain unchanged.
6. Respond in EXACTLY this JSON format, no other text:
</rules>

<content>
<title>${title}</title>
<description>${description}</description>
</content>

Respond with ONLY this JSON (no markdown, no backticks):
{"title": "translated title here", "description": "translated description here"}`;
}
