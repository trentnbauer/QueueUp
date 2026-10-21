import { describe, expect, it } from 'vitest';
import { loggableUrl } from './loggableUrl.js';

describe('loggableUrl', () => {
  it('leaves a URL without a query string alone', () => {
    expect(loggableUrl('/api/games')).toBe('/api/games');
  });

  it('drops the whole query string of a sign-in route, with or without a BASE_PATH', () => {
    expect(loggableUrl('/auth/discord/callback?code=abc&state=xyz')).toBe('/auth/discord/callback');
    expect(loggableUrl('/queueup/auth/steam/callback?openid.sig=abc')).toBe('/queueup/auth/steam/callback');
  });

  it('blanks a guest token, and other secret parameters, wherever they are', () => {
    expect(loggableUrl('/api/minigames/lobbies/abc/lobby?guest=eyJ0.sig')).toBe('/api/minigames/lobbies/abc/lobby?guest=[redacted]');
    expect(loggableUrl('/queueup/api/x?a=1&token=t0p&b=2')).toBe('/queueup/api/x?a=1&token=[redacted]&b=2');
    expect(loggableUrl('/api/x?KEY=k&q=zelda')).toBe('/api/x?KEY=[redacted]&q=zelda');
  });

  it('keeps an ordinary query, which is what shows why a request was slow', () => {
    expect(loggableUrl('/api/games?search=zelda&sort=name')).toBe('/api/games?search=zelda&sort=name');
  });

  it('does not treat a parameter that only ends in a secret word as one', () => {
    expect(loggableUrl('/api/x?hockey=1&barcode=2')).toBe('/api/x?hockey=1&barcode=2');
  });
});
