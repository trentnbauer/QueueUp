import { LibraryLogo, type LibraryKind } from '../ui/LibraryLogo';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { suggestsBeatenByPlaytime, suggestsPlaying, type Game, type GameStatus, type SyncSource, type VoteValue } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useGameAchievements } from '../hooks/useGameAchievements';
import { useGamePlayLog } from '../hooks/useGamePlayLog';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { defaultPrerequisite } from '../components/gameGridLogic';
import {
  STATUS_LABEL,
  VOTES,
  VOTE_VALUES,
  fmtMoney,
  gameScore,
  hasLivePrice,
  pctAboveLow,
  releaseDateLabel,
  shortDate,
} from '../lib/gameView';
import { ggDealsSearchUrl } from '../utils/formatPrice';
import { formatRelativeTime } from '../utils/relativeTime';
import { ReviewEmbed } from '../dialogs/ReviewSheet';
import { PriceHistoryChart } from './PriceHistoryChart';
import { SteamMatchSheet } from './SteamMatchSheet';
import { IgdbMatchSheet } from './IgdbMatchSheet';
import { Avatar, coverBg, GOLD } from '../ui/primitives';
import { Trailer } from './Trailer';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { statusLabel } from '../i18n/labels';

const H = 'font:600 15px var(--font-display)';
const FIELD = 'flex:1;min-width:0;height:42px;padding:0 14px;border-radius:999px;background:var(--surf);border:1px solid var(--line);color:var(--text);font-size:15px;outline:none';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;justify-content:space-between;align-items:center')}>
        <span style={st(H)}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

type OwnershipState = 'owned' | 'wishlist' | 'none';

const OWNERSHIP_MARK: Record<OwnershipState, { emoji: string; label: MessageKey }> = {
  owned: { emoji: '✅', label: 'game.detail.ownership.owned' },
  wishlist: { emoji: '🎁', label: 'game.detail.ownership.wishlist' },
  none: { emoji: '❌', label: 'game.detail.ownership.none' },
};

/** Whether a room member owns the game, has it wishlisted, or neither - in their vote row. */
function OwnershipMark({ state }: { state: OwnershipState }) {
  const t = useT();
  const { emoji } = OWNERSHIP_MARK[state];
  const label = t(OWNERSHIP_MARK[state].label);
  return (
    <span title={label} aria-label={label} role="img" style={st(`flex-shrink:0;font-size:15px;line-height:1;opacity:${state === 'none' ? 0.55 : 1}`)}>
      {emoji}
    </span>
  );
}

/** "🏆 10/20" next to a member's vote in a room, gold once they're at 100%. */
function MemberAchievements({ counts }: { counts: { unlocked: number; total: number } | null }) {
  const t = useT();
  if (!counts || counts.total === 0) return null;
  const full = counts.unlocked >= counts.total;
  const label = t('game.detail.memberAchievements', { unlocked: counts.unlocked, total: counts.total });
  return (
    <span
      title={label}
      aria-label={label}
      style={st(
        `flex-shrink:0;height:22px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font:600 11.5px var(--font-ui);${
          full ? `background:${GOLD};color:oklch(0.28 0.06 70)` : 'background:var(--surf2);color:var(--text2)'
        }`,
      )}
    >
      🏆 {counts.unlocked}/{counts.total}
    </span>
  );
}

/** Which logo goes beside each sync source's name. */
const SYNC_SOURCE_LOGO: Record<SyncSource, LibraryKind> = {
  steam: 'steam',
  steam_wishlist: 'steam',
  playnite: 'playnite',
  xbox: 'xbox',
  exophase: 'exophase',
  psn: 'playstation',
};

const SYNC_SOURCE_KEY: Record<SyncSource, MessageKey> = {
  steam: 'game.detail.syncSource.steam',
  steam_wishlist: 'game.detail.syncSource.steamWishlist',
  playnite: 'game.detail.syncSource.playnite',
  xbox: 'game.detail.syncSource.xbox',
  exophase: 'game.detail.syncSource.exophase',
  psn: 'game.detail.syncSource.psn',
};

