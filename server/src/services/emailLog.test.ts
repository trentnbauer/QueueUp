import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({ emailLog: { create: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('../db/client.js', () => ({ prisma }));

import { logEmail } from './emailLog.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

describe('logEmail', () => {
  it('records a sent email without any body', async () => {
    await logEmail({ kind: 'alert_digest', to: 'a@example.com', subject: 'QueueUp: 2 new alerts' });
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: { kind: 'alert_digest', toAddress: 'a@example.com', subject: 'QueueUp: 2 new alerts', status: 'sent', error: null },
    });
  });

  it('records a failure with the reason, tidied and capped', async () => {
    await logEmail({ kind: 'smtp_test', to: 'a@example.com', subject: 's', error: new Error(`550 mailbox\n  unavailable ${'x'.repeat(500)}`) });
    const data = prisma.emailLog.create.mock.calls[0][0].data;
    expect(data.status).toBe('failed');
    expect(data.error.startsWith('550 mailbox unavailable')).toBe(true);
    expect(data.error).toHaveLength(300);
  });

  it('prunes old rows only occasionally', async () => {
    await logEmail({ kind: 'smtp_test', to: 'a@example.com', subject: 's' });
    expect(prisma.emailLog.deleteMany).not.toHaveBeenCalled();
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    await logEmail({ kind: 'smtp_test', to: 'a@example.com', subject: 's' });
    expect(prisma.emailLog.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('never throws when the log itself cannot be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.emailLog.create.mockRejectedValue(new Error('db down'));
    await expect(logEmail({ kind: 'smtp_test', to: 'a@example.com', subject: 's' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
