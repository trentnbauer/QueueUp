import { createContext, Fragment, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './locales/en';

export type { MessageKey };

/** The languages QueueUp can show (#776). Add a language by adding it here and a catalog under
 * locales/ (one file per area, matching locales/en). Pirate is the joke one. */
export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pirate', name: 'Pirate', nativeName: 'Pirate 🏴‍☠️' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

type Catalog = Partial<Record<MessageKey, string>>;

/** English ships in the entry bundle; every other catalog is its own chunk, fetched the first time
 * that language is needed, so most visitors never download strings they don't read. */
const CATALOGS: Partial<Record<Language, Catalog>> = { en };
const LOADERS: Record<Exclude<Language, 'en'>, () => Promise<Catalog>> = {
  pirate: () => import('./locales/pirate').then((m) => m.pirate),
};
const loading = new Map<Language, Promise<void>>();

/** Fetches `language`'s catalog if it isn't here yet. Resolves (with English still standing in)
 * even if the chunk fails to load, so a bad network never leaves the app blank. */
export function loadLanguage(language: Language): Promise<void> {
  if (CATALOGS[language]) return Promise.resolve();
  let pending = loading.get(language);
  if (!pending) {
    pending = LOADERS[language as Exclude<Language, 'en'>]()
      .then((catalog) => {
        CATALOGS[language] = catalog;
      })
      .catch(() => {
        loading.delete(language);
      });
    loading.set(language, pending);
  }
  return pending;
}

const isLoaded = (language: Language) => !!CATALOGS[language];
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

export type Vars = Record<string, string | number>;

/** `key` in `language`, falling back to English, with {placeholders} filled from `vars`. */
export function translate(language: Language, key: MessageKey, vars?: Vars): string {
  const text = CATALOGS[language]?.[key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

/** The language being shown right now, for `t` outside components (label helpers, toasts). */
let current: Language = 'en';

/** `key` in the current language. Use `useT()` in components, so they re-render when the language
 * changes; this one is for plain functions that run while a component renders (or later, for a
 * toast or error message). */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(current, key, vars);
}

/** Fills {placeholders} in an already-translated string with React nodes, for a sentence with
 * formatting inside it: `rich(t('home.beat', { title: '{title}' }), { title: <b>{name}</b> })`, or
 * simply `rich(t('home.beat'), { title: <b>{name}</b> })` when the key's {title} is left unfilled.
 * Keeps the whole sentence in one translatable string, so languages can reorder it. */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\{(\w+)\}/g);
  return parts.map((part, i) => createElement(Fragment, { key: i }, i % 2 ? (part in nodes ? nodes[part] : `{${part}}`) : part));
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Holds the chosen language (saved in this browser) and keeps <html lang> in step. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  // Someone who saved a language other than English waits the moment its chunk takes, rather than
  // seeing the app flash up in English first.
  const [ready, setReady] = useState(() => isLoaded(language));
  useEffect(() => {
    if (ready) return;
    void loadLanguage(language).then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Set during render, so everything rendering below reads the new language straight away.
  current = language;
  useEffect(() => {
    // Pirate is English underneath, as far as screen readers and spell checkers go.
    document.documentElement.lang = language === 'pirate' ? 'en' : language;
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked - the choice lasts this visit only */
    }
    // Switches once the catalog is here, so the page goes straight from one language to the other.
    void loadLanguage(next).then(() => {
      current = next;
      setLanguageState(next);
    });
  }, []);
  const value = useMemo<I18nValue>(() => ({ language, setLanguage, t: (key, vars) => translate(language, key, vars) }), [language, setLanguage]);
  return <I18nContext.Provider value={value}>{ready ? children : null}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** The translate function for a component: re-renders it when the language changes. */
export function useT(): I18nValue['t'] {
  return useI18n().t;
}

/** Steps through every language QueueUp has, one every `intervalMs` - for the sign-in page, so a
 * visitor sees it speaks their language. With a single language it just stays on that one. */
export function useCyclingLanguage(intervalMs = 3200): Language {
  const { language } = useI18n();
  const [index, setIndex] = useState(() => Math.max(0, LANGUAGES.findIndex((l) => l.code === language)));
  useEffect(() => {
    if (LANGUAGES.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Starts once every catalog is here, so each step shows its own language, not English again.
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    void Promise.all(LANGUAGES.map((l) => loadLanguage(l.code))).then(() => {
      if (!cancelled) timer = setInterval(() => setIndex((i) => (i + 1) % LANGUAGES.length), intervalMs);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return LANGUAGES[index]?.code ?? language;
}
