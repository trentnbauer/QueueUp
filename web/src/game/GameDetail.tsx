import { useMemo, useState, type ReactNode } from 'react';
import { suggestsBeatenByPlaytime, suggestsPlaying, type Game, type GameStatus, type VoteValue } from '@queueup/shared';
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
  shortDate,
} from '../lib/gameView';
import { ggDealsSearchUrl } from '../utils/formatPrice';
import { formatRelativeTime } from '../utils/relativeTime';
import { SteamMatchSheet } from './SteamMatchSheet';
import { Avatar, coverBg } from '../ui/primitives';
import { st } from '../ui/st';

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

/** Everything about one game - the body of both the desktop right panel and the phone sheet. */
export function GameDetail({ game, onClose, changeStatus }: { game: Game; onClose: () => void; changeStatus: (game: Game, status: GameStatus) => void }) {
  const scope = useScope();
  const ui = useUi();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { ops, members, isShelf } = scope;
  const { entries: playLog } = useGamePlayLog(game.id);
  const { players } = useGameAchievements(game.id);
  const steamMatch = useSteamAutoMatch();
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

  const ttb = [
    game.timeToBeatRushedHours != null && `${game.timeToBeatRushedHours}h rushed`,
    game.timeToBeatHours != null && `${game.timeToBeatHours}h main`,
    game.timeToBeatCompletionistHours != null && `${game.timeToBeatCompletionistHours}h completionist`,
  ].filter(Boolean) as string[];

  const coopWarn =
    !isShelf && game.maxCoopPlayers != null && members.length > game.maxCoopPlayers
      ? `Only supports ${game.maxCoopPlayers}-player co-op. This room has ${members.length} members.`
      : null;

  // Nudges (never automatic): 100% Steam achievements, or playtime near the time to beat.
  const mine = players.find((p) => p.user.id === user?.id);
  const fullyAchieved = !!mine && mine.total > 0 && mine.unlocked === mine.total && game.status !== 'done' && game.status !== 'dropped';
  const playedHours = game.currentPlaytimeMinutes ? Math.round(game.currentPlaytimeMinutes / 60) : 0;
  const nudgeBeaten = fullyAchieved || suggestsBeatenByPlaytime(game);
  const nudgePlaying = !nudgeBeaten && suggestsPlaying(game);

  const kicker = [isShelf ? 'PERSONAL SHELF' : (scope.room?.name ?? '').toUpperCase(), STATUS_LABEL[game.status].toUpperCase(), game.hiddenFromOthers ? 'HIDDEN' : '']
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
        title: 'You already own this game',
        message: `QueueUp doesn't have a specific gg.deals listing for "${game.title}" yet - want to look it up there anyway?`,
        confirmLabel: 'Search gg.deals',
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
    const t = tagDraft.trim();
    if (!t) return;
    void ops.applyTag(game.id, t);
    setTagDraft('');
  }

  async function remove() {
    const ok = await confirm({
      title: 'Remove this game?',
      message: `"${game.title}" and its votes will be removed.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    ops.remove(game.id);
    ui.selectGame(null);
    ui.notify(`Removed ${game.title}`);
  }

  // Status journey: Wishlist (shelf only) -> Backlog -> Up next -> Playing -> Beaten.
  const main: [GameStatus, string][] = (
    [
      ['wishlist', 'Wishlist'],
      ['backlog', 'Backlog'],
      ['play_next', 'Up next'],
      ['playing', 'Playing'],
      ['done', 'Beaten'],
    ] as [GameStatus, string][]
  ).filter(([k]) => isShelf || k !== 'wishlist');
  const ci = main.findIndex(([k]) => k === game.status);
  const n = main.length;
  const jFill = ci <= 0 ? 0 : (ci / (n - 1)) * (100 - 100 / n);

  const buyBg = own ? 'var(--mintSoft)' : live ? 'var(--text)' : 'var(--surf)';
  const buyFg = own ? 'var(--mint)' : live ? 'var(--onText)' : 'var(--muted)';
  const buyLabel = own
    ? '✓ You own this'
    : live
      ? `🛒 ${fmtMoney(game.price.amount, currency)} on gg.deals`
      : game.manualPrice
        ? `✏️ ${fmtMoney(game.manualPrice, currency)} (set by you)`
        : 'No live price';

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
          {ttb.length > 0 && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{ttb.join(' · ')}</span>}
          {game.reviewScore !== null && (
            <span style={st('font:500 12.5px var(--font-ui);color:var(--text2)')}>⭐ {game.reviewScore}/100 on IGDB</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
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
                aria-label="Refresh price"
                aria-busy={refreshing}
                style={st(`width:46px;height:46px;flex-shrink:0;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:18px;opacity:${refreshing ? 0.4 : 1}`)}
              >
                ↻
              </button>
            </div>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px 12px;font:400 12.5px var(--font-ui);color:var(--muted)')}>
              {live && game.price.lastRefreshedAt && <span>{refreshing ? 'Checking…' : `Updated ${formatRelativeTime(game.price.lastRefreshedAt)}`}</span>}
              {showLow && <span style={st('color:var(--accText);font-weight:600')}>All-time low: {fmtMoney(game.price.historicalLow, currency)}</span>}
              {atLow && <span style={st('color:var(--mint);font-weight:600')}>At its all-time low right now</span>}
            </div>

            {!live &&
              (editManual ? (
                <div style={st('display:flex;gap:8px')}>
                  <input
                    value={manualDraft}
                    onChange={(e) => setManualDraft(e.target.value)}
                    inputMode="decimal"
                    placeholder="Price you know it's at"
                    aria-label="Manual price"
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
                    Set
                  </button>
                  <button type="button" onClick={() => setEditManual(false)} style={st('height:42px;padding:0 12px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                    Cancel
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
                  {game.manualPrice ? '✏️ Change manual price' : '✏️ Set a price manually'}
                </button>
              ))}

            {live &&
              (editTarget ? (
                <div style={st('display:flex;gap:8px')}>
                  <input
                    value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    inputMode="decimal"
                    placeholder="Alert me at…"
                    aria-label="Alert price"
                    style={st(FIELD)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseFloat(targetDraft);
                      if (!(v > 0)) return;
                      ops.setTargetPrice(game.id, String(v));
                      setEditTarget(false);
                      ui.notify(`We'll ping you at ${fmtMoney(v, currency)} or less`);
                    }}
                    style={st('height:42px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}
                  >
                    Set
                  </button>
                  <button type="button" onClick={() => setEditTarget(false)} style={st('height:42px;padding:0 12px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                    Cancel
                  </button>
                </div>
              ) : game.targetPrice ? (
                <span style={st('align-self:flex-start;display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 14px;border-radius:999px;background:var(--accSoft);color:var(--accText);font:600 13px var(--font-ui)')}>
                  🔔 Alert at {fmtMoney(game.targetPrice, currency)}
                  <button
                    type="button"
                    onClick={() => ops.setTargetPrice(game.id, null)}
                    aria-label="Remove price alert"
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
                  🔔 Alert me on a price drop
                </button>
              ))}

            <button
              type="button"
              onClick={() => (live || game.ggDealsUrl ? steamMatch.openPicker(game.id) : void steamMatch.attemptAutoMatch(game.id, game.title, (id) => ops.setSteamMatch(game.id, id)))}
              style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
            >
              {live ? 'Wrong game matched?' : 'Not finding a price? Fix match'}
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
                ? "🏆 Steam says you've 100%'d this. Mark it Beaten?"
                : nudgeBeaten
                  ? `⏱️ You've played about ${playedHours}h, around this game's time to beat. Mark it Beaten?`
                  : `⏱️ You've been playing this (about ${playedHours}h). Mark it Playing?`}
            </span>
            <button
              type="button"
              onClick={() => changeStatus(game, nudgeBeaten ? 'done' : 'playing')}
              style={st('align-self:flex-start;height:36px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13px var(--font-ui)')}
            >
              {nudgeBeaten ? 'Mark Beaten' : 'Mark Playing'}
            </button>
          </div>
        )}

        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <div style={st('display:flex;justify-content:space-between;align-items:baseline')}>
            <span style={st(H)}>{isShelf ? 'Your hype' : 'Squad vote'}</span>
            <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>
              {game.votes.length ? `${score >= 0 ? '+' : ''}${score}` : '—'} · {game.votes.length} {game.votes.length === 1 ? 'vote' : 'votes'}
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
                    <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} fontSize={11} />
                    <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                      {m.user.id === user?.id ? 'You' : m.user.displayName}
                    </span>
                    {vote ? (
                      <span style={st('display:flex;align-items:center;gap:6px;font:600 12.5px var(--font-ui);color:var(--text2)')}>
                        <span style={st('font-size:18px;line-height:1')}>{VOTES[vote].e}</span>
                        {VOTES[vote].l}
                      </span>
                    ) : (
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--faint)')}>Hasn't voted yet</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {!isShelf && game.ownership && (
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            <button
              type="button"
              onClick={() => ops.setOwnership(game.id, !own)}
              style={st(`display:flex;align-items:center;gap:10px;min-height:48px;padding:0 16px;border-radius:16px;border:none;background:${own ? 'var(--mintSoft)' : 'var(--surf)'};color:${own ? 'var(--mint)' : 'var(--text)'};font:600 14px var(--font-ui);text-align:left`)}
            >
              <span>{own ? '✅' : '➕'}</span>
              <span style={{ flex: 1 }}>
                {own ? 'You own this' : 'Mark as owned'} · {game.ownership.owned}/{game.ownership.total} of the squad
              </span>
            </button>
            <OwnershipChips game={game} />
          </div>
        )}

        {!isShelf && game.wishlist && game.wishlist.wishlisted > 0 && (
          <div style={st('font:500 13.5px var(--font-ui);color:var(--text2)')}>
            💭 {game.wishlist.wishlisted}/{game.wishlist.total} of the squad also want this
          </div>
        )}

        {canTag && (
          <Section title="Tags">
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {game.tags.map((t) => (
                <span key={t.id} style={st('display:flex;align-items:center;gap:4px;height:32px;padding:0 4px 0 12px;border-radius:999px;background:var(--surf);font:500 13px var(--font-ui)')}>
                  #{t.name}
                  <button
                    type="button"
                    onClick={() => ops.removeTag(game.id, t.id)}
                    aria-label="Remove tag"
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
                  placeholder="Add a tag"
                  aria-label="Add a tag"
                  style={st('width:120px;height:32px;padding:0 12px;border-radius:999px;background:transparent;border:1px dashed var(--line);color:var(--text);font-size:13px;outline:none')}
                />
                {tagDraft.trim() && (
                  <button type="button" onClick={saveTag} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 12.5px var(--font-ui)')}>
                    Add
                  </button>
                )}
              </div>
            </div>
          </Section>
        )}

        {!isShelf && (
          <Section title="Play after">
            <select
              value={prereqId}
              onChange={(e) => ops.setPrerequisite(game.id, e.target.value || null)}
              aria-label="Play after"
              style={st('height:46px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none')}
            >
              <option value="">None</option>
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
            title="DLC"
            right={
              <button type="button" onClick={() => ui.openDialog('dlc')} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--chip);color:var(--text2);font:600 12.5px var(--font-ui)')}>
                Browse DLC
              </button>
            }
          >
            {null}
          </Section>
        )}

        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <span style={st(H)}>Status</span>
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
            <span style={st('font:500 12.5px var(--font-ui);color:var(--faint);margin-right:4px')}>Or</span>
            {(
              [
                ['replay', 'Replay'],
                ['dropped', 'Dropped'],
                ['wont_play', "Won't Play"],
              ] as [GameStatus, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => changeStatus(game, k)}
                aria-pressed={game.status === k}
                style={st(`height:36px;padding:0 10px;border-radius:999px;border:none;background:${game.status === k ? 'var(--text)' : 'transparent'};color:${game.status === k ? 'var(--onText)' : 'var(--muted)'};font:600 13px var(--font-ui)`)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {playLog.length > 0 && (
          <Section title="Play journal">
            {playLog.map((e) => (
              <div key={e.id} style={st('display:flex;gap:12px;font:400 13.5px var(--font-ui)')}>
                <span style={st('width:52px;flex-shrink:0;font:500 12px var(--font-mono);color:var(--muted);padding-top:1px')}>
                  {shortDate(e.finishedAt ?? e.startedAt)}
                </span>
                <span>
                  {e.finishedAt ? `Finished after starting ${shortDate(e.startedAt)}` : `Started ${shortDate(e.startedAt)} · in progress`}
                  {e.minutesPlayed !== null && ` · ${Math.round(e.minutesPlayed / 60)}h played`}
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
              ui.notify(v ? `${game.title} is now hidden from others` : `${game.title} is visible again`);
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
              <span style={st('font:600 14.5px var(--font-ui)')}>Hide from others</span>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Friends won't see it in your activity, and it's left off your public profile</span>
            </span>
          </button>
        )}

        <div style={st('display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid var(--chip)')}>
          <span style={st('display:flex;align-items:center;gap:8px;font:400 12.5px var(--font-ui);color:var(--muted)')}>
            <span style={st(`width:18px;height:18px;border-radius:50%;background:${game.addedBy.avatarColor}`)} />
            Added by {game.addedBy.id === user?.id ? 'you' : game.addedBy.displayName}
          </span>
          <button type="button" onClick={remove} style={st('height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui)')}>
            Remove game
          </button>
        </div>
      </div>

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

/** Per-member "who owns it" chips in a room. */
function OwnershipChips({ game }: { game: Game }) {
  const { members } = useScope();
  const owners = new Set(game.ownerIds);
  return (
    <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
      {members.map((m) => {
        const o = owners.has(m.user.id);
        return (
          <span
            key={m.user.id}
            style={st(`display:flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 4px;border-radius:999px;background:${o ? 'var(--mintSoft)' : 'var(--chip)'};color:${o ? 'var(--mint)' : 'var(--faint)'};font:500 13px var(--font-ui)`)}
          >
            <span style={st(`width:24px;height:24px;border-radius:50%;background:${m.user.avatarColor};opacity:${o ? 1 : 0.3}`)} />
            {m.user.displayName}
          </span>
        );
      })}
    </div>
  );
}
