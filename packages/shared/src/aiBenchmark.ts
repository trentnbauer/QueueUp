/** Benchmarking one AI provider: three timed requests of growing size, run one per HTTP call so no
 * single request outlives a reverse proxy's timeout, then summed up into a plain-language verdict. */

/** `load`: a tiny prompt (the first request also pays for loading a model into memory). `quick`: a
 * small batch like the interactive features send. `batch`: as big as the largest real call the app
 * makes (the duplicate finder's batch size), which is the one that decides whether a provider copes. */
export type AiBenchmarkStep = 'load' | 'quick' | 'batch';
export const AI_BENCHMARK_STEPS: readonly AiBenchmarkStep[] = ['load', 'quick', 'batch'];

/** What the server gives each AI request before it gives up (keep in step with REQUEST_TIMEOUT_MS). */
export const AI_BENCHMARK_LIMIT_MS = 60_000;
/** How many candidate pairs the duplicate finder judges per request, and how many requests it runs at once
 * (keep in step with AI_DUPLICATE_BATCH / AI_DUPLICATE_PARALLEL). */
const SCAN_BATCH_PAIRS = 40;
const SCAN_PARALLEL = 3;
/** The pairs a big shelf's duplicate scan looks at (MAX_SCAN_PAIRS), for the "how long would a full scan take" estimate. */
const BIG_SCAN_PAIRS = 600;

export interface AiBenchmarkResult {
  step: AiBenchmarkStep;
  ok: boolean;
  /** Wall-clock time of the request. */
  ms: number;
  /** Tokens the model wrote (as the provider reports, else estimated from the text). */
  outputTokens: number | null;
  tokensPerSecond: number | null;
  /** Whether the answer was the JSON the app asks for. Null for the tiny load step. */
  validJson: boolean | null;
  timedOut: boolean;
  /** Why it failed (never contains a key). */
  error: string | null;
}

export type AiBenchmarkVerdict = 'good' | 'ok' | 'slow' | 'tooSlow' | 'failed';

export interface AiBenchmarkSummary {
  verdict: AiBenchmarkVerdict;
  /** How long the biggest request took, in seconds, when it ran. */
  batchSeconds: number | null;
  /** Rough minutes for a duplicate scan of a big shelf (600 pairs), from the batch time. Null when it did not run. */
  bigScanMinutes: number | null;
  /** Average tokens per second over the requests that finished and wrote something. */
  tokensPerSecond: number | null;
}

/** Turns the step results into a verdict. The batch step is the one that counts: it is as large as a
 * real request gets, so if it finishes comfortably the provider is fine for everything the app does.
 * - good: under 15 s. - ok: under 40 s (works, but big jobs take a while). - slow: finishes, but close to the
 * 60 s limit. - tooSlow: timed out or over the limit. - failed: errored for another reason, or answered with something that is not JSON. */
export function summariseBenchmark(results: AiBenchmarkResult[]): AiBenchmarkSummary {
  const batch = results.find((r) => r.step === 'batch');
  const rates = results.filter((r) => r.ok && r.tokensPerSecond !== null).map((r) => r.tokensPerSecond as number);
  const tokensPerSecond = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
  const failed = results.find((r) => !r.ok);

  let verdict: AiBenchmarkVerdict;
  if (batch?.timedOut || (batch?.ok && batch.ms >= AI_BENCHMARK_LIMIT_MS)) verdict = 'tooSlow';
  else if (failed) verdict = failed.timedOut ? 'tooSlow' : 'failed';
  else if (batch && batch.validJson === false) verdict = 'failed';
  else if (!batch) verdict = 'failed';
  else if (batch.ms < 15_000) verdict = 'good';
  else if (batch.ms < 40_000) verdict = 'ok';
  else verdict = 'slow';

  const batchOk = batch?.ok ? batch : null;
  const batchSeconds = batchOk ? Math.round(batchOk.ms / 100) / 10 : null;
  const bigScanMinutes = batchOk ? Math.max(1, Math.round((Math.ceil(BIG_SCAN_PAIRS / SCAN_BATCH_PAIRS / SCAN_PARALLEL) * batchOk.ms) / 60_000)) : null;
  return { verdict, batchSeconds, bigScanMinutes, tokensPerSecond };
}
