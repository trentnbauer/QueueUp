import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { notification: { findFirst: h.findFirst, create: h.create } } }));

import { notifyAiFailure, notifyAiUpdate } from './notifications.js';

beforeEach(() => {
  h.findFirst.mockReset();
  h.create.mockReset();
});

describe('notifyAiFailure', () => {
  it('tells the person what the AI was doing and why it failed', async () => {
    h.findFirst.mockResolvedValue(null);
    await notifyAiFailure('u1', 'duplicates', 'The AI provider failed. You exceeded your current quota.');
    expect(h.create).toHaveBeenCalledWith({
      data: {
        recipientId: 'u1',
        roomName: 'Personal Shelf',
        type: 'ai_error',
        message: 'The AI could not finish the duplicate scan: The AI provider failed. You exceeded your current quota.',
      },
    });
  });

  it('still says why when it does not know what the request was for', async () => {
    h.findFirst.mockResolvedValue(null);
    await notifyAiFailure('u1', undefined, 'Out of tokens');
    expect(h.create.mock.calls[0][0].data.message).toBe('The AI could not finish: Out of tokens');
  });

  it('says it once while the last one is still unread, so a scan whose every chunk fails is one notice', async () => {
    h.findFirst.mockResolvedValue({ id: 'n1' });
    await notifyAiFailure('u1', 'duplicates', 'Out of tokens');
    expect(h.create).not.toHaveBeenCalled();
  });

  it('never throws into the request it reports on', async () => {
    h.findFirst.mockRejectedValue(new Error('db down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyAiFailure('u1', 'duplicates', 'x')).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe('notifyAiUpdate', () => {
  it('writes a message-only notification', async () => {
    await notifyAiUpdate('u1', 'The AI scan finished: no duplicate games found.');
    expect(h.create).toHaveBeenCalledWith({ data: { recipientId: 'u1', roomName: 'Personal Shelf', type: 'ai_update', message: 'The AI scan finished: no duplicate games found.' } });
  });
});
