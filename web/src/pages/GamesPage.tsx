import { useState } from 'react';
import { LOBBY_GAME_IDS, type LobbyGameId, type MiniGameScorePeriod, type MiniGameScoreRow, type MiniGameScoreScope } from '@queueup/shared';
import { PlaySoloDialog } from '../dialogs/PlaySoloDialog';
import { useMiniGameBests, useMiniGameMe, useMiniGameScores } from '../hooks/useMiniGames';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { SOURCE_KEYS, whenKey } from '../lobbyGames/scoreText';
import { Avatar, Btn, Segmented } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { PageShell, SectionTitle, StatTiles } from './PageShell';
import { useT } from '../i18n';

const GOLD = 'linear-gradient(90deg, oklch(0.83 0.15 85 / 0.16), oklch(0.83 0.15 85 / 0.04))';

/** Mini games (`/games`): play on your own, and see the high scores. */
export function GamesPage() {
  const t = useT();
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<LobbyGameId>(LOBBY_GAME_IDS[0]);
  const [scope, setScope] = useState<MiniGameScoreScope>('friends');
  const [period, setPeriod] = useState<MiniGameScorePeriod>('all');
  const [playing, setPlaying] = useState<LobbyGameId | null>(null);
  const { data: bests } = useMiniGameBests();
  const gameName = t(LOBBY_GAME_VIEWS[selected].nameKey);

  return (
    <PageShell title={t('games.title')} hint={t('games.hint')} back={false}>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <SectionTitle>{t('games.section.games')}</SectionTitle>
        <div
          style={st(
            mobile
              ? 'display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px 4px'
              : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px',
          )}
        >
          {LOBBY_GAME_IDS.map((id) => (
            <GameCard
              key={id}
              id={id}
              selected={selected === id}
              best={bests?.bests[id] ?? null}
              compact={mobile}
              onSelect={() => setSelected(id)}
              onPlay={() => setPlaying(id)}
            />
          ))}
        </div>
      </div>

      <div style={st('display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start')}>
        <div style={st('flex:1.5 1 420px;min-width:0;display:flex;flex-direction:column;gap:12px')}>
          <SectionTitle>{t('games.scores.title', { game: gameName })}</SectionTitle>
          <div style={st(`display:grid;grid-template-columns:${mobile ? '1fr 1fr' : 'auto auto'};gap:8px;${mobile ? '' : 'justify-content:start'}`)}>
            <Segmented
              height={mobile ? 34 : 30}
              fontSize={12.5}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'friends', label: t('games.scope.friends') },
                { value: 'server', label: t('games.scope.server') },
              ]}
            />
            <Segmented
              height={mobile ? 34 : 30}
              fontSize={12.5}
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'all', label: t('games.period.all') },
                { value: 'week', label: t('games.period.week') },
              ]}
            />
          </div>
          <Leaderboard game={selected} scope={scope} period={period} />
        </div>
        <YouPanel game={selected} gameName={gameName} onPlay={() => setPlaying(selected)} />
      </div>

      {mobile && (
        <div style={st('position:sticky;bottom:0;margin:0 -16px;padding:24px 16px 16px;background:linear-gradient(to bottom, transparent, var(--bg) 40%);z-index:5')}>
          <Btn kind="accent" height={52} fontSize={15} weight={800} style={{ width: '100%' }} onClick={() => setPlaying(selected)}>
            {t('games.playGame', { game: gameName })}
          </Btn>
        </div>
      )}

      {playing && <PlaySoloDialog initialGame={playing} onClose={() => setPlaying(null)} />}
    </PageShell>
  );
}

