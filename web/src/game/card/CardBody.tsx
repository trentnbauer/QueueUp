import type { ReactNode } from 'react';
import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { useUi } from '../../context/UiContext';
import { fmtMoney } from '../../lib/gameView';
import { st } from '../../ui/st';
import { useIsMobile } from '../../ui/useLayout';
import { useT } from '../../i18n';
import { coopWarning, formatInstallSize, playersKind, priceModeOf, sessionsToFinish, starScore } from './cardLogic';
import { SYNC_SOURCE_KEY } from './syncSources';
import { cardStatusLabel } from './statusLabel';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { useDlcKindLabel, useDlcList } from './ListSheets';
import { useLowestPrice } from './PriceSheets';
import type { SheetKind } from './Sheet';
import { StatsStrip } from './Stats';
import { StatusBlock } from './StatusBlock';
import { Row, RowGroup } from './ui';
import { Votes } from './Votes';

export interface CardBodyProps {
  game: Game;
  /** Two columns (hero | content), for the desktop modal. The phone sheet and the DLC card stack one column. */
  desktop: boolean;
  /** `dlc`: an add-on's own card, a shorter hero and fewer rows. */
  variant: 'main' | 'dlc';
  /** The base game, for a DLC card. */
  base?: Game | null;
  onClose: () => void;
  onBack?: () => void;
  changeStatus: (game: Game, status: GameStatus) => void;
  onOpenSheet: (kind: SheetKind) => void;
  onOpenReview: () => void;
}

/** The warning under the stats: single-player in a group, or more of you than the game takes. */
function CoopWarning({ game }: { game: Game }) {
  const t = useT();
  const { members, isShelf } = useScope();
  const warn = coopWarning(game, members.length, isShelf);
  if (!warn) return null;
  return (
    <div style={st('display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:16px;background:var(--warnBg);border:1px solid var(--warnLine);flex-shrink:0')}>
      <span style={st('font-size:16px;line-height:20px')}>⚠️</span>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 14px var(--font-ui);color:var(--star)')}>{warn.kind === 'solo' ? t('card.coop.soloTitle') : t('card.coop.overTitle', { max: warn.max, members: warn.members })}</span>
        <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--text2)')}>{warn.kind === 'solo' ? t('card.coop.soloSub') : t('card.coop.overSub')}</span>
      </span>
    </div>
  );
}

/** "Co-op shooter · 2020 · up to 4 players · ★ 8.7 · 60 GB · 🏆 10/20 · via Steam": whichever parts are known. */
function MetaLine({ game }: { game: Game }) {
  const t = useT();
  const { isShelf, games } = useScope();
  const ui = useUi();
  const bundle = game.bundleGameId ? games.find((g) => g.id === game.bundleGameId) : undefined;
  const players = playersKind(game);
  const star = starScore(game.reviewScore);
  const parts: ReactNode[] = [];
  const genre = game.genre?.split(',')[0]?.trim();
  if (genre) parts.push(genre);
  if (game.releaseYear) parts.push(String(game.releaseYear));
  if (players) parts.push(players.kind === 'solo' ? t('card.hero.solo') : t('card.hero.upTo', { max: players.max }));
  if (star) parts.push(<span key="star" style={{ color: 'var(--star)' }}>★ {star}</span>);
  const size = formatInstallSize(game.downloadSizeMb);
  if (size) parts.push(<span key="size" title={t('card.hero.sizeTitle')}>💾 {size}</span>);
  const ach = game.myAchievements;
  if (ach && ach.total > 0) parts.push(<span key="ach" title={t('home.row.achievements', { unlocked: ach.unlocked, total: ach.total })} style={ach.unlocked >= ach.total ? { color: 'var(--star)' } : undefined}>🏆 {ach.unlocked}/{ach.total}</span>);
  if (isShelf && game.syncSources.length > 0) parts.push(<span key="sync">{t('card.hero.via', { sources: game.syncSources.map((s) => t(SYNC_SOURCE_KEY[s])).join(' · ') })}</span>);
  // A game that came out of a bundle links back to it (issue #1172): the bundle opens to its list of games.
  if (bundle) {
    parts.push(
      <button key="bundle" type="button" onClick={() => ui.selectGame(bundle.id)} style={st('border:none;background:none;padding:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer')}>
        {t('card.bundle.from', { title: bundle.title })}
      </button>,
    );
  }
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
    </>
  );
}

