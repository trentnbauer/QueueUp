import type { Game } from '@queueup/shared';

export function formatAmount(amount: string, currency: string | null): string {
  if (!currency) return amount;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatPrice(game: Game): string {
  if (!game.price.amount) return '—';
  return formatAmount(game.price.amount, game.price.currency);
}

/** gg.deals' own public search page - used when a game has no specific ggDealsUrl on file yet
 * (IGDB/Steam match never resolved, or resolved to nothing) but someone still wants to look up
 * pricing by hand (issue #336), same as they'd get typing the title into gg.deals themselves. */
export function ggDealsSearchUrl(title: string): string {
  return `https://gg.deals/search/?title=${encodeURIComponent(title)}`;
}