/** Everything about one game - the body of both the desktop right panel and the phone sheet. */
export function GameDetail({ game, onClose, changeStatus }: { game: Game; onClose: () => void; changeStatus: (game: Game, status: GameStatus) => void }) {
  const t = useT();
  const scope = useScope();
  const navigate = useNavigate();
  const ui = useUi();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { ops, members, isShelf } = scope;
  const { entries: playLog } = useGamePlayLog(game.id);
  const { players } = useGameAchievements(game.id);
  const steamMatch = useSteamAutoMatch();
  const [rematching, setRematching] = useState(false);
  const [editTarget, setEditTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const [editManual, setEditManual] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  const live = hasLivePrice(game);
  const own = game.youOwn;
  const showPrice = game.status !== 'playing' && game.status !== 'replay';
  const refreshing = ops.isRefreshingPrice(game.id);
  const currency = game.price.currency;
  const showLow = live && game.price.historicalLow != null && Number(game.price.historicalLow) < Number(game.price.amount);
  const atLow = live && !own && game.price.historicalLow != null && Number(game.price.historicalLow) >= Number(game.price.amount);
  // Null when either side is free/missing (issue #797) - the "All-time low" line then shows alone.
  const abovePct = pctAboveLow(game.price.amount, game.price.historicalLow);

  const ttb = [
    game.timeToBeatRushedHours != null && t('game.detail.ttb.rushed', { hours: game.timeToBeatRushedHours }),
    game.timeToBeatHours != null && t('game.detail.ttb.main', { hours: game.timeToBeatHours }),
    game.timeToBeatCompletionistHours != null && t('game.detail.ttb.completionist', { hours: game.timeToBeatCompletionistHours }),
  ].filter(Boolean) as string[];

  const coopWarn =
    !isShelf && game.singlePlayerOnly === true && members.length > 1
      ? t('game.detail.coop.singlePlayer')
      : !isShelf && game.maxCoopPlayers != null && members.length > game.maxCoopPlayers
      ? t('game.detail.coop.tooMany', { max: game.maxCoopPlayers, count: members.length })
      : null;

  // A room member's copy of the game, shown in their vote row: owned wins over wishlisted.
  const ownershipOf = (userId: string): OwnershipState =>
    game.ownerIds.includes(userId) ? 'owned' : game.wishlisterIds.includes(userId) ? 'wishlist' : 'none';

  // A room member's Steam achievement count, shown next to their vote: the live figure fetched for
  // this modal when it's in, otherwise the stored one that came with the game.
  const achievementsFor = (userId: string): { unlocked: number; total: number } | null => {
    const live = players.find((p) => p.user.id === userId);
    if (live) return live;
    if (userId === user?.id) return game.myAchievements;
    return game.memberAchievements.find((a) => a.user.id === userId) ?? null;
  };

  // Nudges (never automatic): 100% Steam achievements, or playtime near the time to beat.
  const mine = players.find((p) => p.user.id === user?.id);
  const fullyAchieved = !!mine && mine.total > 0 && mine.unlocked === mine.total && game.status !== 'done' && game.status !== 'dropped';
  const playedHours = game.currentPlaytimeMinutes ? Math.round(game.currentPlaytimeMinutes / 60) : 0;
  const nudgeBeaten = fullyAchieved || suggestsBeatenByPlaytime(game);
  const nudgePlaying = !nudgeBeaten && suggestsPlaying(game);

  const kicker = [isShelf ? t('game.detail.kicker.shelf') : (scope.room?.name ?? '').toUpperCase(), STATUS_LABEL[game.status].toUpperCase(), game.hiddenFromOthers ? t('game.detail.kicker.hidden') : '']
    .filter(Boolean)
    .join(' · ');

  const score = gameScore(game);
  const myVote = game.myVote ?? 0;

  const others = useMemo(() => {
    const byId = new Map(scope.games.map((g) => [g.id, g]));
    const wouldCycle = (candidateId: string) => {
      const seen = new Set<string>([game.id]);
      let cur: string | null = candidateId;
      while (cur !== null) {
        if (seen.has(cur)) return true;
        seen.add(cur);
        cur = byId.get(cur)?.prerequisiteGameId ?? null;
      }
      return false;
    };
    return scope.games.filter((g) => g.id !== game.id && !wouldCycle(g.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [scope.games, game.id]);
  const prereqId = game.prerequisiteGameId ?? defaultPrerequisite(game, scope.games)?.id ?? '';

  const canTag = game.addedBy.id === user?.id;

  async function buy() {
    if (own && !game.ggDealsUrl) {
      const ok = await confirm({
        title: t('game.detail.buy.ownedTitle'),
        message: t('game.detail.buy.ownedMessage', { title: game.title }),
        confirmLabel: t('game.detail.buy.searchGgDeals'),
      });
      if (ok) window.open(ggDealsSearchUrl(game.title), '_blank', 'noopener,noreferrer');
      return;
    }
    if (game.ggDealsUrl) window.open(game.ggDealsUrl, '_blank', 'noopener,noreferrer');
  }

  function refresh() {
    if (refreshing) return;
    ops.refreshPrice(game.id);
  }

  function saveTag() {
    const tag = tagDraft.trim();
    if (!tag) return;
    void ops.applyTag(game.id, tag);
    setTagDraft('');
  }

  async function remove() {
    const ok = await confirm({
      title: t('game.detail.remove.title'),
      message: t('game.detail.remove.message', { title: game.title }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    ops.remove(game.id);
    ui.selectGame(null);
    ui.notify(t('game.detail.remove.done', { title: game.title }));
  }

  // In a room, only whoever added a game or a Room Master / Moderator can remove it outright;
  // everyone else can vote to, and it goes once most of the room has.
  const canRemoveDirectly = isShelf || game.addedBy.id === user?.id || scope.canManage;

  async function voteToRemove() {
    if (game.youVotedRemove) {
      ops.unvoteRemove(game.id);
      return;
    }
    const ok = await confirm({
      title: t('game.detail.voteRemove.title'),
      message: t('game.detail.voteRemove.message', { title: game.title, needed: game.removeVotesNeeded, votes: game.removeVotes }),
      confirmLabel: t('game.detail.voteRemove.confirm'),
      danger: true,
    });
    if (!ok) return;
    if (await ops.voteRemove(game.id)) {
      ui.selectGame(null);
      ui.notify(t('game.detail.remove.done', { title: game.title }));
    } else {
      ui.notify(t('game.detail.voteRemove.recorded'));
    }
  }

  // Status journey: Wishlist (shelf only) -> Backlog -> Up next -> Playing -> Beaten.
  const main: [GameStatus, string][] = (
    [
      ['wishlist', statusLabel('wishlist')],
      ['backlog', statusLabel('backlog')],
      ['play_next', t('game.detail.journey.upNext')],
      ['playing', statusLabel('playing')],
      ['done', statusLabel('done')],
    ] as [GameStatus, string][]
  ).filter(([k]) => isShelf || k !== 'wishlist');
  const ci = main.findIndex(([k]) => k === game.status);
  const n = main.length;
  const jFill = ci <= 0 ? 0 : (ci / (n - 1)) * (100 - 100 / n);

  const buyBg = own ? 'var(--mintSoft)' : live ? 'var(--text)' : 'var(--surf)';
  const buyFg = own ? 'var(--mint)' : live ? 'var(--onText)' : 'var(--muted)';
  // Owners still see the going price (issue #797), so a game doesn't read as "free" just because it's owned.
  const buyLabel = own
    ? live
      ? t('game.detail.buyLabel.ownedNow', { price: fmtMoney(game.price.amount, currency) })
      : t('game.detail.buyLabel.owned')
    : live
      ? t('game.detail.buyLabel.ggDeals', { price: fmtMoney(game.price.amount, currency) })
      : game.manualPrice
        ? t('game.detail.buyLabel.manual', { price: fmtMoney(game.manualPrice, currency) })
        : t('game.detail.buyLabel.noPrice');

  return (
    <div style={st('position:absolute;inset:0;background:var(--sheet);display:flex;flex-direction:column;overflow:hidden')}>
      <div style={st('position:relative;padding:22px 20px 18px;display:flex;gap:16px;background:linear-gradient(160deg, var(--hero1), var(--sheet))')}>
        <div
          style={{
            width: 96,
            aspectRatio: '2/3',
            flexShrink: 0,
            borderRadius: 14,
            background: coverBg(game.title, game.coverImageUrl),
            boxShadow: '0 12px 30px oklch(0 0 0 / 0.4)',
          }}
        />
        <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;padding-top:2px;padding-right:30px')}>
          <span style={st('font:500 11.5px var(--font-mono);color:var(--accText)')}>{kicker}</span>
          <span style={st('font:700 24px/1.05 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{game.title}</span>
          {game.genre && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{game.genre}</span>}
          {releaseDateLabel(game) && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{releaseDateLabel(game)}</span>}
          {ttb.length > 0 && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{ttb.join(' · ')}</span>}
          {game.reviewScore !== null && (
            <span style={st('font:500 12.5px var(--font-ui);color:var(--text2)')}>{t('game.detail.igdbScore', { score: game.reviewScore })}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          style={st('position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:none;background:var(--chip);color:var(--text);font-size:18px;line-height:1')}
        >
          ×
        </button>
      </div>

      <div style={st('flex:1;overflow-y:auto;padding:4px 20px 30px;display:flex;flex-direction:column;gap:22px')}>
        {showPrice && (
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            <div style={st('display:flex;align-items:center;gap:8px')}>
              <button
                type="button"
                onClick={buy}
                style={st(`flex:1;min-width:0;height:46px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:none;background:${buyBg};color:${buyFg};font:700 15px var(--font-ui)`)}
              >
                {buyLabel}
              </button>
              <button
                type="button"
                onClick={refresh}
                aria-label={t('game.detail.refreshPrice')}
                aria-busy={refreshing}
                style={st(`width:46px;height:46px;flex-shrink:0;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:18px;opacity:${refreshing ? 0.4 : 1}`)}
              >
                ↻
              </button>
            </div>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px 12px;font:400 12.5px var(--font-ui);color:var(--muted)')}>
              {live && game.price.lastRefreshedAt && <span>{refreshing ? t('game.detail.checking') : t('game.detail.updated', { time: formatRelativeTime(game.price.lastRefreshedAt) })}</span>}
              {showLow && <span style={st('color:var(--accText);font-weight:600')}>{t('game.detail.allTimeLow', { price: fmtMoney(game.price.historicalLow, currency) })}</span>}
              {showLow && abovePct != null && abovePct > 0 && <span>{t('game.detail.aboveLow', { pct: abovePct })}</span>}
              {atLow && <span style={st('color:var(--mint);font-weight:600')}>{t('game.detail.atLow')}</span>}
            </div>
            {live && <PriceHistoryChart gameId={game.id} currency={game.price.currency} />}

            {!live &&
              (editManual ? (
                <div style={st('display:flex;gap:8px')}>
                  <input
                    value={manualDraft}
                    onChange={(e) => setManualDraft(e.target.value)}
                    inputMode="decimal"
                    placeholder={t('game.detail.manual.placeholder')}
                    aria-label={t('game.detail.manual.aria')}
                    style={st(FIELD)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseFloat(manualDraft);
                      if (!(v >= 0)) return;
                      ops.setManualPrice(game.id, String(v));
                      setEditManual(false);
                    }}
                    style={st('height:42px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}
                  >
                    {t('game.detail.set')}
                  </button>
                  <button type="button" onClick={() => setEditManual(false)} style={st('height:42px;padding:0 12px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditManual(true);
                    setManualDraft(game.manualPrice ?? '');
                  }}
                  style={st('align-self:flex-start;height:36px;padding:0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text2);font:600 13px var(--font-ui)')}
                >
                  {game.manualPrice ? t('game.detail.manual.change') : t('game.detail.manual.set')}
                </button>
              ))}

            {live &&
              (editTarget ? (
                <div style={st('display:flex;gap:8px')}>
                  <input
                    value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    inputMode="decimal"
                    placeholder={t('game.detail.alert.placeholder')}
                    aria-label={t('game.detail.alert.aria')}
                    style={st(FIELD)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseFloat(targetDraft);
                      if (!(v > 0)) return;
                      ops.setTargetPrice(game.id, String(v));
                      setEditTarget(false);
                      ui.notify(t('game.detail.alert.saved', { price: fmtMoney(v, currency) }));
                    }}
                    style={st('height:42px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}
                  >
                    {t('game.detail.set')}
                  </button>
                  <button type="button" onClick={() => setEditTarget(false)} style={st('height:42px;padding:0 12px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                    {t('common.cancel')}
                  </button>
                </div>
              ) : game.targetPrice ? (
                <span style={st('align-self:flex-start;display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 14px;border-radius:999px;background:var(--accSoft);color:var(--accText);font:600 13px var(--font-ui)')}>
                  {t('game.detail.alert.at', { price: fmtMoney(game.targetPrice, currency) })}
                  <button
                    type="button"
                    onClick={() => ops.setTargetPrice(game.id, null)}
                    aria-label={t('game.detail.alert.remove')}
                    style={st('width:26px;height:26px;border-radius:50%;border:none;background:var(--accA20);color:var(--accText);font-size:15px;line-height:1;padding:0')}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditTarget(true);
                    setTargetDraft('');
                  }}
                  style={st('align-self:flex-start;height:36px;padding:0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text2);font:600 13px var(--font-ui)')}
                >
                  {t('game.detail.alert.add')}
                </button>
              ))}

            <button
              type="button"
              onClick={() => (live || game.ggDealsUrl ? steamMatch.openPicker(game.id) : void steamMatch.attemptAutoMatch(game.id, game.title, (id) => ops.setSteamMatch(game.id, id)))}
              style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
            >
              {live ? t('game.detail.match.wrong') : t('game.detail.match.fix')}
            </button>
          </div>
        )}

        {coopWarn && (
          <div style={st('padding:12px 14px;border-radius:16px;background:oklch(0.8 0.14 80 / 0.14);color:var(--text);font:500 13.5px var(--font-ui)')}>⚠ {coopWarn}</div>
        )}

        {(nudgeBeaten || nudgePlaying) && (
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;background:var(--surf)')}>
            <span style={st('font:500 14px/1.4 var(--font-ui)')}>
              {fullyAchieved
                ? t('game.detail.nudge.fullyAchieved')
                : nudgeBeaten
                  ? t('game.detail.nudge.beaten', { hours: playedHours })
                  : t('game.detail.nudge.playing', { hours: playedHours })}
            </span>
            <button
              type="button"
              onClick={() => changeStatus(game, nudgeBeaten ? 'done' : 'playing')}
              style={st('align-self:flex-start;height:36px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13px var(--font-ui)')}
            >
              {nudgeBeaten ? t('game.detail.nudge.markBeaten') : t('game.detail.nudge.markPlaying')}
            </button>
          </div>
        )}

        <Trailer gameId={game.id} title={game.title} />

        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <div style={st('display:flex;justify-content:space-between;align-items:baseline')}>
            <span style={st(H)}>{isShelf ? t('game.detail.yourHype') : t('game.detail.squadVote')}</span>
            <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>
              {t(game.votes.length === 1 ? 'game.detail.votes.one' : 'game.detail.votes.other', {
                score: game.votes.length ? `${score >= 0 ? '+' : ''}${score}` : '—',
                n: game.votes.length,
              })}
            </span>
          </div>
          <div style={st('display:grid;grid-template-columns:repeat(5,1fr);gap:6px')}>
            {VOTE_VALUES.map((v: VoteValue) => {
              const on = myVote === v;
              const voters = game.votes.filter((x) => x.value === v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => (on ? ops.unvote(game.id) : ops.vote(game.id, v))}
                  aria-pressed={on}
                  style={st(`display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 2px 10px;border-radius:16px;border:none;background:${on ? 'var(--acc)' : 'var(--surf)'};color:${on ? 'var(--ink)' : 'var(--muted)'}`)}
                >
                  <span style={st('font-size:24px;line-height:1')}>{VOTES[v].e}</span>
                  <span style={st('font:600 11px var(--font-ui)')}>{VOTES[v].l}</span>
                  <span style={st('display:flex;min-height:14px;padding-left:5px')}>
                    {voters.map((x) => (
                      <span key={x.user.id} title={x.user.displayName} style={st(`width:14px;height:14px;margin-left:-5px;border-radius:50%;border:1.5px solid var(--sheet);background:${x.user.avatarColor}`)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {!isShelf && members.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
              {[...members]
                .map((m) => ({ m, vote: game.votes.find((x) => x.user.id === m.user.id)?.value ?? null }))
                // Highest vote first, then people who haven't voted yet; "you" sorts among the rest.
                .sort((a, b) => (b.vote ?? 0) - (a.vote ?? 0) || a.m.user.displayName.localeCompare(b.m.user.displayName))
                .map(({ m, vote }) => (
                  <div key={m.user.id} style={st('display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 12px;background:var(--surf)')}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/u/${m.user.id}`);
                      }}
                      aria-label={t('game.detail.viewProfile', { name: m.user.displayName })}
                      style={st('flex:1;min-width:0;display:flex;align-items:center;gap:10px;align-self:stretch;padding:0;border:none;background:none;color:inherit;text-align:left')}
                    >
                      <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} fontSize={11} />
                      <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                        {m.user.id === user?.id ? t('common.you') : m.user.displayName}
                      </span>
                    </button>
                    <OwnershipMark state={ownershipOf(m.user.id)} />
                    <MemberAchievements counts={achievementsFor(m.user.id)} />
                    {vote ? (
                      <span style={st('display:flex;align-items:center;gap:6px;font:600 12.5px var(--font-ui);color:var(--text2)')}>
                        <span style={st('font-size:18px;line-height:1')}>{VOTES[vote].e}</span>
                        {VOTES[vote].l}
                      </span>
                    ) : (
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--faint)')}>{t('game.detail.notVoted')}</span>
                    )}
                  </div>
                ))}
            </div>
          )}
          {!isShelf && members.length > 0 && (
            <span style={st('font:500 11.5px var(--font-ui);color:var(--muted);padding:0 4px')}>
              {t('game.detail.ownership.legend', { owned: OWNERSHIP_MARK.owned.emoji, wishlist: OWNERSHIP_MARK.wishlist.emoji, none: OWNERSHIP_MARK.none.emoji })}
            </span>
          )}
          {!isShelf && game.ownership && (
            <button
              type="button"
              onClick={() => ops.setOwnership(game.id, !own)}
              style={st(`display:flex;align-items:center;gap:10px;min-height:48px;padding:0 16px;border-radius:16px;border:none;background:${own ? 'var(--mintSoft)' : 'var(--surf)'};color:${own ? 'var(--mint)' : 'var(--text)'};font:600 14px var(--font-ui);text-align:left`)}
            >
              <span>{own ? '✅' : '➕'}</span>
              <span style={{ flex: 1 }}>
                {t(own ? 'game.detail.ownership.youOwn' : 'game.detail.ownership.markOwned', { owned: game.ownership.owned, total: game.ownership.total })}
              </span>
            </button>
          )}
        </div>

        {canTag && (
          <Section title={t('game.detail.tags')}>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {game.tags.map((tag) => (
                <span key={tag.id} style={st('display:flex;align-items:center;gap:4px;height:32px;padding:0 4px 0 12px;border-radius:999px;background:var(--surf);font:500 13px var(--font-ui)')}>
                  #{tag.name}
                  <button
                    type="button"
                    onClick={() => ops.removeTag(game.id, tag.id)}
                    aria-label={t('game.detail.removeTag')}
                    style={st('width:24px;height:24px;border-radius:50%;border:none;background:transparent;color:var(--muted);font-size:15px;line-height:1;padding:0')}
                  >
                    ×
                  </button>
                </span>
              ))}
              <div style={st('display:flex;gap:6px')}>
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                  onKeyDown={(e) => e.key === 'Enter' && saveTag()}
                  placeholder={t('game.detail.addTag')}
                  aria-label={t('game.detail.addTag')}
                  style={st('width:120px;height:32px;padding:0 12px;border-radius:999px;background:transparent;border:1px dashed var(--line);color:var(--text);font-size:13px;outline:none')}
                />
                {tagDraft.trim() && (
                  <button type="button" onClick={saveTag} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 12.5px var(--font-ui)')}>
                    {t('common.add')}
                  </button>
                )}
              </div>
            </div>
          </Section>
        )}

        {!isShelf && (
          <Section title={t('game.detail.playAfter')}>
            <select
              value={prereqId}
              onChange={(e) => ops.setPrerequisite(game.id, e.target.value || null)}
              aria-label={t('game.detail.playAfter')}
              style={st('height:46px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none')}
            >
              <option value="">{t('game.detail.none')}</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </Section>
        )}

        {!game.baseGameId && (
          <Section
            title={t('game.detail.dlc')}
            right={
              <button type="button" onClick={() => ui.openDialog('dlc')} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--chip);color:var(--text2);font:600 12.5px var(--font-ui)')}>
                {t('game.detail.browseDlc')}
              </button>
            }
          >
            {null}
          </Section>
        )}

        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <span style={st(H)}>{t('game.detail.status')}</span>
          <div style={st(`position:relative;display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));padding:6px 0 2px`)}>
            <span style={st(`position:absolute;top:15px;left:${50 / n}%;right:${50 / n}%;height:2px;border-radius:2px;background:var(--chip)`)} />
            <span style={st(`position:absolute;top:15px;left:${50 / n}%;width:${jFill}%;height:2px;border-radius:2px;background:var(--acc)`)} />
            {main.map(([k, l], i) => {
              const on = i === ci;
              const past = ci >= 0 && i < ci;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => changeStatus(game, k)}
                  aria-current={on ? 'step' : undefined}
                  style={st(`position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 2px;border:none;background:transparent;color:${on ? 'var(--text)' : past ? 'var(--text2)' : 'var(--muted)'};min-height:48px`)}
                >
                  <span
                    style={st(
                      `width:20px;height:20px;border-radius:50%;background:${on || past ? 'var(--acc)' : 'var(--surf2)'};box-shadow:${on ? '0 0 0 4px var(--accA25)' : '0 0 0 3px var(--sheet)'};display:flex;align-items:center;justify-content:center`,
                    )}
                  >
                    <span style={st(`width:8px;height:8px;border-radius:50%;background:${on ? 'var(--ink)' : past ? 'var(--acc)' : 'var(--surf2)'}`)} />
                  </span>
                  <span style={st(`font:${on ? 700 : 500} 12px/1.2 var(--font-ui);text-align:center`)}>{l}</span>
                </button>
              );
            })}
          </div>
          <div style={st('display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--chip)')}>
            <span style={st('font:500 12.5px var(--font-ui);color:var(--faint);margin-right:4px')}>{t('game.detail.or')}</span>
            {(['paused', 'replay', 'dropped', 'wont_play'] as GameStatus[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  changeStatus(game, k);
                  if (k === 'wont_play') onClose();
                }}
                aria-pressed={game.status === k}
                style={st(`height:36px;padding:0 10px;border-radius:999px;border:none;background:${game.status === k ? 'var(--text)' : 'transparent'};color:${game.status === k ? 'var(--onText)' : 'var(--muted)'};font:600 13px var(--font-ui)`)}
              >
                {statusLabel(k)}
              </button>
            ))}
          </div>
          {(game.status === 'done' || game.status === 'replay' || game.status === 'dropped') && (
            <div style={st('display:flex;flex-direction:column;gap:10px;padding-top:6px')}>
              <span style={st(H)}>{t('game.detail.review')}</span>
              <ReviewEmbed key={game.id} game={game} onSaved={onClose} />
            </div>
          )}
        </div>

        {playLog.length > 0 && (
          <Section title={t('game.detail.journal')}>
            {playLog.map((e) => (
              <div key={e.id} style={st('display:flex;gap:12px;font:400 13.5px var(--font-ui)')}>
                <span style={st('width:52px;flex-shrink:0;font:500 12px var(--font-mono);color:var(--muted);padding-top:1px')}>
                  {shortDate(e.finishedAt ?? e.startedAt)}
                </span>
                <span>
                  {e.finishedAt ? t('game.detail.journal.finished', { date: shortDate(e.startedAt) }) : t('game.detail.journal.started', { date: shortDate(e.startedAt) })}
                  {e.minutesPlayed !== null && ` · ${t('game.detail.journal.played', { hours: Math.round(e.minutesPlayed / 60) })}`}
                  {e.roomName && ` · ${t('game.detail.journal.beatenWith', { room: e.roomName })}`}
                </span>
              </div>
            ))}
          </Section>
        )}

        {isShelf && (
          <button
            type="button"
            role="checkbox"
            aria-checked={game.hiddenFromOthers}
            onClick={() => {
              const v = !game.hiddenFromOthers;
              ops.setHidden(game.id, v);
              ui.notify(v ? t('game.detail.hide.nowHidden', { title: game.title }) : t('game.detail.hide.visible', { title: game.title }));
            }}
            style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left')}
          >
            <span
              style={st(
                `width:24px;height:24px;flex-shrink:0;border-radius:7px;border:2px solid ${game.hiddenFromOthers ? 'var(--acc)' : 'var(--line)'};background:${game.hiddenFromOthers ? 'var(--acc)' : 'transparent'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 13px var(--font-ui)`,
              )}
            >
              {game.hiddenFromOthers ? '✓' : ''}
            </span>
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('game.detail.hide.label')}</span>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('game.detail.hide.hint')}</span>
            </span>
          </button>
        )}

        {isShelf && game.syncSources.length > 0 && (
          <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {t('game.detail.syncedFrom')}
            {game.syncSources.map((s) => (
              <span key={s} style={st('display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--chip);color:var(--text);font:600 12px var(--font-ui)')}>
                <LibraryLogo kind={SYNC_SOURCE_LOGO[s]} size={12} />
                {t(SYNC_SOURCE_KEY[s])}
              </span>
            ))}
          </div>
        )}

        {canRemoveDirectly && (
          <button
            type="button"
            onClick={() => setRematching(true)}
            style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
          >
            {t('game.igdbMatch.button')}
          </button>
        )}

        <div style={st('display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid var(--chip)')}>
          <span style={st('display:flex;align-items:center;gap:8px;font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {game.addedBy.id === user?.id ? (
              <span style={st(`width:18px;height:18px;border-radius:50%;background:${game.addedBy.avatarColor}`)} />
            ) : (
              <Avatar
                name={game.addedBy.displayName}
                color={game.addedBy.avatarColor}
                avatarUrl={game.addedBy.avatarUrl}
                size={18}
                fontSize={9}
                profileUserId={game.addedBy.id}
                onOpenProfile={onClose}
              />
            )}
            {game.addedBy.id === user?.id ? t('game.detail.addedByYou') : t('game.detail.addedBy', { name: game.addedBy.displayName })}
          </span>
          {canRemoveDirectly ? (
            <button type="button" onClick={remove} style={st('height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui)')}>
              {t('game.detail.removeGame')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void voteToRemove()}
              aria-pressed={game.youVotedRemove}
              style={st('height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui)')}
            >
              {game.youVotedRemove ? t('game.detail.voteRemove.withdraw') : t('game.detail.voteRemove.confirm')}
              {game.removeVotes > 0 && ` (${game.removeVotes}/${game.removeVotesNeeded})`}
            </button>
          )}
        </div>
      </div>

      {rematching && (
        <IgdbMatchSheet
          gameId={game.id}
          gameTitle={game.title}
          onClose={() => setRematching(false)}
          onMatched={async (result, merges) => {
            if (merges) {
              const ok = await confirm({
                title: t('game.igdbMatch.merge.title'),
                message: t('game.igdbMatch.merge.message', { from: game.title, to: result.title }),
                confirmLabel: t('game.igdbMatch.merge'),
                danger: true,
              });
              if (!ok) return;
              ui.selectGame(null);
              ui.notify(t('game.igdbMatch.merge.done', { title: result.title }));
            }
            ops.setIgdbMatch(game.id, result.igdbId);
            setRematching(false);
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

