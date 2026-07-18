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