/** The rows under the status block on the main card. */
function MainRows({ game, base, onBack, desktop, onOpenSheet }: { game: Game; base: Game | null; onBack?: () => void; desktop: boolean; onOpenSheet: (kind: SheetKind) => void }) {
  const t = useT();
  const { games, isShelf } = useScope();
  const mode = priceModeOf(game);
  const lowest = useLowestPrice(game);
  const dlc = useDlcList(game.id, !game.baseGameId);
  const added = games.filter((g) => g.baseGameId === game.id).length;
  const dlcCount = Math.max(dlc.data?.results.length ?? 0, added);
  const after = game.prerequisiteGameId ? games.find((g) => g.id === game.prerequisiteGameId) : null;
  const hours = [game.timeToBeatRushedHours, game.timeToBeatHours, game.timeToBeatCompletionistHours];
  const ttb = hours.some((h) => h != null) ? hours.map((h) => h ?? '–').join(' · ') + 'h' : '—';

  const priceValue = game.youOwn ? t('home.price.owned') : mode === 'live' ? fmtMoney(game.price.amount, game.price.currency) : mode === 'manual' ? t('card.rows.priceManual', { price: fmtMoney(game.manualPrice, game.price.currency) }) : t('card.rows.priceNone');
  const priceColor = game.youOwn ? 'var(--mint)' : mode === 'none' ? 'var(--accText)' : 'var(--muted)';

  return (
    <RowGroup columns={desktop ? 2 : 1}>
      <Row compact={desktop} chevron={!desktop} icon="💲" label={t('card.rows.priceHistory')} sub={mode === 'live' && lowest !== null ? t('card.rows.lowest', { price: fmtMoney(lowest, game.price.currency) }) : undefined} value={priceValue} valueColor={priceColor} onClick={() => onOpenSheet('price')} />
      <Row compact={desktop} chevron={!desktop} icon="↳" label={t('game.detail.playAfter')} value={after ? after.title : t('game.detail.none')} valueColor={after ? 'var(--accText)' : 'var(--muted)'} onClick={() => onOpenSheet('after')} />
      {game.baseGameId ? (
        base && onBack ? <Row compact={desktop} chevron={!desktop} icon="◫" label={t('card.dlc.baseGame')} value={base.title} onClick={onBack} /> : null
      ) : (
        <Row compact={desktop} chevron={!desktop} icon="＋" label={t('card.rows.dlc')} value={dlc.isPending && added === 0 ? '…' : dlcCount ? t(dlcCount === 1 ? 'card.rows.addons.one' : 'card.rows.addons.other', { n: dlcCount }) : t('game.detail.none')} onClick={() => onOpenSheet('dlc')} />
      )}
      <Row compact={desktop} chevron={!desktop} icon="⏱" label={t('card.rows.ttb')} value={ttb} onClick={() => onOpenSheet('ttb')} />
      <Row compact={desktop} chevron={!desktop} icon="🖥️" label={t('card.rows.specs')} value={t('card.rows.specsValue')} onClick={() => onOpenSheet('specs')} />
      <Row compact={desktop} chevron={!desktop} icon="⋯" label={t('card.rows.more')} value={isShelf ? t('card.rows.moreShelf') : t('card.rows.moreRoom')} onClick={() => onOpenSheet('more')} />
    </RowGroup>
  );
}

/** The rows on a DLC's own card: its price alert, its play-after, and a way back to the base game. */
function DlcRows({ game, base, onBack, onOpenSheet }: { game: Game; base: Game | null; onBack?: () => void; onOpenSheet: (kind: SheetKind) => void }) {
  const t = useT();
  const { games } = useScope();
  const mode = priceModeOf(game);
  const after = game.prerequisiteGameId ? games.find((g) => g.id === game.prerequisiteGameId) : null;
  return (
    <RowGroup>
      <Row
        icon="🔔"
        label={t('card.more.alert')}
        value={mode !== 'live' ? t('card.more.needsLive') : game.targetPrice ? t('card.more.alertAt', { price: fmtMoney(game.targetPrice, game.price.currency) }) : t('card.more.off')}
        valueColor={game.targetPrice && mode === 'live' ? 'var(--accText)' : 'var(--muted)'}
        dim={mode !== 'live'}
        onClick={() => onOpenSheet('alert')}
      />
      <Row icon="↳" label={t('game.detail.playAfter')} value={after ? after.title : t('game.detail.none')} valueColor={after ? 'var(--accText)' : 'var(--muted)'} onClick={() => onOpenSheet('after')} />
      {base && onBack && <Row icon="◫" label={t('card.dlc.baseGame')} value={base.title} onClick={onBack} />}
    </RowGroup>
  );
}

