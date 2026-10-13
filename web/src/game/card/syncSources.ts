import type { SyncSource } from '@queueup/shared';
import type { MessageKey } from '../../i18n';

/** The translated name of each library sync a game can come from. */
export const SYNC_SOURCE_KEY: Record<SyncSource, MessageKey> = {
  steam: 'game.detail.syncSource.steam',
  steam_wishlist: 'game.detail.syncSource.steamWishlist',
  playnite: 'game.detail.syncSource.playnite',
  xbox: 'game.detail.syncSource.xbox',
  exophase: 'game.detail.syncSource.exophase',
  psn: 'game.detail.syncSource.psn',
  retroachievements: 'game.detail.syncSource.retroachievements',
  file: 'game.detail.syncSource.file',
  itch: 'game.detail.syncSource.itch',
};
