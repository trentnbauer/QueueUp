import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Game, GameStatus } from '@queueup/shared';
import { gamesApi } from '../../api/games';
import { useScope } from '../../context/ScopeContext';
import { useUi } from '../../context/UiContext';
import { st } from '../../ui/st';
import { useIsMobile } from '../../ui/useLayout';
import { useT } from '../../i18n';
import { CardBody } from './CardBody';
import { Hero } from './Hero';
import { useDlcKindLabel, type DlcTarget } from './ListSheets';
import { SheetHost } from './SheetHost';
import type { SheetKind } from './Sheet';
import { useSheetEscape } from './useSheetEscape';

/** An add-on that isn't on this list yet: a preview, never added by itself. One button adds it (Backlog in a room, Wishlist on the shelf). */
function DlcPreview({ target, base, onBack, onClose }: { target: DlcTarget; base: Game | null; onBack: () => void; onClose: () => void }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { room, isShelf, members } = useScope();
  const kindLabel = useDlcKindLabel();
  const phone = useIsMobile();
  const [adding, setAdding] = useState(false);
  const result = target.result!;
  const place = isShelf ? t('card.dlc.yourShelf') : (room?.name ?? '');

  async function add() {
    if (!base) return;
    setAdding(true);
    try {
      const res = await gamesApi.create({ igdbId: result.igdbId, roomId: base.roomId, baseGameId: base.id, ...(isShelf ? { status: 'wishlist' as const } : {}) });
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify('suggestion' in res ? t('settings.dlc.suggested', { title: result.title }) : t('settings.dlc.added', { title: result.title }));
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : t('settings.dlc.addFailed'), undefined, undefined, true);
    } finally {
      setAdding(false);
    }
  }

  const cell = 'display:flex;flex-direction:column;gap:2px;padding:12px;background:var(--surf)';
  return (
    <div style={st('flex:1;min-height:0;overflow-y:auto')}>
      <Hero
        title={result.title}
        coverUrl={result.coverImageUrl}
        heroUrl={null}
        kicker={[place.toUpperCase(), kindLabel(target.kind).toUpperCase(), t('card.dlc.notAdded').toUpperCase()].join(' · ')}
        meta={base ? t('card.dlc.metaWithBase', { kind: kindLabel(target.kind), base: base.title }) : kindLabel(target.kind)}
        desktop={false}
        compact
        handle={phone}
        onClose={onClose}
        back={base ? { label: base.title, onClick: onBack } : null}
      />
      <div style={st('padding:14px 20px 28px;display:flex;flex-direction:column;gap:18px')}>
        <div style={st('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border-radius:18px;overflow:hidden;background:var(--chip);flex-shrink:0')}>
          <div style={st(cell)}>
            <span style={st('font:800 20px var(--font-display);color:var(--faint)')}>—</span>
            <span style={st('font:500 11px var(--font-ui);color:var(--muted)')}>{t('card.dlc.noVotes')}</span>
          </div>
          <div style={st(cell)}>
            <span style={st('font:800 20px var(--font-display)')}>{isShelf ? '—' : `0/${members.length}`}</span>
            <span style={st('font:500 11px var(--font-ui);color:var(--muted)')}>{t('card.dlc.ownIt')}</span>
          </div>
          <div style={st(cell)}>
            <span style={st(`font:800 20px var(--font-display);${result.releaseYear ? '' : 'color:var(--faint)'}`)}>{result.releaseYear ?? '—'}</span>
            <span style={st('font:500 11px var(--font-ui);color:var(--muted)')}>{t('card.dlc.released')}</span>
          </div>
        </div>
        <div style={st('display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:20px;background:var(--surf);border:1px dashed var(--line)')}>
          <span style={st('font:700 17px var(--font-display)')}>{t('card.dlc.notIn', { place })}</span>
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{isShelf ? t('card.dlc.addCopyShelf') : t('card.dlc.addCopyRoom')}</span>
          <button
            type="button"
            disabled={adding || !base}
            onClick={() => void add()}
            style={st(`height:48px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 15px var(--font-ui);opacity:${adding ? 0.6 : 1}`)}
          >
            {adding ? t('settings.dlc.adding') : t('card.dlc.addTo', { place })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** An add-on's own card: stacked over the base card (a sheet on a phone, a 420px card on desktop). Added, it has votes, status, its
 * own price alert and play-after; not added, it is a preview. */
export function DlcCard({
  target,
  base,
  onBack,
  onClose,
  changeStatus,
}: {
  target: DlcTarget;
  base: Game;
  onBack: () => void;
  onClose: () => void;
  changeStatus: (game: Game, status: GameStatus) => void;
}) {
  const ui = useUi();
  const { games } = useScope();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  useSheetEscape(sheet !== null, () => setSheet(null));

  // Follow the live copy so votes and status update in place, and so a just-added add-on turns from a preview into a card.
  const live = target.game
    ? (games.find((g) => g.id === target.game!.id) ?? target.game)
    : target.result
      ? (games.find((g) => g.igdbId === target.result!.igdbId && g.baseGameId === base.id) ?? null)
      : null;

  const body = (
    <div style={st('position:absolute;inset:0;display:flex;flex-direction:column;background:var(--sheet);overflow:hidden')}>
      {live ? (
        <>
          <CardBody
            game={live}
            desktop={false}
            variant="dlc"
            base={base}
            onClose={onClose}
            onBack={onBack}
            changeStatus={changeStatus}
            onOpenSheet={setSheet}
            onOpenReview={() => ui.openDialog('review', { gameId: live.id, edit: true })}
          />
          <SheetHost
            game={live}
            kind={sheet}
            desktop={false}
            setKind={setSheet}
            onPickStatus={(s) => {
              setSheet(null);
              changeStatus(live, s);
            }}
            onOpenReview={() => ui.openDialog('review', { gameId: live.id, edit: true })}
          />
        </>
      ) : (
        <DlcPreview target={target} base={base} onBack={onBack} onClose={onClose} />
      )}
    </div>
  );
  return body;
}
