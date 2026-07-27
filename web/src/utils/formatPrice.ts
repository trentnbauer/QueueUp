import type { Game } from '@queueup/shared';

export function formatAmount(amount: string, currency: string | null): string {
  if (!currency) return amount;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Issue #385: falls back to the user-set manualPrice whenever there's no live amount to show (no
 * gg.deals/Steam match at all - see GamePrice.amount/source) rather than the bare "—" dead end,
 * for games that just aren't findable there. Prefixed with "~" since it's a user estimate, not a
 * fetched price - same distinction the UI makes for it elsewhere (see GameDetailModal). */
export function formatPrice(game: Game): string {
  if (game.price.amount) return formatAmount(game.price.amount, game.price.currency);
  if (game.manualPrice) return `~${formatAmount(game.manualPrice, game.price.currency ?? 'USD')}`;
  return '—';
}

/** gg.deals' own public search page - used when a game has no specific ggDealsUrl on file yet
 * (IGDB/Steam match never resolved, or resolved to nothing) but someone still wants to look up
 * pricing by hand (issue #336), same as they'd get typing the title into gg.deals themselves. */
export function ggDealsSearchUrl(title: string): string {
  return `https://gg.deals/search/?title=${encodeURIComponent(title)}`;
}
