import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LOBBY_GAME_IDS, lowerIsBetter, type LobbyGameId, type MiniGameLobbyDto, type MiniGameScorePeriod, type MiniGameScoreRow, type MiniGameScoreScope } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { useAuth } from '../context/AuthContext';
import { JoinCodeDialog } from '../dialogs/JoinCodeDialog';
import { LobbyPlayDialog } from '../dialogs/LobbyPlayDialog';
import { OpenLobbyDialog } from '../dialogs/OpenLobbyDialog';
import { PlaySoloDialog } from '../dialogs/PlaySoloDialog';
import { MINIGAMES_QUERY_KEY, useMiniGameBests, useMiniGameMe, useMiniGameScores, useOpenLobbies } from '../hooks/useMiniGames';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { lobbyHeadline } from '../lobbyGames/lobbyText';
import { SOURCE_KEYS, formatScore, whenKey } from '../lobbyGames/scoreText';
import { Avatar, Btn, SearchField, Segmented, inputField, inputPill } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { PageShell, SectionTitle, StatTiles } from './PageShell';
import { useT } from '../i18n';

const GOLD = 'linear-gradient(90deg, oklch(0.83 0.15 85 / 0.16), oklch(0.83 0.15 85 / 0.04))';
const MEDALS = ['🥇', '🥈', '🥉'];

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
  const [query, setQuery] = useState('');
  // A to Z by name in the current language, narrowed by what was typed (name or tagline). New games slot in on their own.
  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...LOBBY_GAME_IDS]
      .map((id) => ({ id, name: t(LOBBY_GAME_VIEWS[id].nameKey), tagline: t(LOBBY_GAME_VIEWS[id].taglineKey) }))
      .filter((g) => !q || g.name.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => g.id);
  }, [query, t]);

  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: lobbyList } = useOpenLobbies(5);
  const myLobby = lobbyList?.lobbies.find((l) => l.mine);
  // The card offers someone else's lobby first; with none, it is your own.
  const liveLobby = lobbyList?.lobbies.find((l) => !l.mine) ?? myLobby;
  const [dialog, setDialog] = useState<{ kind: 'open' } | { kind: 'join'; code?: string } | { kind: 'lobby'; id: string } | null>(null);
  // A shared invite link (`/games?code=7KX-4QP`) opens Join with code with the code filled in.
  const linkCode = params.get('code');
  useEffect(() => {
    if (!linkCode) return;
    setDialog({ kind: 'join', code: linkCode });
    setParams({}, { replace: true });
  }, [linkCode, setParams]);
  // A link to one game (`/games?game=runner`, from a "your high score was beaten" alert) opens with that game picked.
  const linkGame = params.get('game');
  useEffect(() => {
    if (!linkGame) return;
    const id = LOBBY_GAME_IDS.find((g) => g === linkGame);
    if (id) setSelected(id);
    const rest = new URLSearchParams(params);
    rest.delete('game');
    setParams(rest, { replace: true });
    // `params` changes with the URL, so it is left out: this runs once for each link followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkGame, setParams]);
  const closeMine = async () => {
    if (!myLobby) return;
    try {
      await miniGamesApi.closeLobby(myLobby.id);
    } catch {
      // Already closed.
    }
    void queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY });
  };
  const lobbyButtons = (
    <>
      <Btn height={mobile ? 44 : 42} fontSize={14} onClick={() => setDialog({ kind: 'join' })}>
        {t('games.joinCode')}
      </Btn>
      <Btn height={mobile ? 44 : 42} fontSize={14} onClick={() => (myLobby ? void closeMine() : setDialog({ kind: 'open' }))}>
        {myLobby ? t('games.closeLobby') : t('games.openLobby')}
      </Btn>
    </>
  );

  return (
    <PageShell title={t('games.title')} hint={t('games.hint')} back={false} action={mobile ? undefined : <div style={st('display:flex;gap:8px')}>{lobbyButtons}</div>}>
      {mobile && <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>{lobbyButtons}</div>}
      {liveLobby && <LiveLobbyCard lobby={liveLobby} compact={mobile} onJoin={() => setDialog({ kind: 'lobby', id: liveLobby.id })} />}
      {mobile ? (
        <>
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            <SectionTitle>{t('games.section.games')}</SectionTitle>
            <SearchField value={query} onChange={setQuery} placeholder={t('games.list.search', { n: LOBBY_GAME_IDS.length })} ariaLabel={t('games.list.search', { n: LOBBY_GAME_IDS.length })} style={inputPill} />
            {games.length === 0 ? (
              <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted);padding:14px 0')}>{t('games.list.empty', { q: query.trim() })}</span>
            ) : (
              <GameStrip ids={games} selected={selected} bests={bests?.bests} ranks={bests?.friendRanks} onSelect={setSelected} />
            )}
          </div>
          <Scores game={selected} gameName={gameName} scope={scope} setScope={setScope} period={period} setPeriod={setPeriod} mobile />
          <YouPanel game={selected} gameName={gameName} />
        </>
      ) : (
        <div style={st('display:grid;grid-template-columns:280px minmax(0,1fr);gap:22px;align-items:start')}>
          <GameList
            ids={games}
            query={query}
            onQuery={setQuery}
            selected={selected}
            bests={bests?.bests}
            ranks={bests?.friendRanks}
            onSelect={setSelected}
          />
          <div style={st('min-width:0;display:flex;flex-direction:column;gap:22px')}>
            <GameHero game={selected} gameName={gameName} onPlay={() => setPlaying(selected)} />
            <Scores game={selected} gameName={gameName} scope={scope} setScope={setScope} period={period} setPeriod={setPeriod} />
          </div>
        </div>
      )}

      {mobile && (
        <div style={st('position:sticky;bottom:0;margin:0 -16px;padding:24px 16px 16px;background:linear-gradient(to bottom, transparent, var(--bg) 40%);z-index:5')}>
          <Btn kind="accent" height={52} fontSize={15} weight={800} style={{ width: '100%' }} onClick={() => setPlaying(selected)}>
            {t('games.playGame', { game: gameName })}
          </Btn>
        </div>
      )}

      {playing && <PlaySoloDialog initialGame={playing} onClose={() => setPlaying(null)} />}
      {dialog?.kind === 'open' && <OpenLobbyDialog onClose={() => setDialog(null)} onOpened={(lobby) => { void queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY }); setDialog({ kind: 'lobby', id: lobby.id }); }} />}
      {dialog?.kind === 'join' && <JoinCodeDialog initialCode={dialog.code} onClose={() => setDialog(null)} onJoined={(lobby) => setDialog({ kind: 'lobby', id: lobby.id })} />}
      {dialog?.kind === 'lobby' && <LobbyPlayDialog lobbyId={dialog.id} onClose={() => { setDialog(null); void queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY }); }} />}
    </PageShell>
  );
}

