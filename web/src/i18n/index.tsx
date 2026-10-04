import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { pirate } from './pirate';
import { PirateMode } from './PirateMode';

/** The languages QueueUp can show (#776). Add a language by adding it here and a catalog below.
 * Pirate is the joke one: its catalog plus PirateMode, which rewrites the rest of the page. */
export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pirate', name: 'Pirate', nativeName: 'Pirate 🏴‍☠️' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const CATALOGS: Record<Language, Partial<Record<MessageKey, string>>> = { en, pirate };
const STORAGE_KEY = 'sq-language';

const isLanguage = (v: string | null | undefined): v is Language => LANGUAGES.some((l) => l.code === v);

/** The saved choice, else the browser's first language QueueUp has, else English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag?.toLowerCase().split('-')[0];
    if (isLanguage(code)) return code;
  }
  return 'en';
}

/** `key` in `language`, falling back to English, with {placeholders} filled from `vars`. */
export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = CATALOGS[language][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Holds the chosen language (saved in this browser) and keeps <html lang> in step. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  useEffect(() => {
    // Pirate is English underneath, as far as screen readers and spell checkers go.
    document.documentElement.lang = language === 'pirate' ? 'en' : language;
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked - the choice lasts this visit only */
    }
  }, []);
  const value = useMemo<I18nValue>(() => ({ language, setLanguage, t: (key, vars) => translate(language, key, vars) }), [language, setLanguage]);
  return (
    <I18nContext.Provider value={value}>
      {children}
      <PirateMode on={language === 'pirate'} />
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** Steps through every language QueueUp has, one every `intervalMs` - for the sign-in page, so a
 * visitor sees it speaks their language. With a single language it just stays on that one. */
export function useCyclingLanguage(intervalMs = 3200): Language {
  const { language } = useI18n();
  const [index, setIndex] = useState(() => Math.max(0, LANGUAGES.findIndex((l) => l.code === language)));
  useEffect(() => {
    if (LANGUAGES.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % LANGUAGES.length), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return LANGUAGES[index]?.code ?? language;
}
