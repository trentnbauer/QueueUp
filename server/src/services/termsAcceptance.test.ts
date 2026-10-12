import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fakeEnv = vi.hoisted(() => ({ REQUIRE_TERMS_ACCEPTANCE: true, TERMS_VERSION: undefined as string | undefined, TERMS_FILE: undefined as string | undefined }));
vi.mock('../config/env.js', () => ({ env: fakeEnv }));

import { currentTermsVersion, termsAcceptanceRequired } from './termsAcceptance.js';

describe('termsAcceptance', () => {
  beforeEach(() => {
    fakeEnv.REQUIRE_TERMS_ACCEPTANCE = true;
    fakeEnv.TERMS_VERSION = undefined;
    fakeEnv.TERMS_FILE = undefined;
  });

  it('uses the built-in version without a file or override', async () => {
    expect(await currentTermsVersion()).toBe('default');
  });

  it('prefers TERMS_VERSION', async () => {
    fakeEnv.TERMS_VERSION = '2026-10';
    expect(await currentTermsVersion()).toBe('2026-10');
  });

  it('hashes the terms file so editing it changes the version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'terms-'));
    const file = join(dir, 'terms.md');
    fakeEnv.TERMS_FILE = file;
    writeFileSync(file, 'one');
    const a = await currentTermsVersion();
    writeFileSync(file, 'two');
    const b = await currentTermsVersion();
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(b).not.toBe(a);
  });

  it('asks only when required and not yet accepted at the current version', () => {
    expect(termsAcceptanceRequired(null, 'v1')).toBe(true);
    expect(termsAcceptanceRequired('v0', 'v1')).toBe(true);
    expect(termsAcceptanceRequired('v1', 'v1')).toBe(false);
    fakeEnv.REQUIRE_TERMS_ACCEPTANCE = false;
    expect(termsAcceptanceRequired(null, 'v1')).toBe(false);
  });
});
