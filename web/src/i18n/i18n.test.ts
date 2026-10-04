import { describe, expect, it } from 'vitest';
import { en } from './en';
import { LANGUAGES, translate } from './index';

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'login.signInWith', { provider: 'Discord' })).toBe('Sign in with Discord');
  });

  it('leaves unknown placeholders alone', () => {
    expect(translate('en', 'login.signInWith', {})).toBe('Sign in with {provider}');
  });

  it('starts with English only, and English has every key', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en']);
    expect(Object.values(en).every((v) => v.length > 0)).toBe(true);
  });
});