function GameCard({ id, selected, best, compact, onSelect, onPlay }: { id: LobbyGameId; selected: boolean; best: number | null; compact: boolean; onSelect: () => void; onPlay: () => void }) {
  const t = useT();
  const view = LOBBY_GAME_VIEWS[id];
  return (
    <div
      className="hv-surf2"
      style={st(
        `position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:12px;padding:14px;border-radius:18px;background:${selected ? 'var(--surf2)' : 'var(--surf)'};${selected ? 'box-shadow:inset 0 0 0 1.5px var(--acc);' : ''}${compact ? 'flex-shrink:0;width:148px;' : ''}`,
      )}
    >
      {/* The whole card selects the game for the leaderboard; Play sits above it. */}
      <button type="button" aria-pressed={selected} aria-label={t(view.nameKey)} onClick={onSelect} style={st('position:absolute;inset:0;border:none;border-radius:18px;background:transparent;padding:0;cursor:pointer')} />
      <span style={st('display:flex;flex-direction:column;gap:3px;pointer-events:none')}>
        <span style={st('font:600 14.5px var(--font-ui)')}>{t(view.nameKey)}</span>
        <span style={st('font:400 12px/1.35 var(--font-ui);color:var(--muted)')}>{t(view.taglineKey)}</span>
      </span>
      <span style={st('display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid var(--chip);pointer-events:none')}>
        <span style={st('display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:500 10.5px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>{t('games.yourBest')}</span>
          <span style={st('font:600 13px var(--font-mono)')}>{best ?? '—'}</span>
        </span>
        {!compact && (
          <span style={st('position:relative;pointer-events:auto')}>
            <Btn kind="text" height={32} fontSize={13} ariaLabel={t('games.playGame', { game: t(view.nameKey) })} onClick={onPlay}>
              {t('games.play')}
            </Btn>
          </span>
        )}
      </span>
    </div>
  );
}

function Leaderboard({ game, scope, period }: { game: LobbyGameId; scope: MiniGameScoreScope; period: MiniGameScorePeriod }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMiniGameScores(game, scope, period);
  const { data: me } = useMiniGameMe(game);

  if (isLoading) return <span style={st('color:var(--muted)')}>{t('common.loading')}</span>;
  if (isError || !data) {
    return (
      <span style={st('display:flex;align-items:center;gap:10px;color:var(--muted)')}>
        {t('pages.common.loadFailed')}
        <Btn height={32} fontSize={13} onClick={() => void refetch()}>
          {t('common.retry')}
        </Btn>
      </span>
    );
  }
  if (data.rows.length === 0) {
    // With no friends there is nobody to show; otherwise nobody has played yet.
    const noFriends = scope === 'friends' && me?.friendCount === 0;
    return (
      <div style={st('display:flex;flex-direction:column;align-items:center;gap:4px;padding:28px 16px;border-radius:18px;background:var(--surf);text-align:center')}>
        <span style={st('font:700 17px var(--font-display)')}>{t('games.scores.quiet')}</span>
        <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>{noFriends ? t('games.scores.quietNoFriends') : t('games.scores.quietSub')}</span>
      </div>
    );
  }

  // The server adds your own row after the top 8 when you are further down.
  const youBelow = data.myRank !== null && data.rows.findIndex((r) => r.isMe) >= 8;
  return (
    <>
      <ol style={st('margin:0;padding:0;list-style:none;display:flex;flex-direction:column')}>
        {data.rows.map((r) => (
          <ScoreRow key={r.userId} row={r} />
        ))}
      </ol>
      <span style={st('font:500 12px/1.4 var(--font-ui);color:var(--faint)')}>
        {youBelow && data.myRank !== null ? `${t('games.scores.youRank', { n: data.myRank })} ` : ''}
        {t('games.scores.note')}
      </span>
    </>
  );
}

function ScoreRow({ row }: { row: MiniGameScoreRow }) {
  const t = useT();
  const top = row.rank === 1;
  const when = whenKey(row.at);
  const background = top ? GOLD : row.isMe ? 'var(--accSoft)' : 'transparent';
  const plain = top || row.isMe;
  return (
    <li
      style={st(
        `display:grid;grid-template-columns:30px 30px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 12px;margin:0 -12px;border-radius:14px;background:${background};${plain ? '' : 'border-bottom:1px solid var(--chip);'}`,
      )}
    >
      <span style={st(`text-align:center;font:600 13px var(--font-mono);color:${top ? 'var(--star)' : row.rank <= 3 ? 'var(--text2)' : 'var(--rank)'}`)}>{top ? '★' : row.rank}</span>
      <Avatar
        name={row.displayName}
        color={row.avatarColor}
        avatarUrl={row.avatarUrl}
        size={30}
        style={top ? { boxShadow: '0 0 0 2px var(--sheet), 0 0 0 3.5px var(--star)' } : undefined}
      />
      <span style={st('display:flex;flex-direction:column;gap:1px;min-width:0')}>
        <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {row.displayName}
          {row.isMe && ` ${t('games.scores.you')}`}
        </span>
        <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('games.scores.meta', { when: t(when.key, when.values), source: t(SOURCE_KEYS[row.source]) })}</span>
      </span>
      <span style={st(`text-align:right;font:600 15px var(--font-mono);color:${top ? 'var(--star)' : row.isMe ? 'var(--accText)' : 'var(--text)'}`)}>{row.score}</span>
    </li>
  );
}

function YouPanel({ game, gameName, onPlay }: { game: LobbyGameId; gameName: string; onPlay: () => void }) {
  const t = useT();
  const { data } = useMiniGameMe(game);
  const bestRun = data?.lastRuns.length ? Math.max(...data.lastRuns.map((r) => r.score)) : null;
  const bestMarked = data?.best != null && data.best === bestRun;
  let bestTagged = false;

  return (
    <div style={st('flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:12px')}>
      <SectionTitle>{t('games.you.title', { game: gameName })}</SectionTitle>
      <StatTiles
        columns={2}
        stats={[
          { v: data?.best ?? '—', l: t('games.you.best') },
          { v: data?.friendRank ? t('games.you.rank', { n: data.friendRank }) : '—', l: t(data?.friendCount === 1 ? 'games.you.amongFriends.one' : 'games.you.amongFriends.other', { n: data?.friendCount ?? 0 }) },
          { v: data?.runsPlayed ?? 0, l: t('games.you.runs') },
          { v: data?.nextFriend ? data.nextFriend.gap : '—', l: data?.nextFriend ? t('games.you.behind', { name: data.nextFriend.displayName }) : data?.best != null && data.friendCount > 0 ? t('games.you.leading') : t('games.you.noGap') },
        ]}
      />
      <div style={st('display:flex;align-items:baseline;justify-content:space-between')}>
        <span style={st('font:500 10.5px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>{t('games.you.lastRuns')}</span>
        <span style={st('font:500 10.5px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>{t('games.you.newestFirst')}</span>
      </div>
      {data && data.lastRuns.length === 0 ? (
        <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('games.you.noRuns')}</span>
      ) : (
        <ul style={st('margin:0;padding:0;list-style:none;display:flex;flex-direction:column')}>
          {(data?.lastRuns ?? []).map((r, i) => {
            const tag = bestMarked && r.score === bestRun && !bestTagged;
            if (tag) bestTagged = true;
            const when = whenKey(r.at);
            return (
              <li key={`${r.at}-${i}`} style={st('display:flex;align-items:center;gap:10px;height:40px;font:400 14px var(--font-ui);border-bottom:1px solid var(--chip)')}>
                <span style={st('flex:1;color:var(--muted)')}>
                  {t(when.key, when.values)} · {t(SOURCE_KEYS[r.source])}
                </span>
                {tag && <span style={st('font:600 10.5px var(--font-mono);letter-spacing:.06em;color:var(--star)')}>{t('games.you.bestTag')}</span>}
                <span style={st('font:600 14px var(--font-mono)')}>{r.score}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Btn kind="accent" height={46} fontSize={14} weight={800} onClick={onPlay}>
        {t('games.playGame', { game: gameName })}
      </Btn>
    </div>
  );
}
