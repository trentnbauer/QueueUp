import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: { CLOUDFLARED_PATH: 'cloudflared' } }));
vi.mock('./configResolver.js', () => ({ getConfigValue: vi.fn(), getConfigSource: vi.fn() }));

const { parseCloudflaredLine } = await import('./cloudflareTunnel.js');

describe('parseCloudflaredLine', () => {
  it('spots a connection coming up', () => {
    expect(
      parseCloudflaredLine('2026-10-01T10:00:00Z INF Registered tunnel connection connIndex=0 connection=abc event=0 ip=198.41.200.13 location=syd01 protocol=quic'),
    ).toEqual({ connected: true });
  });

  it('spots a connection dropping', () => {
    expect(parseCloudflaredLine('2026-10-01T10:00:00Z INF Unregistered tunnel connection connIndex=0 event=0 ip=198.41.200.13')).toEqual({ disconnected: true });
  });

  it('keeps the message of an ERR or FTL line', () => {
    expect(parseCloudflaredLine('2026-10-01T10:00:00Z ERR Provided Tunnel token is not valid.')).toEqual({ error: 'Provided Tunnel token is not valid.' });
    expect(parseCloudflaredLine('2026-10-01T10:00:00Z FTL failed to start tunnel')).toEqual({ error: 'failed to start tunnel' });
  });

  it('ignores ordinary info lines, even ones mentioning errors', () => {
    expect(parseCloudflaredLine('2026-10-01T10:00:00Z INF Starting tunnel tunnelID=abc')).toEqual({});
    expect(parseCloudflaredLine('2026-10-01T10:00:00Z INF Retrying connection error="timeout"')).toEqual({});
  });
});