/** The medal for a friend rank of 1 to 3, with what it says for a screen reader. */
function useRankTitle() {
  const t = useT();
  return (rank: number) => (rank === 1 ? t('games.list.top') : t('games.list.rank', { n: rank }));
}

/** Phones: the games as a strip of cards, with a medal before your best when you are top three among friends. */
function GameStrip({ ids, selected, bests, ranks, onSelect }: { ids: LobbyGameId[]; selected: LobbyGameId; bests?: Partial<Record<LobbyGameId, number>>; ranks?: Partial<Record<LobbyGameId, number>>; onSelect: (id: LobbyGameId) => void }) {
  const t = useT();
  const rankTitle = useRankTitle();
  const strip = useRef<HTMLDivElement>(null);
  // A new search starts the strip from its first card again.
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = 0;
  }, [ids.length]);
  return (
    <div ref={strip} style={st('display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px 4px')}>
      {ids.map((id) => {
        const view = LOBBY_GAME_VIEWS[id];
        const best = bests?.[id] ?? null;
        const rank = ranks?.[id] ?? null;
        const top = rank === 1;
        const isSelected = selected === id;
        // The selected card's own look wins over the gold wash for the one you lead.
        const background = isSelected ? 'var(--surf2)' : top ? `${GOLD}, var(--surf)` : 'var(--surf)';
        return (
          <div
            key={id}
            className="hv-surf2"
            style={st(`position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:12px;padding:14px;border-radius:18px;flex-shrink:0;width:148px;background:${background};${isSelected ? 'box-shadow:inset 0 0 0 1.5px var(--acc);' : ''}`)}
          >
            {/* The whole card selects the game for the leaderboard. */}
            <button type="button" aria-pressed={isSelected} aria-label={t(view.nameKey)} onClick={() => onSelect(id)} style={st('position:absolute;inset:0;border:none;border-radius:18px;background:transparent;padding:0;cursor:pointer')} />
            <span style={st('display:flex;flex-direction:column;gap:3px;pointer-events:none')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t(view.nameKey)}</span>
              <span style={st('font:400 12px/1.35 var(--font-ui);color:var(--muted)')}>{t(view.taglineKey)}</span>
            </span>
            <span style={st('display:flex;flex-direction:column;gap:2px;padding-top:10px;border-top:1px solid var(--chip);pointer-events:none')}>
              <span style={st('font:500 10.5px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>{t('games.yourBest')}</span>
              <span style={st(`display:flex;align-items:center;gap:5px;font:600 13px var(--font-mono);color:${top ? 'var(--star)' : 'var(--text)'}`)}>
                {rank !== null && rank <= 3 && (
                  <span role="img" title={rankTitle(rank)} aria-label={rankTitle(rank)} style={st('font-size:13px;line-height:1')}>
                    {MEDALS[rank - 1]}
                  </span>
                )}
                {best === null ? '—' : formatScore(id, best)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Desktop: every game in a fixed-height, searchable list (so the page is no taller for 40 games than for 10), with your best and, when you are top three
 * among friends, a medal (a number below that). Arrow keys in the search box move the pick through what is shown. */
function GameList({ ids, query, onQuery, selected, bests, ranks, onSelect }: { ids: LobbyGameId[]; query: string; onQuery: (q: string) => void; selected: LobbyGameId; bests?: Partial<Record<LobbyGameId, number>>; ranks?: Partial<Record<LobbyGameId, number>>; onSelect: (id: LobbyGameId) => void }) {
  const t = useT();
  const rankTitle = useRankTitle();
  const list = useRef<HTMLDivElement>(null);
  // Keep the picked row in view (inside the list only: the page itself does not move).
  useEffect(() => {
    const el = list.current;
    const row = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !row) return;
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight;
  }, [selected, ids]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (ids.length === 0) return;
    const at = ids.indexOf(selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = at === -1 ? (e.key === 'ArrowDown' ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
      onSelect(ids[next]);
    } else if (e.key === 'Enter' && at === -1) {
      onSelect(ids[0]);
    }
  }

  return (
    <div style={st('position:sticky;top:16px;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:20px;background:var(--surf)')}>
      <SearchField
        value={query}
        onChange={onQuery}
        onKeyDown={onKeyDown}
        placeholder={t('games.list.search', { n: LOBBY_GAME_IDS.length })}
        ariaLabel={t('games.list.search', { n: LOBBY_GAME_IDS.length })}
        style={`${inputField};height:40px;font-size:14px`}
      />
      <div style={st('display:flex;justify-content:space-between;align-items:baseline;padding:4px 10px 0;font:600 11px var(--font-mono);letter-spacing:.08em;color:var(--faint)')}>
        <span>{t('games.list.header', { n: ids.length })}</span>
        <span>{t('games.yourBest')}</span>
      </div>
      <div ref={list} style={st('position:relative;max-height:560px;overflow-y:auto;display:flex;flex-direction:column;margin:0 -4px;padding:0 4px')}>
        {ids.length === 0 && <span style={st('padding:18px 10px;font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>{t('games.list.empty', { q: query.trim() })}</span>}
        {ids.map((id) => {
          const best = bests?.[id] ?? null;
          const rank = ranks?.[id] ?? null;
          const top = rank === 1;
          const isSelected = selected === id;
          // Picked beats the gold wash for the game you lead.
          const background = isSelected ? 'var(--surf2)' : top ? GOLD : 'transparent';
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              className="hv-surf2"
              onClick={() => onSelect(id)}
              style={st(`display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px 0 6px;flex-shrink:0;border-radius:12px;border:none;text-align:left;color:var(--text);background:${background};${isSelected ? 'box-shadow:inset 0 0 0 1.5px var(--acc);' : ''}`)}
            >
              <span title={rank === null ? undefined : rankTitle(rank)} aria-label={rank === null ? undefined : rankTitle(rank)} style={st('width:22px;flex-shrink:0;text-align:center;line-height:1')}>
                {rank !== null && (rank <= 3 ? <span style={st('font-size:15px')}>{MEDALS[rank - 1]}</span> : <span style={st('font:600 12px var(--font-mono);color:var(--rank)')}>{rank}</span>)}
              </span>
              <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t(LOBBY_GAME_VIEWS[id].nameKey)}</span>
              <span style={st(`font:600 12px var(--font-mono);color:${top ? 'var(--star)' : 'var(--muted)'}`)}>{best === null ? '—' : formatScore(id, best)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Desktop: the picked game, with Play and your four numbers for it (the same ones a phone shows under the scores). */
function GameHero({ game, gameName, onPlay }: { game: LobbyGameId; gameName: string; onPlay: () => void }) {
  const t = useT();
  const { data } = useMiniGameMe(game);
  const view = LOBBY_GAME_VIEWS[game];
  const stats = [
    { v: data?.best != null ? formatScore(game, data.best) : '—', l: t('games.you.best') },
    { v: data?.friendRank ? t('games.you.rank', { n: data.friendRank }) : '—', l: t(data?.friendCount === 1 ? 'games.you.amongFriends.one' : 'games.you.amongFriends.other', { n: data?.friendCount ?? 0 }) },
    { v: data?.runsPlayed ?? 0, l: t('games.you.runs') },
    { v: data?.nextFriend ? formatScore(game, data.nextFriend.gap) : '—', l: data?.nextFriend ? t('games.you.behind', { name: data.nextFriend.displayName }) : data?.best != null && data.friendCount > 0 ? t('games.you.leading') : t('games.you.noGap') },
  ];
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px;padding:18px 18px 18px 20px;border-radius:20px;background:linear-gradient(135deg,var(--hero1),var(--hero2))')}>
      <div style={st('display:flex;align-items:flex-end;gap:16px')}>
        <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
          <span style={st('font:700 30px/1.05 var(--font-display);letter-spacing:-0.02em')}>{gameName}</span>
          <span style={st('font:400 14px/1.4 var(--font-ui);color:var(--muted)')}>{t(view.taglineKey)}</span>
        </div>
        <Btn kind="accent" height={46} fontSize={14} weight={800} style={{ boxShadow: '0 6px 20px var(--accA30)', flexShrink: 0 }} onClick={onPlay}>
          {t('games.playGame', { game: gameName })}
        </Btn>
      </div>
      {/* Two across when the column gets narrow. */}
      <div style={st('display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px')}>
        {stats.map((x) => (
          <div key={x.l} style={st('display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:14px;background:var(--chip);min-width:0')}>
            <span style={st('font:700 20px var(--font-display);letter-spacing:-0.02em;overflow:hidden;text-overflow:ellipsis')}>{x.v}</span>
            <span style={st('font:400 11.5px/1.3 var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The scope and period pickers and the high score list for a game. */
function Scores({ game, gameName, scope, setScope, period, setPeriod, mobile = false }: { game: LobbyGameId; gameName: string; scope: MiniGameScoreScope; setScope: (s: MiniGameScoreScope) => void; period: MiniGameScorePeriod; setPeriod: (p: MiniGameScorePeriod) => void; mobile?: boolean }) {
  const t = useT();
  return (
    <div style={st('min-width:0;display:flex;flex-direction:column;gap:12px')}>
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
      <Leaderboard game={game} scope={scope} period={period} />
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
          <ScoreRow key={r.userId} game={game} row={r} />
        ))}
      </ol>
      <span style={st('font:500 12px/1.4 var(--font-ui);color:var(--faint)')}>
        {youBelow && data.myRank !== null ? `${t('games.scores.youRank', { n: data.myRank })} ` : ''}
        {t('games.scores.note')} {t('games.scores.version', { n: data.version })}
      </span>
    </>
  );
}

function ScoreRow({ game, row }: { game: LobbyGameId; row: MiniGameScoreRow }) {
  const t = useT();
  const navigate = useNavigate();
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
        profileUserId={row.isMe ? undefined : row.userId}
        style={top ? { boxShadow: '0 0 0 2px var(--sheet), 0 0 0 3.5px var(--star)' } : undefined}
      />
      <span style={st('display:flex;flex-direction:column;gap:1px;min-width:0')}>
        {row.isMe ? (
          <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {row.displayName} {t('games.scores.you')}
          </span>
        ) : (
          // Another person's name opens their profile, like their avatar does.
          <button
            type="button"
            onClick={() => navigate(`/u/${row.userId}`)}
            aria-label={t('shell.avatar.viewProfile', { name: row.displayName })}
            style={st('align-self:flex-start;max-width:100%;padding:0;border:none;background:none;color:var(--text);text-align:left;cursor:pointer;font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}
          >
            {row.displayName}
          </button>
        )}
        <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('games.scores.meta', { when: t(when.key, when.values), source: t(SOURCE_KEYS[row.source]) })}</span>
      </span>
      <span style={st(`text-align:right;font:600 15px var(--font-mono);color:${top ? 'var(--star)' : row.isMe ? 'var(--accText)' : 'var(--text)'}`)}>{formatScore(game, row.score)}</span>
    </li>
  );
}

/** Phones: your four numbers for the game and your last runs, under the scores. The pinned Play button does the playing. */
function YouPanel({ game, gameName }: { game: LobbyGameId; gameName: string }) {
  const t = useT();
  const { data } = useMiniGameMe(game);
  const bestRun = data?.lastRuns.length ? (lowerIsBetter(game) ? Math.min : Math.max)(...data.lastRuns.map((r) => r.score)) : null;
  const bestMarked = data?.best != null && data.best === bestRun;
  let bestTagged = false;

  return (
    <div style={st('flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:12px')}>
      <SectionTitle>{t('games.you.title', { game: gameName })}</SectionTitle>
      <StatTiles
        columns={2}
        stats={[
          { v: data?.best != null ? formatScore(game, data.best) : '—', l: t('games.you.best') },
          { v: data?.friendRank ? t('games.you.rank', { n: data.friendRank }) : '—', l: t(data?.friendCount === 1 ? 'games.you.amongFriends.one' : 'games.you.amongFriends.other', { n: data?.friendCount ?? 0 }) },
          { v: data?.runsPlayed ?? 0, l: t('games.you.runs') },
          { v: data?.nextFriend ? formatScore(game, data.nextFriend.gap) : '—', l: data?.nextFriend ? t('games.you.behind', { name: data.nextFriend.displayName }) : data?.best != null && data.friendCount > 0 ? t('games.you.leading') : t('games.you.noGap') },
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
                <span style={st('font:600 14px var(--font-mono)')}>{formatScore(game, r.score)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A lobby you can drop into (or your own): who is playing, and Join. */
function LiveLobbyCard({ lobby, compact, onJoin }: { lobby: MiniGameLobbyDto; compact: boolean; onJoin: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const kicker = lobby.mine
    ? t('games.live.kickerMine', { who: t(`games.live.who.${lobby.visibility}`) })
    : lobby.visibility === 'friends'
      ? t('games.live.kickerFriends')
      : t('games.live.kickerPublic');
  const title = lobbyHeadline(lobby, user?.id ?? '', t, (id) => t(LOBBY_GAME_VIEWS[id].nameKey));
  return (
    <div
      style={st(
        `display:flex;${compact ? 'flex-direction:column;align-items:stretch;padding:14px;border-radius:18px;gap:12px' : 'align-items:center;padding:16px 16px 16px 18px;border-radius:20px;gap:16px'};background:linear-gradient(135deg,var(--hero1),var(--hero2))`,
      )}
    >
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
        <span style={st('display:flex;align-items:center;gap:8px;font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accText)')}>
          <span style={st('width:8px;height:8px;border-radius:50%;background:var(--mint)')} />
          {kicker}
        </span>
        <span style={st(`font:700 ${compact ? 17 : 19}px var(--font-display);letter-spacing:-.02em`)}>{title}</span>
        <span style={st('font:500 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t('games.live.sub')}</span>
      </div>
      <div style={st('display:flex;align-items:center;gap:8px;margin-left:8px')}>
        {lobby.players.slice(0, 5).map((p) => (
          <Avatar key={p.id} name={p.displayName} color={p.avatarColor} avatarUrl={p.avatarUrl} size={32} style={{ margin: '0 0 0 -16px', boxShadow: '0 0 0 2.5px var(--hero2)' }} />
        ))}
      </div>
      <Btn kind="accent" height={compact ? 44 : 46} fontSize={14} weight={800} style={{ boxShadow: '0 6px 20px var(--accA30)', ...(compact ? { width: '100%' } : {}) }} onClick={onJoin}>
        {t('games.live.join')}
      </Btn>
    </div>
  );
}
