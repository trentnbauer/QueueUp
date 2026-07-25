import { useState } from 'react';
import { gamesApi } from '../api/games';

/** Backs the "Not finding a price? Fix match" flow (issue #337). Before falling back to the
 * manual SteamMatchPicker, tries the same title search the picker would run and auto-applies it
 * when it's unambiguous - the picker is only worth a person's time when the automatic match
 * genuinely can't tell which Steam release is right. Only ever call attemptAutoMatch for a game
 * that has no existing match; a game with a match a person is explicitly flagging as wrong
 * ("Wrong game matched?") should go straight to the picker via openPicker instead, since silently
 * reapplying the same single-result search would likely reproduce the same wrong match. */
export function useSteamAutoMatch() {
  const [checkingGameId, setCheckingGameId] = useState<string | null>(null);
  const [pickerGameId, setPickerGameId] = useState<string | null>(null);

  async function attemptAutoMatch(gameId: string, title: string, onMatched: (steamAppId: number | null) => void) {
    setCheckingGameId(gameId);
    try {
      const { results } = await gamesApi.steamSearch(gameId, title);
      if (results.length === 1) {
        onMatched(results[0].steamAppId);
        return;
      }
    } catch {
      // Fall through to the manual picker, which will surface the same search (and its error) itself.
    } finally {
      setCheckingGameId((current) => (current === gameId ? null : current));
    }
    setPickerGameId(gameId);
  }

  return {
    checkingGameId,
    pickerGameId,
    attemptAutoMatch,
    openPicker: setPickerGameId,
    closePicker: () => setPickerGameId(null),
  };
}
