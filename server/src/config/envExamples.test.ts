import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (name: string) => readFileSync(`${repoRoot}${name}`, 'utf8');
/** Keys an env file sets, commented-out ones included (they document optional settings). */
const keysIn = (text: string) => new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

describe('example env files', () => {
  it('.env.example documents every setting the server reads', () => {
    const documented = keysIn(read('.env.example'));
    const missing = Object.keys(envSchema.shape).filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });

  it('the minimal and recommended files only use real settings', () => {
    // POSTGRES_* and IMAGE_TAG are read by docker-compose.prod.yml rather than the server.
    const known = new Set([...Object.keys(envSchema.shape), 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'IMAGE_TAG']);
    for (const name of ['.env.minimal.example', '.env.recommended.example']) {
      const unknown = [...keysIn(read(name))].filter((key) => !known.has(key));
      expect(unknown, name).toEqual([]);
    }
  });

  it('the minimal file has everything the server requires to start', () => {
    const minimal = keysIn(read('.env.minimal.example'));
    for (const key of ['APP_BASE_URL', 'SESSION_SECRET', 'POSTGRES_PASSWORD']) expect(minimal.has(key), key).toBe(true);
  });
});
