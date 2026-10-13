import { useState } from 'react';
import type { Game, GameSearchResult, GameStatus } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { hexToOklchHue } from '../theme/roomTheme';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { BundleSheet } from './BundleSheet';
import { DuplicateSheet } from './DuplicateSheet';
import { IgdbMatchSheet } from './IgdbMatchSheet';
import { MergeConfirmDialog } from './MergeConfirmDialog';
import { SteamMatchSheet } from './SteamMatchSheet';
import { CardBody } from './card/CardBody';
import { DlcCard } from './card/DlcCard';
import type { DlcTarget } from './card/ListSheets';
import { SheetHost } from './card/SheetHost';
import type { SheetKind } from './card/Sheet';
import { useSheetEscape } from './card/useSheetEscape';

/** One game's card, the body of both the desktop modal and the phone sheet: hero, stats, votes, status and rows, with
 * the status picker and every menu opening as sheets over it. An add-on opens as its own card stacked on top. */
export function GameDetail({ game, onClose, changeStatus }: { game: Game; onClose: () => void; changeStatus: (game: Game, status: GameStatus) => void }) {
  const t = useT();
  const ui = useUi();
  const scope = useScope();
  const { ops, games } = scope;
  const desktop = !useIsMobile();
  const steamMatch = useSteamAutoMatch();
  // The card is a dialog, outside the shell that carries the room tint, so it carries it itself: the room's colour in a room,
  // the colour picked in Shelf settings on the shelf (#1167).
  const { shelfColor } = useAuth();
  const tint = scope.room?.accentColor ?? (scope.isShelf ? shelfColor : null);
  const hue = tint ? hexToOklchHue(tint) : null;
  const tintProps = hue === null ? {} : { 'data-room': '1' };

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [dlc, setDlc] = useState<DlcTarget | null>(null);
  const [rematching, setRematching] = useState(false);
  const [markingDuplicate, setMarkingDuplicate] = useState(false);
  const [markingBundle, setMarkingBundle] = useState(false);
  // A merge waiting to be confirmed: a duplicate picked from the list, or a re-match onto a game that is already there.
  const [merge, setMerge] = useState<{ kind: 'duplicate'; target: Game } | { kind: 'rematch'; result: GameSearchResult } | null>(null);

  // Escape closes the top layer first: a sheet, then a stacked add-on card, then the card itself.
  useSheetEscape(sheet !== null, () => setSheet(null));
  useSheetEscape(dlc !== null, () => setDlc(null));

  const base = game.baseGameId ? (games.find((g) => g.id === game.baseGameId) ?? null) : null;
  const live = !!game.price.amount;

  // Won't Play takes a game out of sight, so the card closes with it.
  const change = (g: Game, status: GameStatus) => {
    changeStatus(g, status);
    if (status === 'wont_play') onClose();
  };
  const openReview = () => ui.openDialog('review', { gameId: game.id, edit: true });

  return (
    <div
      {...tintProps}
      style={st(
        desktop
          ? 'position:absolute;inset:0;background:var(--sheet);display:grid;grid-template-columns:340px minmax(0,1fr);overflow:hidden'
          : 'position:absolute;inset:0;background:var(--sheet);display:flex;flex-direction:column;overflow:hidden',
        hue === null ? undefined : ({ '--rh': String(hue) } as React.CSSProperties),
      )}
    >
      <CardBody
        game={game}
        desktop={desktop}
        variant="main"
        base={base}
        onClose={onClose}
        onBack={base ? () => ui.selectGame(base.id) : undefined}
        changeStatus={change}
        onOpenSheet={setSheet}
        onOpenReview={openReview}
      />

      <SheetHost
        game={game}
        kind={sheet}
        desktop={desktop}
        setKind={setSheet}
        onPickStatus={(status) => {
          setSheet(null);
          change(game, status);
        }}
        onOpenReview={openReview}
        onOpenDlc={(target) => {
          setSheet(null);
          setDlc(target);
        }}
        onRematch={() => {
          setSheet(null);
          setRematching(true);
        }}
        onSteamMatch={() => {
          setSheet(null);
          if (live || game.ggDealsUrl) steamMatch.openPicker(game.id);
          else void steamMatch.attemptAutoMatch(game.id, game.title, (id) => ops.setSteamMatch(game.id, id));
        }}
        onDuplicate={() => {
          setSheet(null);
          setMarkingDuplicate(true);
        }}
        onBundle={() => {
          setSheet(null);
          setMarkingBundle(true);
        }}
      />

      {dlc &&
        (desktop ? (
          <>
            <div role="presentation" onClick={() => setDlc(null)} style={st('position:absolute;inset:0;z-index:6;background:oklch(0 0 0 / 0.45)')} />
            <div style={st('position:absolute;z-index:7;top:16px;bottom:16px;left:50%;width:420px;margin-left:-210px;border-radius:22px;overflow:hidden;border:1px solid var(--line);box-shadow:0 24px 60px oklch(0 0 0 / 0.6)')}>
              <DlcCard target={dlc} base={game} onBack={() => setDlc(null)} onClose={onClose} changeStatus={change} />
            </div>
          </>
        ) : (
          <div style={st('position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;background:oklch(0 0 0 / 0.5);backdrop-filter:blur(3px)')}>
            <div role="presentation" onClick={() => setDlc(null)} style={st('height:24px;flex-shrink:0')} />
            <div style={st('position:relative;flex:1;min-height:0;border-radius:24px 24px 0 0;overflow:hidden;box-shadow:0 -12px 40px oklch(0 0 0 / 0.45)')}>
              <DlcCard target={dlc} base={game} onBack={() => setDlc(null)} onClose={onClose} changeStatus={change} />
            </div>
          </div>
        ))}

      {rematching && (
        <IgdbMatchSheet
          gameId={game.id}
          gameTitle={game.title}
          onClose={() => setRematching(false)}
          onMatched={(result, merges) => {
            // Re-matching onto a game that is already on the list merges them: say which goes and which stays first.
            // The sheet closes first, so the confirmation isn't behind it (issue #856); Cancel brings it back.
            setRematching(false);
            if (merges) setMerge({ kind: 'rematch', result });
            else ops.setIgdbMatch(game.id, result.igdbId);
          }}
        />
      )}

      {markingBundle && <BundleSheet game={game} onClose={() => setMarkingBundle(false)} />}

      {markingDuplicate && (
        <DuplicateSheet
          game={game}
          games={games}
          onClose={() => setMarkingDuplicate(false)}
          onPick={(target) => {
            setMarkingDuplicate(false);
            setMerge({ kind: 'duplicate', target });
          }}
        />
      )}

      {merge && (
        <MergeConfirmDialog
          first={{ id: game.id, title: game.title, coverImageUrl: game.coverImageUrl }}
          second={
            merge.kind === 'duplicate'
              ? { id: merge.target.id, title: merge.target.title, coverImageUrl: merge.target.coverImageUrl }
              : { id: String(merge.result.igdbId), title: merge.result.title, coverImageUrl: merge.result.coverImageUrl }
          }
          allowSwap={merge.kind === 'duplicate'}
          onCancel={() => {
            if (merge.kind === 'duplicate') setMarkingDuplicate(true);
            else setRematching(true);
            setMerge(null);
          }}
          onConfirm={(removeId, keepId) => {
            setMerge(null);
            ui.selectGame(null);
            if (merge.kind === 'duplicate') ops.mergeGame(removeId, keepId);
            else ops.setIgdbMatch(game.id, merge.result.igdbId);
          }}
        />
      )}

      {steamMatch.pickerGameId === game.id && (
        <SteamMatchSheet
          gameId={game.id}
          gameTitle={game.title}
          hasExistingMatch={live || game.ggDealsUrl !== null}
          onClose={steamMatch.closePicker}
          onMatched={(id) => {
            ops.setSteamMatch(game.id, id);
            steamMatch.closePicker();
          }}
        />
      )}
    </div>
  );
}
