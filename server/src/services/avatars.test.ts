import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ prisma: {} }));

import { avatarSourceKey, effectiveAvatarUrl, gravatarUrl, readSources } from './avatars.js';

const user = (over: Partial<{ avatarChoice: string; avatarBlocked: boolean; emailVerified: boolean }> = {}) => ({
  avatarChoice: 'auto',
  avatarBlocked: false,
  email: 'Me@Example.com ',
  emailVerified: true,
  ...over,
});
const sources = { steam: 'https://steam/pic.png', discord: 'https://discord/pic.png' };

describe('avatarSourceKey', () => {
  it('files Steam and Discord pictures under their own name and the rest as provider', () => {
    expect(avatarSourceKey('steam:7656')).toBe('steam');
    expect(avatarSourceKey('discord:123')).toBe('discord');
    expect(avatarSourceKey('google:abc')).toBe('provider');
  });
});

describe('readSources', () => {
  it('keeps only https pictures for known sources', () => {
    expect(readSources({ steam: 'https://a/b.png', discord: 'javascript:alert(1)', other: 'https://x' })).toEqual({ steam: 'https://a/b.png' });
    expect(readSources(null)).toEqual({});
    expect(readSources([])).toEqual({});
  });
});

describe('gravatarUrl', () => {
  it('hashes the trimmed, lower-cased address', () => {
    expect(gravatarUrl('Me@Example.com ')).toBe(gravatarUrl('me@example.com'));
    expect(gravatarUrl('me@example.com')).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}\?s=256&d=404$/);
  });
});

describe('effectiveAvatarUrl', () => {
  it('shows the latest sign-in picture on auto', () => {
    expect(effectiveAvatarUrl(user(), sources, 'https://latest/p.png')).toBe('https://latest/p.png');
  });

  it('shows the chosen service, or nothing when that picture is missing', () => {
    expect(effectiveAvatarUrl(user({ avatarChoice: 'steam' }), sources, null)).toBe(sources.steam);
    expect(effectiveAvatarUrl(user({ avatarChoice: 'discord' }), {}, 'https://latest/p.png')).toBeNull();
  });

  it('uses Gravatar only for a verified email', () => {
    expect(effectiveAvatarUrl(user({ avatarChoice: 'gravatar' }), sources, null)).toBe(gravatarUrl('me@example.com'));
    expect(effectiveAvatarUrl(user({ avatarChoice: 'gravatar', emailVerified: false }), sources, null)).toBeNull();
  });

  it('shows the colour and letter on letter, and whenever an administrator removed the picture', () => {
    expect(effectiveAvatarUrl(user({ avatarChoice: 'letter' }), sources, 'https://latest/p.png')).toBeNull();
    expect(effectiveAvatarUrl(user({ avatarBlocked: true }), sources, 'https://latest/p.png')).toBeNull();
    expect(effectiveAvatarUrl(user({ avatarBlocked: true, avatarChoice: 'steam' }), sources, null)).toBeNull();
  });
});
