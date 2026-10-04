import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { pirate } from './locales/pirate';
import { isValidElement } from 'react';
import { LANGUAGES, rich, translate, type MessageKey } from './index';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'core.login.signInWith', { provider: 'Discord' })).toBe('Sign in with Discord');
  });

  it('leaves unknown placeholders alone', () => {
    expect(translate('en', 'core.login.signInWith', {})).toBe('Sign in with {provider}');
  });

  it('has English and Pirate', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'pirate']);
    expect(translate('pirate', 'core.login.signInWith', { provider: 'Discord' })).toBe('Come aboard with Discord');
  });
});

describe('catalogs', () => {
  const keys = Object.keys(en) as MessageKey[];

  it('every English string is filled in', () => {
    for (const key of keys) expect(en[key].length, key).toBeGreaterThan(0);
  });

  it('every key starts with its area', () => {
    for (const key of keys) expect(key, key).toMatch(/^[a-z]+\.[\w.]+$/);
  });

  it('Pirate translates every key, with the same placeholders', () => {
    for (const key of keys) {
      expect(pirate[key], key).toBeTruthy();
      expect(placeholders(pirate[key]), key).toEqual(placeholders(en[key]));
    }
    expect(Object.keys(pirate).sort()).toEqual([...keys].sort());
  });
});

describe('rich', () => {
  it('drops React nodes into the placeholders', () => {
    const out = rich('{who} beat {title}!', { who: 'Trent', title: 'Hades' }) as unknown[];
    expect(out).toHaveLength(5);
    expect(out.every((p) => isValidElement(p))).toBe(true);
  });
});
