import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertName, backupDir, isBackupName } from './backup.js';

describe('backup file names', () => {
  it('accepts the names QueueUp writes, including the safety backup kinds', () => {
    for (const name of [
      'queueup-20260101T120000Z.json.gz',
      'queueup-20260101T120000Z-manual.json.gz',
      'queueup-20260101T120000Z-pre-restore.json.gz',
      'queueup-20260101T120000Z-pre-schema-push.json.gz',
    ]) {
      expect(isBackupName(name), name).toBe(true);
    }
  });

  it('assertName gives a path inside the backup folder', () => {
    const file = assertName('queueup-20260101T120000Z.json.gz');
    expect(file.startsWith(backupDir() + path.sep)).toBe(true);
  });

  it('rejects anything that is not a backup name, including path tricks', () => {
    for (const name of [
      '../queueup-20260101T120000Z.json.gz',
      '/etc/passwd',
      'queueup-20260101T120000Z.json.gz/../../x',
      'queueup-20260101T120000Z.json',
      'notes.txt',
      '',
    ]) {
      expect(() => assertName(name), name).toThrow();
    }
  });

  it('rejects a name that is not a string', () => {
    expect(() => assertName(undefined as unknown as string)).toThrow();
    expect(() => assertName({ toString: () => 'queueup-20260101T120000Z.json.gz' } as unknown as string)).toThrow();
  });
});
