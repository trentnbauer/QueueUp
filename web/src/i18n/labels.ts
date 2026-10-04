import type { DiscordEventKey, EmailAlertType, GameStatus, PriceRegion, ReviewCategoryKey, SpinWheelTheme } from '@queueup/shared';
import { t, type MessageKey } from './index';

/** Translated versions of the shared label maps (statuses, spin types, review categories, ...).
 * Use these instead of the English maps in @queueup/shared and lib/gameView. Each reads the current
 * language when called, so call them while rendering. */
export const statusLabel = (s: GameStatus) => t(`labels.status.${s}` as MessageKey);
export const statusDesc = (s: GameStatus) => t(`labels.statusDesc.${s}` as MessageKey);
export const spinThemeLabel = (theme: SpinWheelTheme) => t(`labels.spinTheme.${theme}` as MessageKey);
export const spinThemeHint = (theme: SpinWheelTheme) => t(`labels.spinHint.${theme}` as MessageKey);
export const reviewCategoryLabel = (key: ReviewCategoryKey) => t(`labels.review.${key}` as MessageKey);
/** 1-5: Poor, Meh, OK, Good, Great. */
export const reviewScoreLabel = (score: number) => t(`labels.reviewScore.${score}` as MessageKey);
export const discordEventLabel = (key: DiscordEventKey) => t(`labels.discord.${key}` as MessageKey);
export const emailAlertLabel = (key: EmailAlertType) => t(`labels.emailAlert.${key}` as MessageKey);
export const priceRegionLabel = (region: PriceRegion) => t(`labels.region.${region}` as MessageKey);

/** A read-only map whose values are looked up when read, so `MAP[key]` call sites stay as they are
 * and still follow the current language. */
export function liveMap<K extends string>(get: (key: K) => string): Record<K, string> {
  return new Proxy({} as Record<K, string>, { get: (_target, key) => (typeof key === 'string' ? get(key as K) : undefined) });
}