/** One game's card: hero, stats, votes, status, rows, footer. Phone: one scrolling column. Desktop: hero left, content right. */
export function CardBody({ game, desktop, variant, base = null, onClose, onBack, changeStatus, onOpenSheet, onOpenReview }: CardBodyProps) {
  const t = useT();
  const { room, isShelf } = useScope();
  const kindLabel = useDlcKindLabel();
  const phone = useIsMobile();
  const dlcList = useDlcList(game.baseGameId, game.baseGameId !== null);
  const isDlc = variant === 'dlc';
  // An add-on opened on its own (not stacked) still reads as an add-on, with a way back to its base game.
  const isAddon = isDlc || !!game.baseGameId;

  const place = isShelf ? t('game.detail.kicker.shelf') : (room?.name ?? '').toUpperCase();
  const dlcKind = dlcList.data?.results.find((r) => r.igdbId === game.igdbId)?.dlcKind;
  const kicker = isAddon
    ? [place, kindLabel(dlcKind).toUpperCase(), cardStatusLabel(game.status).toUpperCase()].join(' · ')
    : [place, cardStatusLabel(game.status).toUpperCase(), game.hiddenFromOthers ? t('game.detail.kicker.hidden') : ''].filter(Boolean).join(' · ');
  const meta = isAddon ? (base ? t('card.dlc.metaWithBase', { kind: kindLabel(dlcKind), base: base.title }) : kindLabel(dlcKind)) : <MetaLine game={game} />;
  const sess = !isShelf && !isDlc ? sessionsToFinish(game.timeToBeatHours, room?.typicalSessionHours) : null;

  const hero = (
    <Hero
      title={game.title}
      coverUrl={game.coverImageUrl}
      heroUrl={isDlc ? null : game.heroImageUrl}
      kicker={kicker}
      meta={meta}
      sessions={sess ? t('card.hero.sessions', { n: sess.count, hours: sess.hours }) : null}
      trailerGameId={isDlc ? null : game.id}
      desktop={desktop}
      compact={isDlc}
      handle={phone}
      onClose={onClose}
      back={base && onBack ? { label: base.title, onClick: onBack } : null}
    />
  );

  const content = (
    <>
      <StatsStrip game={game} desktop={desktop} onOpenPrice={() => onOpenSheet('price')} />
      <CoopWarning game={game} />
      <Votes game={game} size={isDlc ? 52 : desktop ? 52 : 56} />
      <StatusBlock game={game} onOpenPicker={() => onOpenSheet('status')} onOpenReview={onOpenReview} changeStatus={changeStatus} />
      {isDlc ? <DlcRows game={game} base={base} onBack={onBack} onOpenSheet={onOpenSheet} /> : <MainRows game={game} base={base} onBack={onBack} desktop={desktop} onOpenSheet={onOpenSheet} />}
      <Footer game={game} />
    </>
  );

  if (desktop) {
    return (
      <>
        {hero}
        <div style={st('position:relative;display:flex;flex-direction:column;min-height:0;min-width:0')}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={st('position:absolute;top:16px;right:16px;z-index:1;width:36px;height:36px;border-radius:50%;border:none;background:var(--chip);color:var(--text);font-size:18px;line-height:1')}
          >
            ×
          </button>
          <div style={st('flex:1;min-height:0;overflow-y:auto;padding:28px;display:flex;flex-direction:column;gap:18px')}>
            <div style={st('margin-right:48px;flex-shrink:0')}>
              <StatsStrip game={game} desktop onOpenPrice={() => onOpenSheet('price')} />
            </div>
            <CoopWarning game={game} />
            <Votes game={game} size={52} />
            <StatusBlock game={game} onOpenPicker={() => onOpenSheet('status')} onOpenReview={onOpenReview} changeStatus={changeStatus} />
            <MainRows game={game} base={base} onBack={onBack} desktop onOpenSheet={onOpenSheet} />
            <Footer game={game} />
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={st('flex:1;min-height:0;overflow-y:auto')}>
      {hero}
      <div style={st('padding:14px 20px 32px;display:flex;flex-direction:column;gap:18px')}>{content}</div>
    </div>
  );
}
