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

describe('analytics consent', () => {
  async function setup(consent: string | null, id: string | null = 'G-TEST123') {
    vi.resetModules();
    const store = new Map<string, string>(consent ? [['sq-analytics-consent', consent]] : []);
    const scripts: string[] = [];
    const cookies = new Set(['_ga=GA1.1.1', '_ga_TEST123=GS1', 'sq=1']);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { origin: 'https://q.example.com', pathname: '/', hostname: 'q.example.com' } });
    vi.stubGlobal('document', {
      title: 'QueueUp',
      head: { appendChild: (s: { src: string }) => scripts.push(s.src) },
      createElement: () => ({}),
      get cookie() {
        return [...cookies].join('; ');
      },
      set cookie(v: string) {
        if (v.includes('Max-Age=0')) for (const c of cookies) if (c.startsWith(`${v.split('=')[0]}=`)) cookies.delete(c);
      },
    });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ gaMeasurementId: id }) }));
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./analytics');
    return { mod, store, scripts, cookies, fetchMock, win: globalThis.window as unknown as Record<string, unknown> };
  }

  it('loads nothing from Google until the visitor says yes', async () => {
    const { mod, scripts, fetchMock } = await setup(null);
    await mod.initAnalytics();
    expect(scripts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads nothing after the visitor says no', async () => {
    const { mod, scripts } = await setup('denied');
    await mod.initAnalytics();
    expect(scripts).toEqual([]);
  });

  it('loads gtag once consent is given and stops sending when it is withdrawn', async () => {
    const { mod, store, scripts, cookies, win } = await setup(null);
    await mod.setAnalyticsConsent(true);
    expect(store.get('sq-analytics-consent')).toBe('granted');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('id=G-TEST123');

    await mod.setAnalyticsConsent(false);
    expect(store.get('sq-analytics-consent')).toBe('denied');
    expect(win['ga-disable-G-TEST123']).toBe(true);
    expect([...cookies]).toEqual(['sq=1']);

    await mod.setAnalyticsConsent(true);
    expect(win['ga-disable-G-TEST123']).toBe(false);
    expect(scripts).toHaveLength(1);
  });

  it('stays off when the server has no measurement id, even with consent', async () => {
    const { mod, scripts } = await setup('granted', null);
    await mod.initAnalytics();
    expect(scripts).toEqual([]);
    expect(await mod.fetchAnalyticsId()).toBeNull();
  });
});
