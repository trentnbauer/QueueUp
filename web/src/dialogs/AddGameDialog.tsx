import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ROOM_PLATFORM_LABELS,
  platformFamilyOf,
  type BarcodeGameMatch,
  type CollectionGamesResult,
  type CollectionSearchResult,
  type GameSearchResult,
  type RoomPlatform,
} from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, ChipToggle, Cover, Kicker, inputPill } from '../ui/primitives';
import { st } from '../ui/st';

const BarcodeScanner = lazy(() => import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

const PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const MAX_CONSECUTIVE_EMPTY_PAGES = 5;

const ADD_BTN = 'height:36px;padding:0 16px;border-radius:999px;border:none;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui)';
const ROW = 'display:flex;align-items:center;gap:12px;padding:8px;border-radius:14px';

function ResultRow({
  r,
  added,
  suggested,
  adding,
  busy,
  onAdd,
}: {
  r: GameSearchResult;
  added: boolean;
  suggested: boolean;
  adding: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div style={st(ROW)}>
      <Cover title={r.title} url={r.coverImageUrl} width={38} radius={7} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 15px var(--font-ui)')}>
          {r.title}
          {r.releaseYear ? ` (${r.releaseYear})` : ''}
        </span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{r.platform}</span>
      </div>
      <button type="button" onClick={onAdd} disabled={busy || added} style={st(ADD_BTN, added ? { background: 'var(--mintSoft)', color: 'var(--mint)' } : undefined)}>
        {adding ? 'Adding…' : added ? (suggested ? 'Suggested ✓' : 'Added ✓') : 'Add'}
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
  const year = new Date().getFullYear();
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
  return (
    <>
      <div style={st(ROW)}>
        <Cover title={result.title} url={result.coverImageUrl} width={38} radius={7} />
        <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 15px var(--font-ui)')}>{result.title}</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{result.platform}</span>
        </div>
      </div>
      {error && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{error}</div>}
      <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:4px;border-radius:999px;background:var(--surf)')}>
        {(
          [
            [true, 'I own this'],
            [false, "Don't own it yet"],
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
              Other platforms
              {!showOthers && otherPlatforms.some((p) => platforms.has(p)) && (
                <span style={st('color:var(--accText)')}>· {otherPlatforms.filter((p) => platforms.has(p)).length} selected</span>
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
        {busy ? 'Adding…' : owned ? 'Add as owned' : 'Add to Wishlist'}
      </Btn>
      <Btn kind="ghost" height={40} disabled={busy} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        Back
      </Btn>
    </>
  );
}

function CollectionReview({
  collection,
  roomId,
  hideAddons,
  onAdded,
  onBack,
  onBusy,
}: {
  collection: CollectionSearchResult;
  roomId: string | null;
  hideAddons: boolean;
  onAdded: () => void;
  onBack: () => void;
  onBusy: (b: boolean) => void;
}) {
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
      .collectionGames(collection.collectionId, roomId, hideAddons)
      .then((res) => {
        if (dead) return;
        setData(res);
        setSelected(new Set(res.games.map((g) => g.igdbId)));
      })
      .catch((err) => !dead && setLoadError(err instanceof Error ? err.message : 'Could not load that collection'))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [collection.collectionId, roomId, hideAddons]);

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
    const parts: string[] = [];
    if (added) parts.push(`Added ${added} game${added === 1 ? '' : 's'}`);
    if (suggested) parts.push(`Suggested ${suggested} for approval`);
    if (!parts.length) parts.push('Added 0 games');
    setSummary(failed.size ? `${parts.join(' · ')} - ${failed.size} couldn't be added.` : `${parts.join(' · ')}.`);
    if (failed.size) setAddError(`${failed.size} failed to add - try again individually from search.`);
  }

  if (loading) return <div style={st('color:var(--muted);font-size:14px')}>Loading collection…</div>;
  if (loadError || !data) return <div role="alert" style={st('color:var(--danger);font-size:14px')}>{loadError ?? 'Could not load that collection'}</div>;

  return (
    <>
      {addError && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{addError}</div>}
      {summary && !addError && <div style={st('padding:12px 14px;border-radius:14px;background:var(--mintSoft);color:var(--mint);font:500 13.5px/1.4 var(--font-ui)')}>{summary}</div>}
      {data.games.length === 0 ? (
        <div style={st('color:var(--muted);font-size:14px')}>
          {summary ? 'Nothing else left to add from this collection.' : `Nothing left to add from ${data.name}.`}
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
            {adding && progress ? `Adding ${progress.done}/${progress.total}…` : `Add ${selected.size} game${selected.size === 1 ? '' : 's'}`}
          </Btn>
        </div>
      )}
      <Btn kind="ghost" height={40} disabled={adding} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        Back to search
      </Btn>
    </>
  );
}

/** "Add to {shelf/room}": search IGDB (or browse what's trending), scan a box's barcode, or jump to
 * library import. Adding several in a row keeps the dialog open. */
export function AddGameDialog() {
  const scope = useScope();
  const ui = useUi();
  const announceUnlock = useAnnounceUnlock();
  const roomId = scope.isShelf ? null : scope.scopeId;
  const target = scope.isShelf ? 'your shelf' : (scope.room?.name ?? 'this room');

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

  // Trending whenever there's no query.
  useEffect(() => {
    let dead = false;
    gamesApi
      .trending(roomId, hideAddons)
      .then(({ results: r }) => !dead && setTrending(r))
      .catch(() => !dead && setTrending([]));
    return () => {
      dead = true;
    };
  }, [roomId, hideAddons]);

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
        const res = await gamesApi.search(query.trim(), roomId, 0, hideAddons);
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
  }, [query, roomId, hideAddons]);

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
          .search(q, roomId, nextOffset, hideAddons)
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
            setLoadMoreError(err instanceof Error ? err.message : 'Could not load more results.');
          })
          .finally(() => id === reqId.current && setLoadingMore(false));
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, searching, loadingMore, nextOffset, query, roomId, hideAddons]);

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
        ui.notify(`Suggested ${result.title}. A moderator will review it.`);
      } else {
        // One toast: a second notify() would replace the first straight away.
        const coopWarn = roomId && res.game.maxCoopPlayers == null ? ` ⚠️ It doesn't appear to support co-op.` : '';
        ui.notify(`Added ${result.title} to ${scope.isShelf ? 'your shelf' : (scope.room?.name ?? 'the room')}.${coopWarn}`);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that game');
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
        title={pending ? `Add "${pending.title}"` : collection ? collection.name : `Add to ${target}`}
        height="tall"
        bare={false}
        padded={false}
        top={
          pending || collection ? undefined : (
            <div style={st('padding:0 20px 12px;display:flex;flex-direction:column;gap:10px;flex-shrink:0')}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games"
                aria-label="Search games"
                autoFocus
                disabled={busy}
                style={st('height:48px;padding:0 18px;border-radius:999px;background:var(--surf);border:1px solid var(--line);color:var(--text);font-size:16px;outline:none')}
              />
              <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
                {roomId === null && (
                  <Btn height={36} padX={14} fontSize={13} onClick={() => setScanning(true)} style={{ color: 'var(--text2)' }}>
                    Scan a barcode
                  </Btn>
                )}
                {roomId === null && (
                  <Btn height={36} padX={14} fontSize={13} onClick={() => ui.openDialog('import')} style={{ color: 'var(--text2)' }}>
                    Import library
                  </Btn>
                )}
                <ChipToggle on={hideAddons} onClick={() => setHideAddons((v) => !v)} height={36} fontSize={13}>
                  Hide DLC &amp; add-ons
                </ChipToggle>
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
              <CollectionReview collection={collection} roomId={roomId} hideAddons={hideAddons} onAdded={onAdded} onBack={() => setCollection(null)} onBusy={setCollectionBusy} />
            </div>
          ) : (
            <>
              {error && <div role="alert" style={st('margin:0 8px 8px;padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{error}</div>}
              {showingResults && collections.length > 0 && (
                <div style={st('display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 8px')}>
                  {collections.map((c) => (
                    <button key={c.collectionId} type="button" onClick={() => setCollection(c)} style={st('height:34px;padding:0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text2);font:600 13px var(--font-ui)')}>
                      📚 {c.name} · View series
                    </button>
                  ))}
                </div>
              )}
              <span style={{ display: 'block', padding: '8px 8px 6px' }}>
                <Kicker size={11.5}>{showingResults ? 'RESULTS' : 'TRENDING'}</Kicker>
              </span>
              {searching && <div style={st('padding:8px;color:var(--muted);font-size:14px')}>Searching…</div>}
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
              {loadingMore && <div style={st('padding:8px;color:var(--muted);font-size:14px')}>Loading more…</div>}
              {loadMoreError && !loadingMore && <div style={st('padding:8px;color:var(--danger);font-size:14px')}>{loadMoreError}</div>}
              {!searching && list.length === 0 && (
                <div style={st('padding:18px 10px;color:var(--muted);font-size:14px')}>
                  {showingResults ? "No matches. Try another title, or scan the box's barcode." : 'Nothing to show yet. Search for a game above.'}
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
