import { describe, expect, it } from 'vitest';
import { en } from './en';
import { LANGUAGES, translate } from './index';
import { piratize } from './pirate';

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'login.signInWith', { provider: 'Discord' })).toBe('Sign in with Discord');
  });

  it('leaves unknown placeholders alone', () => {
    expect(translate('en', 'login.signInWith', {})).toBe('Sign in with {provider}');
  });

  it('has English and Pirate, and English has every key', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'pirate']);
    expect(Object.values(en).every((v) => v.length > 0)).toBe(true);
  });

  it('speaks Pirate, keeping placeholders', () => {
    expect(translate('pirate', 'login.signInWith', { provider: 'Discord' })).toBe('Come aboard with Discord');
  });
});

describe('piratize', () => {
  it('swaps words and keeps their case', () => {
    expect(piratize('Your friends are in this room')).toBe('Yer hearties be in this ship');
    expect(piratize('ROOMS · 3')).toBe('SHIPS · 3');
    expect(piratize('Sign in to see your Personal Shelf')).toBe('Come aboard to see yer Personal treasure chest');
  });

  it('leaves game titles like Hi-Fi Rush alone', () => {
    expect(piratize('Hi-Fi Rush')).toBe('Hi-Fi Rush');
  });

  it('drops the g from long -ing words only', () => {
    expect(piratize('Playing')).toBe('Playin’');
    expect(piratize('King of the ring')).toBe('King o’ the ring');
  });
});
