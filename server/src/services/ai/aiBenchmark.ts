import { AI_BENCHMARK_LIMIT_MS, type AiBenchmarkResult, type AiBenchmarkStep, type DuplicateSuggestionGame } from '@queueup/shared';
import { HttpError } from '../../util/httpError.js';
import { aiCompleteEntry } from './aiConfig.js';
import { buildDuplicatePrompt, DUPLICATE_SYSTEM } from './aiDuplicates.js';
import { extractJson } from './aiJson.js';
import type { AiRequest } from './providers.js';

/** Benchmarks one saved provider (see packages/shared/src/aiBenchmark.ts): a tiny request, a small
 * batch and a batch as big as the largest the app really sends, each timed. The requests are the
 * duplicate finder's own, with made-up titles, so what is measured is what that feature would cost. */

const BASE_TITLES = [
  ['The Witcher 3: Wild Hunt', 2015],
  ['Hades', 2020],
  ['Celeste', 2018],
  ['Stardew Valley', 2016],
  ['Hollow Knight', 2017],
  ['Portal 2', 2011],
  ['Disco Elysium', 2019],
  ['Cyberpunk 2077', 2020],
  ['Dishonored', 2012],
  ['Divinity: Original Sin 2', 2017],
  ['Doom', 2016],
  ['Control', 2019],
  ['Subnautica', 2018],
  ['Dead Cells', 2018],
  ['Tunic', 2022],
  ['Inside', 2016],
  ['Pillars of Eternity', 2015],
  ['Alan Wake', 2010],
  ['Prey', 2017],
  ['Outer Wilds', 2019],
] as const;
const EDITIONS = ['Complete Edition', 'Definitive Edition', 'Game of the Year Edition', 'Deluxe Edition', 'Anniversary Edition'];

let nextId = 0;
const card = (title: string, year: number): DuplicateSuggestionGame => ({
  id: `bench-${nextId++}`,
  igdbId: nextId,
  title,
  platform: 'PC',
  releaseYear: year,
  coverImageUrl: null,
  status: 'backlog',
});

/** `n` candidate pairs: alternately a base game with an edition of itself (the same game), and two
 * different games (which the model should leave alone). */
export function benchmarkPairs(n: number): [DuplicateSuggestionGame, DuplicateSuggestionGame][] {
  const pairs: [DuplicateSuggestionGame, DuplicateSuggestionGame][] = [];
  for (let i = 0; i < n; i++) {
    const [title, year] = BASE_TITLES[i % BASE_TITLES.length];
    if (i % 2 === 0) {
      pairs.push([card(title, year), card(`${title} ${EDITIONS[i % EDITIONS.length]}`, year + 1)]);
    } else {
      const [other, otherYear] = BASE_TITLES[(i + 7) % BASE_TITLES.length];
      pairs.push([card(title, year), card(other, otherYear)]);
    }
  }
  return pairs;
}

export function isBenchmarkStep(v: unknown): v is AiBenchmarkStep {
  return v === 'load' || v === 'quick' || v === 'batch';
}

function requestFor(step: AiBenchmarkStep): AiRequest {
  if (step === 'load') return { system: 'You are a connectivity check. Reply with the single word OK.', messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 8, temperature: 0 };
  const pairs = benchmarkPairs(step === 'quick' ? 6 : 40);
  return { system: DUPLICATE_SYSTEM, messages: [{ role: 'user', content: buildDuplicatePrompt(pairs) }], maxTokens: step === 'quick' ? 600 : 2048, temperature: 0 };
}

/** Runs one step against the saved provider at `index` in the settings list and times it. A provider
 * that fails or is too slow is a *result* (ok: false), not an error, so the screen can show it; an
 * entry that isn't saved is still a 404. */
export async function runBenchmarkStep(scope: { userId: string } | 'server', index: number, step: AiBenchmarkStep): Promise<AiBenchmarkResult> {
  const started = Date.now();
  try {
    const req = requestFor(step);
    const res = await aiCompleteEntry(scope, index, req);
    const ms = Math.max(1, Date.now() - started);
    const outputTokens = res.usage?.outputTokens ?? Math.max(1, Math.round(res.text.length / 4));
    return {
      step,
      ok: true,
      ms,
      outputTokens,
      tokensPerSecond: Math.round((outputTokens / (ms / 1000)) * 10) / 10,
      // An answer that ran into the output limit was cut off, so it is not the complete list the app needs.
      validJson: step === 'load' ? null : Array.isArray(extractJson(res.text)) && outputTokens < (req.maxTokens ?? Infinity) * 0.97,
      timedOut: false,
      error: null,
    };
  } catch (err) {
    if (!(err instanceof HttpError) || err.statusCode !== 424) throw err;
    const ms = Date.now() - started;
    return { step, ok: false, ms, outputTokens: null, tokensPerSecond: null, validJson: null, timedOut: /took too long/i.test(err.message) || ms >= AI_BENCHMARK_LIMIT_MS, error: err.message };
  }
}
