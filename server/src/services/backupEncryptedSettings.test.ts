import { describe, it, expect } from 'vitest';
import { prepareEncryptedSettings, SessionKeyError, type parseBackup } from './backup.js';
import { decryptSetting, encryptSetting } from './settingsCrypto.js';

type BackupFile = Awaited<ReturnType<typeof parseBackup>>;

const THIS = 't'.repeat(32);
const OLD = 'o'.repeat(32);

function backupWith(rows: Record<string, unknown>[]): BackupFile {
  return { format: 'queueup-backup', version: 1, createdAt: '', appVersion: '', tables: { app_settings: rows, users: [{ id: 'u1' }] } } as unknown as BackupFile;
}

function settings(b: BackupFile) {
  return b.tables.app_settings as { key: string; value: string }[];
}

describe('prepareEncryptedSettings', () => {
  it('leaves a backup alone when this server can read everything', () => {
    const b = backupWith([
      { key: 'SCANDEX_API_KEY', value: encryptSetting('k1', THIS) },
      { key: 'backup.cron', value: '0 3 * * *' },
    ]);
    expect(prepareEncryptedSettings(b, THIS, {})).toBe(0);
    expect(decryptSetting(settings(b)[0].value, THIS)).toBe('k1');
  });

  it('asks for the session key when the keys were made with another one', () => {
    const b = backupWith([{ key: 'SCANDEX_API_KEY', value: encryptSetting('k1', OLD) }]);
    expect(() => prepareEncryptedSettings(b, THIS, {})).toThrow(SessionKeyError);
    try {
      prepareEncryptedSettings(b, THIS, {});
    } catch (e) {
      expect((e as SessionKeyError).code).toBe('session_key_required');
      expect((e as SessionKeyError).statusCode).toBe(409);
    }
  });

  it('re-encrypts with this server key when given the old one', () => {
    const b = backupWith([
      { key: 'SCANDEX_API_KEY', value: encryptSetting('k1', OLD) },
      { key: 'GGDEALS_API_KEY', value: encryptSetting('k2', THIS) },
    ]);
    expect(prepareEncryptedSettings(b, THIS, { sessionKey: OLD })).toBe(0);
    expect(settings(b).map((r) => decryptSetting(r.value, THIS))).toEqual(['k1', 'k2']);
  });

  it('rejects a wrong session key without changing anything', () => {
    const stored = encryptSetting('k1', OLD);
    const b = backupWith([{ key: 'SCANDEX_API_KEY', value: stored }]);
    expect(() => prepareEncryptedSettings(b, THIS, { sessionKey: 'w'.repeat(32) })).toThrow(/doesn't unlock/);
    expect(settings(b)[0].value).toBe(stored);
  });

  it('drops only the unreadable keys when told to skip them', () => {
    const b = backupWith([
      { key: 'SCANDEX_API_KEY', value: encryptSetting('k1', OLD) },
      { key: 'GGDEALS_API_KEY', value: encryptSetting('k2', THIS) },
      { key: 'backup.cron', value: '0 3 * * *' },
    ]);
    expect(prepareEncryptedSettings(b, THIS, { skipEncrypted: true })).toBe(1);
    expect(settings(b).map((r) => r.key)).toEqual(['GGDEALS_API_KEY', 'backup.cron']);
    expect(b.tables.users).toHaveLength(1);
  });
});
