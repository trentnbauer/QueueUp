import { describe, it, expect, vi } from 'vitest';

vi.mock('./basePath', () => ({ getBasePath: () => '' }));
const { analyticsPath } = await import('./analytics');

describe('analyticsPath', () => {
  it('replaces ids and secret codes so they never reach Google', () => {
    expect(analyticsPath('/room/5613722a-bbe1-43b8-be27-a833f0e82d8f')).toBe('/room/:id');
    expect(analyticsPath('/u/trent')).toBe('/u/:id');
    expect(analyticsPath('/join/demo123456')).toBe('/join/:code');
    expect(analyticsPath('/add/ABCD-2345')).toBe('/add/:code');
    expect(analyticsPath('/confirm-email/some-long-token')).toBe('/confirm-email/:token');
    expect(analyticsPath('/friends/9eb289c7-6633')).toBe('/friends/:id');
  });

  it('leaves ordinary pages alone', () => {
    expect(analyticsPath('/')).toBe('/');
    expect(analyticsPath('/insights')).toBe('/insights');
    expect(analyticsPath('/privacy')).toBe('/privacy');
  });
});
