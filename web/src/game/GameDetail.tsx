import { useState } from 'react';
import type { Game, GameStatus } from '@queueup/shared';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { BundleSheet } from './BundleSheet';
import { DuplicateSheet } from './DuplicateSheet';
import { IgdbMatchSheet } from './IgdbMatchSheet';
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
  const confirm = useConfirm();
  const scope = useScope();
  const { ops, games } = scope;
  const desktop = !useIsMobile();
  const steamMatch = useSteamAutoMatch();

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [dlc, setDlc] = useState<DlcTarget | null>(null);
  const [rematching, setRematching] = useState(false);
  const [markingDuplicate, setMarkingDuplicate] = useState(false);
  const [markingBundle, setMarkingBundle] = useState(false);

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
      style={st(
        desktop
          ? 'position:absolute;inset:0;background:var(--sheet);display:grid;grid-template-columns:340px minmax(0,1fr);overflow:hidden'
          : 'position:absolute;inset:0;background:var(--sheet);display:flex;flex-direction:column;overflow:hidden',
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
          onMatched={async (result, merges) => {
            if (merges) {
              // The sheet goes first: the confirmation would open behind it (issue #856). Declining
              // brings it back for another pick.
              setRematching(false);
              const ok = await confirm({
                title: t('game.igdbMatch.merge.title'),
                message: t('game.igdbMatch.merge.message', { from: game.title, to: result.title }),
                confirmLabel: t('game.igdbMatch.merge'),
                danger: true,
              });
              if (!ok) {
                setRematching(true);
                return;
              }
              ui.selectGame(null);
            }
            ops.setIgdbMatch(game.id, result.igdbId);
            setRematching(false);
          }}
        />
      )}

      {markingBundle && <BundleSheet game={game} onClose={() => setMarkingBundle(false)} />}

      {markingDuplicate && (
        <DuplicateSheet
          game={game}
          games={games}
          onClose={() => setMarkingDuplicate(false)}
          onPick={async (target) => {
            setMarkingDuplicate(false);
            const ok = await confirm({
              title: t('game.igdbMatch.merge.title'),
              message: t('game.igdbMatch.merge.message', { from: game.title, to: target.title }),
              confirmLabel: t('game.igdbMatch.merge'),
              danger: true,
            });
            if (!ok) {
              setMarkingDuplicate(true);
              return;
            }
            ui.selectGame(null);
            ops.mergeGame(game.id, target.id);
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
