import { t } from '../i18n';

export interface SteamImportCounts {
  imported: number;
  skipped: number;
  /** Skipped games sent to Needs matching. */
  needsMatching?: number;
}

/** The result of a Steam library or wishlist import, in words: new games added, new games waiting to be
 * matched (Needs matching), or nothing new. No counts: "checked 80 of 826" read as if most had been missed. */
export function steamImportMessage(kind: 'library' | 'wishlist', c: SteamImportCounts): string {
  const needsMatching = c.needsMatching ?? 0;
  const couldNot = c.skipped - needsMatching > 0;
  const parts: string[] = [];
  if (c.imported > 0) parts.push(t(`add.steamImport.${kind}Added`));
  else if (needsMatching > 0) parts.push(t('add.steamImport.toMatch'));
  else parts.push(t(`add.steamImport.${kind}None`));
  if (needsMatching > 0) parts.push(t('add.steamImport.openMatching'));
  if (couldNot) parts.push(t('add.steamImport.couldNot'));
  return parts.join(' ');
}
