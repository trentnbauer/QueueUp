import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ROOM_PLATFORM_LABELS,
  platformFamilyOf,
  type BarcodeGameMatch,
  type CollectionGamesResult,
  type CollectionSearchResult,
  type GameSearchResult,
  type RecommendedGame,
  type RoomPlatform,
} from '@queueup/shared';
import { authApi } from '../api/auth';
import { gamesApi } from '../api/games';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { AiBadge, AiPickedBadge, Btn, ChipToggle, Cover, Kicker, SearchField, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { t as tNow, useT } from '../i18n';
import { useAiPicks } from './useAiPicks';
import { useAiSearch } from './useAiSearch';
import { AiSearchChips } from './AiSearchChips';

const BarcodeScanner = lazy(() => import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

const PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const MAX_CONSECUTIVE_EMPTY_PAGES = 5;
const OWNED_ONLY_KEY = 'qu-add-owned-only';

/** Defaults to on, matching search being scoped to owned systems before this was a toggle. */
function readOwnedOnlyPref(): boolean {
  try {
    return localStorage.getItem(OWNED_ONLY_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeOwnedOnlyPref(on: boolean) {
  try {
    localStorage.setItem(OWNED_ONLY_KEY, String(on));
  } catch {
    // Private mode or blocked storage - the toggle still works for this visit.
  }
}

const ADD_BTN = 'height:36px;padding:0 16px;border-radius:999px;border:none;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui)';
const ROW = 'display:flex;align-items:center;gap:12px;padding:8px;border-radius:14px';

/** A small tag on a recommended game (Co-op, Single player). */
const TAG = 'height:18px;padding:0 7px;border-radius:999px;background:var(--chip);color:var(--text2);font:600 10.5px var(--font-ui);display:inline-flex;align-items:center';

function ResultRow({
  r,
  added,
  suggested,
  adding,
  busy,
  onAdd,
  extra,
}: {
  r: GameSearchResult;
  added: boolean;
  suggested: boolean;
  adding: boolean;
  busy: boolean;
  onAdd: () => void;
  /** An extra line under the platform, e.g. why it's recommended. */
  extra?: ReactNode;
}) {
  const t = useT();
  return (
    <div style={st(ROW)}>
      <Cover title={r.title} url={r.coverImageUrl} width={38} radius={7} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 15px var(--font-ui)')}>
          {r.title}
          {r.releaseYear ? ` (${r.releaseYear})` : ''}
        </span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{r.platform}</span>
        {extra}
      </div>
      <button type="button" onClick={onAdd} disabled={busy || added} style={st(ADD_BTN, added ? { background: 'var(--mintSoft)', color: 'var(--mint)' } : undefined)}>
        {adding ? t('add.game.adding') : added ? (suggested ? t('add.game.suggestedCheck') : t('add.game.addedCheck')) : t('common.add')}
      </button>
    </div>
  );
}

/** Shelf only: owned (Backlog) vs. not owned yet (Wishlist), and which platforms. */
function OwnershipStep({
  result,
  forced,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  result: GameSearchResult;
  forced: RoomPlatform | null;
  busy: boolean;
  error: string | null;
  onConfirm: (status: 'backlog' | 'wishlist', platforms: RoomPlatform[]) => void;
  onBack: () => void;
}) {
  const t = useT();
  const year = new Date().getFullYear();
  const { ownedPlatforms, refetch } = useAuth();
  const [addingSystems, setAddingSystems] = useState(false);
  const [owned, setOwned] = useState(forced != null || result.releaseYear === null || result.releaseYear <= year);
  // Nothing is pre-ticked: you pick the platform(s) you own it on. A scanned physical copy is the
  // exception, since the scan already says which platform it's for.
  const [platforms, setPlatforms] = useState<Set<RoomPlatform>>(new Set(forced ? [forced] : []));
  // The platforms IGDB lists this game on come first; every other platform sits behind "Other
  // platforms" for ports, emulation or anything IGDB is missing.
  const releasedOn = useMemo(() => {
    const families = new Set<RoomPlatform>();
    for (const name of result.platform.split(',')) {
      const family = platformFamilyOf(name.trim());
      if (family) families.add(family);
    }
    if (forced) families.add(forced);
    return PLATFORM_OPTIONS.filter((p) => families.has(p));
  }, [result.platform, forced]);
  const otherPlatforms = PLATFORM_OPTIONS.filter((p) => !releasedOn.includes(p));
  const [showOthers, setShowOthers] = useState(releasedOn.length === 0);
  const toggle = (p: RoomPlatform) =>
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  // Not blocked: you can own a game on a system you haven't listed in your profile. We just point it
  // out and offer to add the system. (An empty list means "every platform", so nothing to warn about.)
  const missingSystems = owned && ownedPlatforms.length > 0 ? Array.from(platforms).filter((p) => !ownedPlatforms.includes(p)) : [];
  async function addSystemsToProfile() {
    setAddingSystems(true);
    try {
      await authApi.updateOwnedPlatforms([...ownedPlatforms, ...missingSystems]);
      await refetch();
    } finally {
      setAddingSystems(false);
    }
  }
  return (
    <>
      <div style={st(ROW)}>
        <Cover title={result.title} url={result.coverImageUrl} width={38} radius={7} />
        <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 15px var(--font-ui)')}>{result.title}</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{result.platform}</span>
        </div>
      </div>
      {missingSystems.length > 0 && (
        <div role="status" style={st('display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:14px;background:var(--surf);border:1px solid var(--line);font:500 13.5px/1.4 var(--font-ui)')}>
          <span>
            {t(missingSystems.length === 1 ? 'add.ownership.missingSystems.one' : 'add.ownership.missingSystems.other', { systems: missingSystems.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') })}
          </span>
          <Btn kind="soft" height={38} fontSize={13} disabled={busy || addingSystems} onClick={addSystemsToProfile} style={{ alignSelf: 'flex-start' }}>
            {addingSystems ? t('add.game.adding') : t('add.ownership.addSystems', { systems: missingSystems.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') })}
          </Btn>
        </div>
      )}
      {error && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{error}</div>}
      <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:4px;border-radius:999px;background:var(--surf)')}>
        {(
          [
            [true, t('add.ownership.own')],
            [false, t('add.ownership.notOwned')],
          ] as [boolean, string][]
        ).map(([k, l]) => (
          <button
            key={String(k)}
            type="button"
            onClick={() => setOwned(k)}
            disabled={busy}
            style={st(`height:38px;border:none;border-radius:999px;background:${owned === k ? 'var(--text)' : 'transparent'};color:${owned === k ? 'var(--onText)' : 'var(--muted)'};font:600 13.5px var(--font-ui)`)}
          >
            {l}
          </button>
        ))}
      </div>
      {owned && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          {releasedOn.length > 0 && (
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {releasedOn.map((p) => (
                <ChipToggle key={p} on={platforms.has(p)} onClick={() => toggle(p)} height={36}>
                  {ROOM_PLATFORM_LABELS[p]}
                </ChipToggle>
              ))}
            </div>
          )}
          {releasedOn.length > 0 && (
            <button
              type="button"
              aria-expanded={showOthers}
              onClick={() => setShowOthers((v) => !v)}
              style={st('align-self:flex-start;display:flex;align-items:center;gap:6px;padding:4px 2px;border:none;background:none;color:var(--muted);font:600 13px var(--font-ui)')}
            >
              <span style={st(`display:inline-block;transition:transform 0.15s;transform:rotate(${showOthers ? 90 : 0}deg)`)}>›</span>
              {t('add.ownership.otherPlatforms')}
              {!showOthers && otherPlatforms.some((p) => platforms.has(p)) && (
                <span style={st('color:var(--accText)')}>{t('add.ownership.selectedCount', { n: otherPlatforms.filter((p) => platforms.has(p)).length })}</span>
              )}
            </button>
          )}
          {showOthers && (
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {otherPlatforms.map((p) => (
                <ChipToggle key={p} on={platforms.has(p)} onClick={() => toggle(p)} height={36}>
                  {ROOM_PLATFORM_LABELS[p]}
                </ChipToggle>
              ))}
            </div>
          )}
        </div>
      )}
      <Btn
        kind="accent"
        height={50}
        fontSize={15}
        weight={700}
        disabled={busy || (owned && platforms.size === 0)}
        onClick={() => onConfirm(owned ? 'backlog' : 'wishlist', owned ? Array.from(platforms) : [])}
      >
        {busy ? t('add.game.adding') : owned ? t('add.ownership.addOwned') : t('add.ownership.addWishlist')}
      </Btn>
      <Btn kind="ghost" height={40} disabled={busy} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        {t('common.back')}
      </Btn>
    </>
  );
}

function CollectionReview({
  collection,
  roomId,
  hideAddons,
  allPlatforms,
  onAdded,
  onBack,
  onBusy,
}: {
  collection: CollectionSearchResult;
  roomId: string | null;
  hideAddons: boolean;
  allPlatforms: boolean;
  onAdded: () => void;
  onBack: () => void;
  onBusy: (b: boolean) => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<CollectionGamesResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setLoadError(null);
    gamesApi
      .collectionGames(collection.collectionId, roomId, hideAddons, allPlatforms)
      .then((res) => {
        if (dead) return;
        setData(res);
        setSelected(new Set(res.games.map((g) => g.igdbId)));
      })
      .catch((err) => !dead && setLoadError(err instanceof Error ? err.message : tNow('add.collection.loadFailed')))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [collection.collectionId, roomId, hideAddons, allPlatforms]);

  async function addSelected() {
    if (!data || selected.size === 0) return;
    const todo = data.games.filter((g) => selected.has(g.igdbId));
    setAdding(true);
    onBusy(true);
    setAddError(null);
    setSummary(null);
    setProgress({ done: 0, total: todo.length });
    let added = 0;
    let suggested = 0;
    const failed = new Set<number>();
    for (const g of todo) {
      if (cancelled.current) break;
      try {
        const res = await gamesApi.create({ igdbId: g.igdbId, roomId });
        if ('suggestion' in res) suggested += 1;
        else added += 1;
      } catch {
        failed.add(g.igdbId);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (cancelled.current) return;
    setData((prev) => (prev ? { ...prev, games: prev.games.filter((g) => failed.has(g.igdbId)) } : prev));
    setSelected(new Set(failed));
    setAdding(false);
    onBusy(false);
    setProgress(null);
    if (added > 0 || suggested > 0) onAdded();
    // Each part is a whole phrase of its own; the summary sentence lists them.
    const parts: string[] = [];
    if (added) parts.push(tNow(added === 1 ? 'add.collection.part.added.one' : 'add.collection.part.added.other', { n: added }));
    if (suggested) parts.push(tNow('add.collection.part.suggested', { n: suggested }));
    if (!parts.length) parts.push(tNow('add.collection.part.added.other', { n: 0 }));
    const joined = parts.join(tNow('add.collection.partSeparator'));
    setSummary(failed.size ? tNow('add.collection.summaryWithFailures', { parts: joined, n: failed.size }) : tNow('add.collection.summary', { parts: joined }));
    if (failed.size) setAddError(tNow('add.collection.failed', { n: failed.size }));
  }

  if (loading) return <div style={st('color:var(--muted);font-size:14px')}>{t('add.collection.loading')}</div>;
  if (loadError || !data) return <div role="alert" style={st('color:var(--danger);font-size:14px')}>{loadError ?? t('add.collection.loadFailed')}</div>;

  return (
    <>
      {addError && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{addError}</div>}
      {summary && !addError && <div style={st('padding:12px 14px;border-radius:14px;background:var(--mintSoft);color:var(--mint);font:500 13.5px/1.4 var(--font-ui)')}>{summary}</div>}
      {data.games.length === 0 ? (
        <div style={st('color:var(--muted);font-size:14px')}>
          {summary ? t('add.collection.nothingElse') : t('add.collection.nothingLeft', { name: data.name })}
        </div>
      ) : (
        <div style={st('display:flex;flex-direction:column;gap:2px')}>
          {data.games.map((g) => {
            const on = selected.has(g.igdbId);
            return (
              <button
                key={g.igdbId}
                type="button"
                disabled={adding}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.igdbId)) next.delete(g.igdbId);
                    else next.add(g.igdbId);
                    return next;
                  })
                }
                style={st(`${ROW};border:none;background:transparent;color:var(--text);text-align:left`)}
              >
                <span style={st(`width:26px;height:26px;flex-shrink:0;border-radius:8px;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 13px var(--font-ui)`)}>
                  {on ? '✓' : ''}
                </span>
                <Cover title={g.title} url={g.coverImageUrl} width={38} radius={7} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14.5px var(--font-ui)')}>
                    {g.title}
                    {g.releaseYear ? ` (${g.releaseYear})` : ''}
                  </span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{g.platform}</span>
                </span>
              </button>
            );
          })}
          <Btn kind="accent" height={48} fontSize={14} weight={700} disabled={adding || selected.size === 0} onClick={addSelected} style={{ marginTop: 10 }}>
            {adding && progress ? t('add.collection.addingProgress', { done: progress.done, total: progress.total }) : t(selected.size === 1 ? 'add.collection.addN.one' : 'add.collection.addN.other', { n: selected.size })}
          </Btn>
        </div>
      )}
      <Btn kind="ghost" height={40} disabled={adding} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        {t('add.collection.backToSearch')}
      </Btn>
    </>
  );
}

/** "Add to {shelf/room}": search IGDB (or browse what's trending), scan a box's barcode, or jump to
 * library import. Adding several in a row keeps the dialog open. */
export function AddGameDialog() {
  const t = useT();
  const scope = useScope();
  const ui = useUi();
  const announceUnlock = useAnnounceUnlock();
  const roomId = scope.isShelf ? null : scope.scopeId;

  const close = () => ui.closeDialog('add');
  const onAdded = () => {
    void scope.ops.invalidate();
  };

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [collections, setCollections] = useState<CollectionSearchResult[]>([]);
  const [trending, setTrending] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hideAddons, setHideAddons] = useState(true);
  const { ownedPlatforms } = useAuth();
  // "Owned systems only" scopes search to the systems set in Profile & settings. It only applies
  // where the search isn't already pinned to a room's platform, and only once systems are set.
  const canScopeToOwned = ownedPlatforms.length > 0 && !scope.room?.platform;
  const [ownedOnlyPref, setOwnedOnlyPref] = useState(readOwnedOnlyPref);
  const allPlatforms = canScopeToOwned && !ownedOnlyPref;
  const toggleOwnedOnly = () =>
    setOwnedOnlyPref((v) => {
      writeOwnedOnlyPref(!v);
      return !v;
    });
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [suggestedIds, setSuggestedIds] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<GameSearchResult | null>(null);
  const [pendingPlatform, setPendingPlatform] = useState<RoomPlatform | null>(null);
  const [scanning, setScanning] = useState(false);
  const [collection, setCollection] = useState<CollectionSearchResult | null>(null);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const emptyPages = useRef(0);

  // Recommendations (IGDB's similar games for what's here) above Trending, with a co-op filter in rooms.
  const [recs, setRecs] = useState<RecommendedGame[]>([]);
  const [coopOnly, setCoopOnly] = useState(false);
  useEffect(() => {
    let dead = false;
    gamesApi
      .recommendations(roomId, roomId !== null && coopOnly, allPlatforms)
      .then(({ results: r }) => !dead && setRecs(r))
      .catch(() => !dead && setRecs([]));
    return () => {
      dead = true;
    };
  }, [roomId, coopOnly, allPlatforms]);

  // "Ask AI" picks, for the Personal Shelf (issue #820) or the room (issue #821).
  const aiPicks = useAiPicks(roomId);
  // Plain-language search (issue #823).
  const aiSearch = useAiSearch(roomId, allPlatforms);

  // Trending whenever there's no query.
  useEffect(() => {
    let dead = false;
    gamesApi
      .trending(roomId, hideAddons, allPlatforms)
      .then(({ results: r }) => !dead && setTrending(r))
      .catch(() => !dead && setTrending([]));
    return () => {
      dead = true;
    };
  }, [roomId, hideAddons, allPlatforms]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      ++reqId.current;
      setResults([]);
      setCollections([]);
      setNextOffset(0);
      setHasMore(false);
      setSearching(false);
      emptyPages.current = 0;
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current;
      emptyPages.current = 0;
      try {
        const res = await gamesApi.search(query.trim(), roomId, 0, hideAddons, false, allPlatforms);
        if (id !== reqId.current) return;
        setResults(res.results);
        setCollections(res.collections);
        setNextOffset(res.nextOffset);
        setHasMore(res.hasMore);
      } catch {
        if (id !== reqId.current) return;
        setResults([]);
        setCollections([]);
        setHasMore(false);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, roomId, hideAddons, allPlatforms]);

  // Infinite scroll through long franchise searches.
  useEffect(() => {
    const q = query.trim();
    if (!hasMore || searching || loadingMore || !q) return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const id = ++reqId.current;
        setLoadingMore(true);
        setLoadMoreError(null);
        gamesApi
          .search(q, roomId, nextOffset, hideAddons, false, allPlatforms)
          .then(({ results: more, nextOffset: off, hasMore: still }) => {
            if (id !== reqId.current) return;
            emptyPages.current = more.length > 0 ? 0 : emptyPages.current + 1;
            setResults((prev) => [...prev, ...more]);
            setNextOffset(off);
            setHasMore(still && emptyPages.current < MAX_CONSECUTIVE_EMPTY_PAGES);
          })
          .catch((err) => {
            if (id !== reqId.current) return;
            setHasMore(false);
            setLoadMoreError(err instanceof Error ? err.message : tNow('add.game.loadMoreFailed'));
          })
          .finally(() => id === reqId.current && setLoadingMore(false));
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, searching, loadingMore, nextOffset, query, roomId, hideAddons, allPlatforms]);

  async function add(result: GameSearchResult, extra?: { status?: 'backlog' | 'wishlist'; ownedPlatforms?: RoomPlatform[] }): Promise<boolean> {
    setAddingId(result.igdbId);
    setError(null);
    try {
      const res = await gamesApi.create({ igdbId: result.igdbId, roomId, ...extra });
      onAdded();
      announceUnlock(res.unlockedBadges);
      setAddedIds((prev) => new Set(prev).add(result.igdbId));
      if ('suggestion' in res) {
        setSuggestedIds((prev) => new Set(prev).add(result.igdbId));
        ui.notify(tNow('add.game.suggested', { title: result.title }));
      } else {
        // One toast: a second notify() would replace the first straight away.
        const noCoop = !!roomId && res.game.maxCoopPlayers == null;
        const room = scope.room?.name;
        ui.notify(
          scope.isShelf
            ? tNow('add.game.addedToShelf', { title: result.title })
            : room != null
              ? tNow(noCoop ? 'add.game.addedToRoomNoCoop' : 'add.game.addedToRoom', { title: result.title, room })
              : tNow(noCoop ? 'add.game.addedToTheRoomNoCoop' : 'add.game.addedToTheRoom', { title: result.title }),
        );
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : tNow('add.game.addFailed'));
      return false;
    } finally {
      setAddingId(null);
    }
  }

  function clickAdd(r: GameSearchResult) {
    if (roomId === null) {
      setPending(r);
      setPendingPlatform(null);
      setError(null);
      return;
    }
    void add(r);
  }

  async function confirmOwnership(status: 'backlog' | 'wishlist', platforms: RoomPlatform[]) {
    if (!pending) return;
    const ok = await add(pending, { status, ownedPlatforms: status === 'backlog' ? platforms : undefined });
    if (ok) {
      setPending(null);
      setPendingPlatform(null);
    }
  }

  function scanPicked(m: BarcodeGameMatch) {
    setScanning(false);
    setPending({ igdbId: m.igdbId, title: m.title, platform: m.platform, coverImageUrl: m.coverImageUrl, releaseYear: m.releaseYear });
    setPendingPlatform(m.matchedPlatform);
    setError(null);
  }

  const showingResults = query.trim().length > 0;
  const list = showingResults ? results : trending;
  const busy = addingId !== null;

  return (
    <>
      <Dialog
        onClose={collectionBusy ? () => {} : close}
        title={pending ? t('add.game.addTitle', { title: pending.title }) : collection ? collection.name : scope.isShelf ? t('add.game.addToShelf') : scope.room?.name != null ? t('add.game.addToRoom', { room: scope.room.name }) : t('add.game.addToThisRoom')}
        height="tall"
        bare={false}
        padded={false}
        top={
          pending || collection ? undefined : (
            <div style={st('padding:0 20px 12px;display:flex;flex-direction:column;gap:10px;flex-shrink:0')}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('add.manualMatch.searchGames')}
                ariaLabel={t('add.manualMatch.searchGames')}
                autoFocus
                disabled={busy}
                style="height:48px;padding-left:18px;border-radius:999px;background:var(--surf);border:1px solid var(--line);color:var(--text);font-size:16px;outline:none"
              />
              <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
                {roomId === null && (
                  <Btn height={36} padX={14} fontSize={13} onClick={() => setScanning(true)} style={{ color: 'var(--text2)' }}>
                    {t('add.barcode.title')}
                  </Btn>
                )}
                {roomId === null && (
                  <Btn height={36} padX={14} fontSize={13} onClick={() => ui.openDialog('import', { mode: 'sync' })} style={{ color: 'var(--text2)' }}>
                    {t('add.game.importLibrary')}
                  </Btn>
                )}
                {canScopeToOwned && (
                  <ChipToggle on={ownedOnlyPref} onClick={toggleOwnedOnly} height={36} fontSize={13}>
                    {t('add.game.ownedOnly')}
                  </ChipToggle>
                )}
                <ChipToggle on={hideAddons} onClick={() => setHideAddons((v) => !v)} height={36} fontSize={13}>
                  {t('add.game.hideAddons')}
                </ChipToggle>
                {aiSearch.ready && query.trim().split(/\s+/).length >= 3 && (
                  <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={aiSearch.busy || busy} onClick={() => void aiSearch.search(query)}>
                    {aiSearch.busy ? t('add.game.aiSearch.working') : t('add.game.aiSearch.button')}
                  </Btn>
                )}
              </div>
            </div>
          )
        }
      >
        <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 12px 28px;display:flex;flex-direction:column;gap:0')}>
          {pending ? (
            <div style={st('padding:0 8px;display:flex;flex-direction:column;gap:14px')}>
              <OwnershipStep
                result={pending}
                forced={pendingPlatform}
                busy={addingId === pending.igdbId}
                error={error}
                onConfirm={confirmOwnership}
                onBack={() => {
                  setPending(null);
                  setPendingPlatform(null);
                  setError(null);
                }}
              />
            </div>
          ) : collection ? (
            <div style={st('padding:0 8px;display:flex;flex-direction:column;gap:14px')}>
              <CollectionReview collection={collection} roomId={roomId} hideAddons={hideAddons} allPlatforms={allPlatforms} onAdded={onAdded} onBack={() => setCollection(null)} onBusy={setCollectionBusy} />
            </div>
          ) : (
            <>
              {error && <div role="alert" style={st('margin:0 8px 8px;padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{error}</div>}
              {aiSearch.error && <div role="alert" style={st('margin:0 8px 8px;padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{aiSearch.error}</div>}
              {aiSearch.state && (
                <>
                  <span style={st('display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 6px')}>
                    <span style={st('display:flex;align-items:center;gap:8px')}>
                      <Kicker size={11.5}>{t('add.game.aiSearch.heading')}</Kicker>
                      <AiBadge title={t('add.game.aiSearch.badge')} />
                    </span>
                    <Btn kind="ghost" height={30} padX={10} fontSize={12.5} onClick={aiSearch.clear}>
                      {t('add.game.aiSearch.back')}
                    </Btn>
                  </span>
                  <AiSearchChips filters={aiSearch.state.filters} onChange={(f) => void aiSearch.edit(f)} disabled={aiSearch.busy} />
                  {aiSearch.state.unsupported.length > 0 && (
                    <div style={st('padding:0 10px 8px;color:var(--muted);font-size:12.5px')}>{t('add.game.aiSearch.unsupported', { what: aiSearch.state.unsupported.join(', ') })}</div>
                  )}
                  {aiSearch.state.results.length === 0 && <div style={st('padding:2px 10px 10px;color:var(--muted);font-size:13.5px')}>{t('add.game.aiSearch.none')}</div>}
                  {aiSearch.state.results.map((r) => (
                    <ResultRow
                      key={`aisearch-${r.igdbId}`}
                      r={r}
                      added={addedIds.has(r.igdbId)}
                      suggested={suggestedIds.has(r.igdbId)}
                      adding={addingId === r.igdbId}
                      busy={busy}
                      onAdd={() => clickAdd(r)}
                    />
                  ))}
                </>
              )}
              {showingResults && collections.length > 0 && (
                <div style={st('display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 8px')}>
                  {collections.map((c) => (
                    <button key={c.collectionId} type="button" onClick={() => setCollection(c)} style={st('height:34px;padding:0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text2);font:600 13px var(--font-ui)')}>
                      {t('add.game.viewSeries', { name: c.name })}
                    </button>
                  ))}
                </div>
              )}
              {!showingResults && aiPicks.ready && (
                <>
                  <span style={st('display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 6px')}>
                    <span style={st('display:flex;align-items:center;gap:8px')}>
                      <Kicker size={11.5}>{t('add.game.ai.heading')}</Kicker>
                      {aiPicks.picks && <AiBadge title={t('add.game.ai.badge')} />}
                    </span>
                    <Btn kind="soft" height={30} padX={12} fontSize={12.5} disabled={aiPicks.busy} onClick={() => void aiPicks.ask()}>
                      {aiPicks.busy ? t('add.game.ai.working') : aiPicks.picks ? t('add.game.ai.again') : t('add.game.ai.ask')}
                    </Btn>
                  </span>
                  {!aiPicks.picks && !aiPicks.error && <div style={st('padding:2px 10px 10px;color:var(--muted);font-size:13.5px')}>{roomId === null ? t('add.game.ai.hint') : t('add.game.ai.hintRoom')}</div>}
                  {aiPicks.error && <div role="alert" style={st('margin:0 8px 8px;padding:10px 12px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13px/1.4 var(--font-ui)')}>{aiPicks.error}</div>}
                  {aiPicks.picks?.length === 0 && <div style={st('padding:2px 10px 10px;color:var(--muted);font-size:13.5px')}>{t('add.game.ai.none')}</div>}
                  {aiPicks.picks?.map((r) => (
                    <ResultRow
                      key={`ai-${r.igdbId}`}
                      r={r}
                      added={addedIds.has(r.igdbId)}
                      suggested={suggestedIds.has(r.igdbId)}
                      adding={addingId === r.igdbId}
                      busy={busy}
                      onAdd={() => clickAdd(r)}
                      extra={
                        <span style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px')}>
                          <AiPickedBadge title={t('add.game.ai.badge')} />
                          {r.reason && <span style={st('font:500 12px/1.35 var(--font-ui);color:var(--accText)')}>{r.reason}</span>}
                        </span>
                      }
                    />
                  ))}
                </>
              )}
              {!showingResults && (recs.length > 0 || coopOnly) && (
                <>
                  <span style={st('display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 6px')}>
                    <Kicker size={11.5}>{t('add.game.recommended')}</Kicker>
                    {roomId !== null && (
                      <ChipToggle on={coopOnly} onClick={() => setCoopOnly((v) => !v)} height={30} fontSize={12.5}>
                        {t('add.game.coopOnly')}
                      </ChipToggle>
                    )}
                  </span>
                  {recs.length === 0 && <div style={st('padding:4px 10px 10px;color:var(--muted);font-size:13.5px')}>{t('add.game.noCoopRecs')}</div>}
                  {recs.slice(0, 8).map((r) => (
                    <ResultRow
                      key={`rec-${r.igdbId}`}
                      r={r}
                      added={addedIds.has(r.igdbId)}
                      suggested={suggestedIds.has(r.igdbId)}
                      adding={addingId === r.igdbId}
                      busy={busy}
                      onAdd={() => clickAdd(r)}
                      extra={
                        <span style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;font:500 12px var(--font-ui);color:var(--accText)')}>
                          {r.reason}
                          {r.coop && <span style={st(TAG)}>{t('add.game.coopTag')}</span>}
                          {r.singlePlayerOnly && <span style={st(TAG)}>{t('add.game.singlePlayerTag')}</span>}
                        </span>
                      }
                    />
                  ))}
                </>
              )}
              <span style={{ display: 'block', padding: '8px 8px 6px' }}>
                <Kicker size={11.5}>{showingResults ? t('add.game.results') : t('add.game.trending')}</Kicker>
              </span>
              {searching && <div style={st('padding:8px;color:var(--muted);font-size:14px')}>{t('add.manualMatch.searching')}</div>}
              {list.map((r) => (
                <ResultRow
                  key={r.igdbId}
                  r={r}
                  added={addedIds.has(r.igdbId)}
                  suggested={suggestedIds.has(r.igdbId)}
                  adding={addingId === r.igdbId}
                  busy={busy}
                  onAdd={() => clickAdd(r)}
                />
              ))}
              {showingResults && hasMore && <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />}
              {loadingMore && <div style={st('padding:8px;color:var(--muted);font-size:14px')}>{t('add.game.loadingMore')}</div>}
              {loadMoreError && !loadingMore && <div style={st('padding:8px;color:var(--danger);font-size:14px')}>{loadMoreError}</div>}
              {!searching && list.length === 0 && (
                <div style={st('padding:18px 10px;color:var(--muted);font-size:14px')}>
                  {showingResults ? t('add.game.noMatches') : t('add.game.nothingYet')}
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
      {scanning && (
        <Suspense fallback={null}>
          <BarcodeScanner onPick={scanPicked} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </>
  );
}
