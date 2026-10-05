import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeRaw = vi.fn();
vi.mock('./client.js', () => ({ prisma: { $executeRaw: executeRaw } }));
vi.mock('../services/playniteImport.js', () => ({ PLAYNITE_SOURCE: 'playnite' }));
vi.mock('../services/configResolver.js', () => ({ encryptPlaintextConfig: vi.fn(async () => 0) }));
vi.mock('../services/libraryAnnouncements.js', () => ({ announceNewLibrarySources: vi.fn(async () => {}) }));

const { backfillEmailEnabledAt } = await import('./dataMigrations.js');

const logger = () => ({ info: vi.fn(), warn: vi.fn() });
/** The SQL text of the tagged-template call, whitespace collapsed. */
const sql = () => (executeRaw.mock.calls[0][0] as string[]).join('?').replace(/\s+/g, ' ').trim();

describe('backfillEmailEnabledAt', () => {
  beforeEach(() => executeRaw.mockClear());

  it('sets the cut-off from the last edit, only for email-on rows that have none', async () => {
    executeRaw.mockResolvedValue(3);
    const log = logger();
    await backfillEmailEnabledAt(log);
    expect(sql()).toBe('UPDATE notification_preferences SET email_enabled_at = updated_at WHERE email = true AND email_enabled_at IS NULL');
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it('is quiet when there is nothing to fix (every later boot)', async () => {
    executeRaw.mockResolvedValue(0);
    const log = logger();
    await backfillEmailEnabledAt(log);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs and carries on if the update fails, so the app still starts', async () => {
    executeRaw.mockImplementationOnce(() => Promise.reject(new Error('column missing')));
    const log = logger();
    const outcome = await backfillEmailEnabledAt(log).then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(outcome).toBe('resolved');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('column missing'));
  });
});
