import { t } from '../i18n';

/** Simple "time ago" formatter for small UI hints (e.g. "Updated 3h ago" next to a price) — not
 * meant to be exhaustive, just readable at the granularities prices actually change at. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = now - then;
  if (diffMs < 0) return t('shell.time.justNow');

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t('shell.time.justNow');
  if (minutes < 60) return t('shell.time.minutesAgo', { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('shell.time.hoursAgo', { n: hours });

  const days = Math.floor(hours / 24);
  if (days < 30) return t('shell.time.daysAgo', { n: days });

  const months = Math.floor(days / 30);
  if (months < 12) return t('shell.time.monthsAgo', { n: months });

  const years = Math.floor(months / 12);
  return t('shell.time.yearsAgo', { n: years });
}

/** Forward-tense counterpart to formatRelativeTime (issue #367) - "how long until" rather than
 * "how long ago," for the coming-soon release countdown strip. Same day-granularity reasoning:
 * days close enough to actually count down matter more precisely than ones that don't. */
export function formatCountdown(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = then - now;
  if (diffMs <= 0) return t('shell.time.outNow');

  const days = Math.ceil(diffMs / 86_400_000);
  if (days === 1) return t('shell.time.tomorrow');
  if (days < 14) return t('shell.time.inDays', { n: days });

  const weeks = Math.floor(days / 7);
  if (days < 60) return t('shell.time.inWeeks', { n: weeks });

  const months = Math.floor(days / 30);
  if (months < 12) return t('shell.time.inMonths', { n: months });

  const years = Math.floor(months / 12);
  return t('shell.time.inYears', { n: years });
}
