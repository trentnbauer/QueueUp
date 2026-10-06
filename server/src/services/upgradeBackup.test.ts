import { describe, expect, it } from 'vitest';
import { isBackupName } from './backup.js';
import { isRiskyUpgrade, riskyUpgradeBackupName } from './upgradeBackup.js';

describe('isRiskyUpgrade', () => {
  it('is risky only when the major version goes up', () => {
    expect(isRiskyUpgrade('v1.9.3', 'v2.0.0')).toBe(true);
    expect(isRiskyUpgrade('v1.2.3', 'v3.0.0')).toBe(true);
    expect(isRiskyUpgrade('v1.2.3', 'v1.3.0')).toBe(false);
    expect(isRiskyUpgrade('v1.2.3', 'v1.2.4')).toBe(false);
    expect(isRiskyUpgrade('v2.0.0', 'v1.9.0')).toBe(false);
    expect(isRiskyUpgrade('v2.0.0', 'v2.0.0')).toBe(false);
  });

  it('is never risky for a dev build or when nothing was recorded', () => {
    expect(isRiskyUpgrade(null, 'v2.0.0')).toBe(false);
    expect(isRiskyUpgrade('v1.0.0', 'dev')).toBe(false);
    expect(isRiskyUpgrade('dev', 'v2.0.0')).toBe(false);
    expect(isRiskyUpgrade('v1.0.0', undefined)).toBe(false);
  });
});

describe('risky upgrade backup name', () => {
  it('names the two versions and is a valid backup file name', () => {
    const name = riskyUpgradeBackupName('v1.4.2', 'v2.0.0');
    expect(name).toBe('RISKY UPGRADE - v1.4.2 to v2.0.0.json.gz');
    expect(isBackupName(name)).toBe(true);
  });

  it('does not let a crafted name through', () => {
    expect(isBackupName('RISKY UPGRADE - v1.0.0 to v2.0.0/../../x.json.gz')).toBe(false);
    expect(isBackupName('RISKY UPGRADE - v1 to v2.json.gz')).toBe(false);
  });
});
