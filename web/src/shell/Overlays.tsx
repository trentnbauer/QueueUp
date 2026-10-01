import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { roomSpinApi } from '../api/rooms';
import { AddGameDialog } from '../dialogs/AddGameDialog';
import { DeckDialog } from '../dialogs/DeckDialog';
import { CompletionsDialog, ImportDialog, NeedsReviewDialog, PlayniteDialog } from '../dialogs/ImportDialogs';
import { MeDialog } from '../dialogs/MeDialog';
import { ChangelogDialog, DlcDialog, PlaytimeDialog } from '../dialogs/MiscDialogs';
import { RankedDialog } from '../dialogs/RankedDialog';
import { ReviewSheet } from '../dialogs/ReviewSheet';
import { AddRoomDialog, RoomSettingsDialog } from '../dialogs/RoomDialogs';
import { SensitiveGamesPrompt } from '../dialogs/SensitiveGamesDialog';
import { ShelfSettingsDialog } from '../dialogs/ShelfSettingsDialog';
import { FriendsDialog, NotificationsDialog } from '../dialogs/SocialDialogs';
import { SpinDialog } from '../dialogs/SpinDialog';
import { useChangelog } from '../hooks/useChangelog';
import { usePlaytimeReview } from '../hooks/usePlaytimeReview';
import { UiToast } from '../ui/ToastView';

/** Every dialog/sheet the app can open, mounted from the shared open-flags in UiContext, plus the
 * things that open themselves (shared spin starting, new changelog, playtime review, steam
 * completions to review, "mark Beaten on your shelf too?"). */
export function Overlays() {
  const ui = useUi();
  const scope = useScope();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { ops, isShelf, games, room } = scope;
  const d = ui.dialogs;

  // "Mark it Beaten on your shelf too?" after finishing a room game.
  const promptId = ops.shelfSyncPrompt?.roomGameId;
  useEffect(() => {
    const p = ops.shelfSyncPrompt;
    if (!p) return;
    void (async () => {
      const exists = !!p.suggestion.shelfGameId;
      const ok = await confirm({
        title: 'Mark it Beaten on your shelf too?',
        message: exists
          ? `"${p.suggestion.title}" is on your Personal Shelf too. Mark it Beaten there as well?`
          : `"${p.suggestion.title}" isn't on your Personal Shelf yet. Add it there, already marked Beaten?`,
        confirmLabel: 'Yes, sync it',
        cancelLabel: 'No thanks',
      });
      if (ok) {
        ops.confirmShelfSync();
        ui.notify('Synced to your Personal Shelf');
      } else {
        ops.dismissShelfSync();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId]);

  // A shared spin starting in the room you're looking at opens the reel for you.
  const roomId = room?.id;
  const { data: active } = useQuery({
    queryKey: ['rooms', 'active-spins'],
    queryFn: roomSpinApi.activeSpins,
    enabled: !!user,
    refetchInterval: 2_000,
  });
  const seenSpin = useRef<string | null>(null);
  useEffect(() => {
    const spin = roomId ? active?.spins.find((s) => s.roomId === roomId) : undefined;
    if (spin && seenSpin.current !== spin.spinId) {
      seenSpin.current = spin.spinId;
      ui.openDialog('spin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, roomId]);

  // Steam scan finished with something to review.
  const { completions } = useSteamImportContext();
  const hadCompletions = useRef(false);
  useEffect(() => {
    if (completions.result && !hadCompletions.current) {
      hadCompletions.current = true;
      ui.closeDialog('import');
      ui.openDialog('completions');
    }
    if (!completions.result) hadCompletions.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions.result]);

  // One-shot auto prompts per page load: what's new, and "Played anything?" on the shelf.
  const changelog = useChangelog();
  const promptedChangelog = useRef(false);
  const playtime = usePlaytimeReview(isShelf ? games : []);
  const promptedPlaytime = useRef(false);
  const busy = Object.keys(d).length > 0;
  useEffect(() => {
    if (busy) return;
    if (!promptedChangelog.current && changelog.newEntries.length > 0) {
      promptedChangelog.current = true;
      ui.openDialog('changelog');
    } else if (!promptedPlaytime.current && isShelf && playtime.entries.length > 0) {
      promptedPlaytime.current = true;
      ui.openDialog('playtime');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, changelog.newEntries.length, isShelf, playtime.entries.length]);

  const reviewGame = d.review ? games.find((g) => g.id === d.review!.gameId) : undefined;

  return (
    <>
      {d.add && <AddGameDialog />}
      {d.import && <ImportDialog />}
      {d.addRoom && <AddRoomDialog />}
      {d.roomSettings && !isShelf && <RoomSettingsDialog />}
      {d.shelfSettings && <ShelfSettingsDialog />}
      {d.notifications && <NotificationsDialog />}
      {d.me && <MeDialog />}
      {d.friends && <FriendsDialog />}
      {d.spin && <SpinDialog onClose={() => ui.closeDialog('spin')} />}
      {d.ranked && <RankedDialog />}
      {d.deck && <DeckDialog />}
      {d.needsReview && <NeedsReviewDialog />}
      {d.playtime && <PlaytimeDialog />}
      {d.completions && <CompletionsDialog />}
      {d.playnite && <PlayniteDialog />}
      {d.changelog && <ChangelogDialog />}
      {d.dlc && <DlcDialog />}
      {d.review && reviewGame && <ReviewSheet game={reviewGame} />}
      <SensitiveGamesPrompt active={isShelf && !busy} />
      <UiToast />
    </>
  );
}
