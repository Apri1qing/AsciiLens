export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = new Set(['en', 'zh']);

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE;
}

export function isChineseLanguageTag(value) {
  if (typeof value !== 'string') return false;
  const tag = value.trim().toLowerCase().replace('_', '-');
  return tag === 'zh' || tag.startsWith('zh-');
}

export function languageFromLanguageTags(tags, reason = 'default') {
  const languageTags = Array.isArray(tags) ? tags : [];
  const hasChinese = languageTags.some(isChineseLanguageTag);
  return {
    lang: hasChinese ? 'zh' : DEFAULT_LANGUAGE,
    reason: hasChinese ? reason : 'default',
  };
}

export function languageFromAcceptLanguage(acceptLanguage) {
  if (typeof acceptLanguage !== 'string' || acceptLanguage.trim() === '') {
    return { lang: DEFAULT_LANGUAGE, reason: 'default' };
  }

  const tags = acceptLanguage
    .split(',')
    .map((entry) => parseAcceptLanguageEntry(entry))
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);

  return languageFromLanguageTags(tags, 'accept-language');
}

export function languageFromNavigator(navigatorLike) {
  const languageTags = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language,
  ].filter(Boolean);

  return languageFromLanguageTags(languageTags, 'navigator');
}

function parseAcceptLanguageEntry(value) {
  const [rawTag, ...params] = String(value || '').split(';');
  const tag = rawTag.trim();
  const qualityParam = params
    .map((param) => param.trim().toLowerCase())
    .find((param) => param.startsWith('q='));
  const quality = qualityParam ? Number.parseFloat(qualityParam.slice(2)) : 1;

  return {
    tag,
    quality: Number.isFinite(quality) ? quality : 0,
  };
}
