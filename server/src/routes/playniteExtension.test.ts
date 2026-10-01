import { describe, it, expect } from 'vitest';
import { latestPextUrl } from './playniteExtension.js';

const release = (assets: unknown[]) => (async () => ({ ok: true, json: async () => ({ assets }) })) as unknown as typeof fetch;

describe('latestPextUrl', () => {
  it('falls back to the releases page when GitHub is unreachable', async () => {
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await latestPextUrl(1_000, boom)).toBe('https://github.com/trentnbauer/QueueUpPlayniteExtension/releases/latest');
  });

  it('picks the .pext asset and caches it for an hour', async () => {
    const url = 'https://github.com/x/releases/download/v1/QueueUpExporter_v1.pext';
    const first = await latestPextUrl(10_000_000, release([{ name: 'QueueUpExporter.zip', browser_download_url: 'zip' }, { name: 'QueueUpExporter_v1.pext', browser_download_url: url }]));
    expect(first).toBe(url);
    // Within the hour GitHub isn't asked again (this fetch would return something else).
    expect(await latestPextUrl(10_000_000 + 60_000, release([]))).toBe(url);
  });
});
