import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { translations } from './i18n';
import { languageFromNavigator, normalizeLanguage } from './locale-preference';

const LanguageContext = createContext(null);
const LANGUAGE_PREFERENCE_ENDPOINT = '/api/locale/preference';
const LANGUAGE_STORAGE_KEY = 'asciilens_language_preference';

function readStoredLanguage() {
  if (typeof window === 'undefined') return null;
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === 'en' || storedLanguage === 'zh') return storedLanguage;
  } catch {
    // Language detection should never block the app from rendering.
  }
  return null;
}

function writeStoredLanguage(lang) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Manual language switching should still work when storage is unavailable.
  }
}

function initialLanguageState() {
  const storedLanguage = readStoredLanguage();
  if (storedLanguage) return { lang: storedLanguage, source: 'storage' };

  if (typeof navigator !== 'undefined') {
    const navigatorPreference = languageFromNavigator(navigator);
    return { lang: navigatorPreference.lang, source: navigatorPreference.reason };
  }

  return { lang: 'en', source: 'default' };
}

export function LanguageProvider({ children }) {
  const [languageState, setLanguageState] = useState(initialLanguageState);
  const manualLanguageRef = useRef(languageState.source === 'storage');
  const lang = languageState.lang;

  useEffect(() => {
    if (manualLanguageRef.current) return undefined;
    let cancelled = false;

    async function loadLanguagePreference() {
      try {
        const response = await fetch(LANGUAGE_PREFERENCE_ENDPOINT, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });
        if (!response.ok) return;
        const preference = await response.json();
        const nextLanguage = normalizeLanguage(preference?.lang);
        if (!cancelled && !manualLanguageRef.current) {
          setLanguageState({
            lang: nextLanguage,
            source: preference?.reason || 'accept-language',
          });
        }
      } catch {
        // Keep the navigator-derived fallback when the endpoint is unavailable.
      }
    }

    loadLanguagePreference();
    return () => {
      cancelled = true;
    };
  }, []);

  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key;

  const toggleLang = () => {
    manualLanguageRef.current = true;
    setLanguageState((current) => {
      const nextLanguage = current.lang === 'en' ? 'zh' : 'en';
      writeStoredLanguage(nextLanguage);
      return { lang: nextLanguage, source: 'storage' };
    });
  };

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
