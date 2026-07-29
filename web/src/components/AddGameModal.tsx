import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ROOM_PLATFORM_LABELS, type CollectionGamesResult, type CollectionSearchResult, type GameSearchResult, type RoomPlatform } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useAuth } from '../context/AuthContext';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import styles from './AddGameModal.module.css';

// html5-qrcode is a large dependency (~300kB) only ever needed by the rarely-used barcode-scan
// option (issue #402) - lazy-loaded so every other Add Game open (the overwhelming majority)
// doesn't pay for it.
const BarcodeScannerModal = lazy(() => import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal })));

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

interface AddGameModalProps {
  roomId: string | null;
  onAdded: () => void;
  onClose: () => void;
}

function optionId(igdbId: number): string {
  return `add-game-option-${igdbId}`;
}

// Infinite scroll stops auto-loading after this many consecutive pages add zero new results (see
// consecutiveEmptyPagesRef) - bounds how many back-to-back requests a single scroll can trigger
// when most/all of a franchise's remaining matches are already added to this room/shelf.
const MAX_CONSECUTIVE_EMPTY_PAGES = 5;

/** Small cover-art thumbnail shared by search results, collection review rows, and (exported for
 * reuse) PendingImportsSection's candidate picker (#452). Mirrors GameCard's fallback handling: a
 * CSS background-image (no load-failure signal of its own) paired with an invisible probe <img>
 * whose onError catches a dead/broken IGDB URL, falling back to the title text the same way a null
 * coverImageUrl already does. */
export function ResultThumb({ title, coverImageUrl }: { title: string; coverImageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [coverImageUrl]);

  return (
    <div
      className={styles.resultThumb}
      style={coverImageUrl && !failed ? { backgroundImage: `url(${coverImageUrl})` } : undefined}
    >
      {coverImageUrl && !failed && (
        <img src={coverImageUrl} alt="" aria-hidden="true" className={styles.resultThumbProbe} onError={() => setFailed(true)} />
      )}
      {(!coverImageUrl || failed) && (
        // Array.from (not title.slice(0, 1)) so a title starting with a surrogate-pair character
        // (an astral-plane emoji, etc.) yields one whole code point instead of half of one.
        <span className={styles.resultThumbFallback}>{(Array.from(title)[0] ?? '').toUpperCase()}</span>
      )}
    </div>
  );
}

interface AddGameOwnershipStepProps {
  result: GameSearchResult;
  /** Pre-checked platform selection, from the user's own Profile Settings "systems I own" list -
   * just a convenience default, not a constraint (every platform is still selectable). */
  ownedPlatformDefaults: RoomPlatform[];
  /** The specific platform a barcode scan resolved this physical copy to (issue #402), if any -
   * pre-checked (alongside ownedPlatformDefaults) and forces "I own this" as the default, since
   * scanning a physical box's barcode is itself a strong signal of ownership on that platform. */
  forcedPlatform?: RoomPlatform | null;
  busy: boolean;
  error: string | null;
  onConfirm: (status: 'backlog' | 'wishlist', ownedPlatforms: RoomPlatform[]) => void;
  onCancel: () => void;
}

/** Personal Shelf-only step shown after picking a game to add (rooms skip straight to adding
 * directly - see handleAddClick) - asks owned/not-owned (backlog vs wishlist) and, if owned, which
 * platform(s), instead of guessing from release date alone (see defaultStatusForRelease) or
 * leaving ownership unset until a separate follow-up action. There's no per-room equivalent of
 * this: a room's own ownership toggle already infers its platform from the room itself (see
 * gameOwnership.ts), which doesn't apply here since the Personal Shelf isn't scoped to one
 * platform. */
function AddGameOwnershipStep({ result, ownedPlatformDefaults, forcedPlatform, busy, error, onConfirm, onCancel }: AddGameOwnershipStepProps) {
  const currentYear = new Date().getFullYear();
  // A game that hasn't released yet (or isn't out this year) is far more likely to still be on a
  // wishlist than already owned - same year-based fallback defaultStatusForRelease uses server-
  // side, just here as a default the person can immediately override rather than a final decision.
  // A barcode scan overrides that guess entirely - see forcedPlatform's own doc comment.
  const [owned, setOwned] = useState(forcedPlatform != null || result.releaseYear === null || result.releaseYear <= currentYear);
  const [platforms, setPlatforms] = useState<Set<RoomPlatform>>(
    new Set(forcedPlatform ? [...ownedPlatformDefaults, forcedPlatform] : ownedPlatformDefaults),
  );

  function togglePlatform(platform: RoomPlatform) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  return (
    <div>
      <div className={styles.resultOption}>
        <ResultThumb title={result.title} coverImageUrl={result.coverImageUrl} />
        <div className={styles.resultMeta}>
          <span className={styles.resultTitle}>
            {result.title}
            {result.releaseYear ? ` (${result.releaseYear})` : ''}
          </span>
          <span className={styles.resultPlatform}>{result.platform}</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.ownershipChoice}>
        <label className={styles.ownershipOption}>
          <input type="radio" name="ownership" checked={owned} onChange={() => setOwned(true)} disabled={busy} />
          I own this
        </label>
        <label className={styles.ownershipOption}>
          <input type="radio" name="ownership" checked={!owned} onChange={() => setOwned(false)} disabled={busy} />
          Don't own it yet
        </label>
      </div>

      {owned && (
        <div className={styles.platformGrid}>
          {ROOM_PLATFORM_OPTIONS.map((platform) => (
            <label key={platform} className={styles.platformOption}>
              <input
                type="checkbox"
                checked={platforms.has(platform)}
                onChange={() => togglePlatform(platform)}
                disabled={busy}
              />
              {ROOM_PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>
      )}

      <div className={styles.collectionActions}>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => onConfirm(owned ? 'backlog' : 'wishlist', owned ? Array.from(platforms) : [])}
          disabled={busy || (owned && platforms.size === 0)}
        >
          {busy ? 'Adding…' : owned ? 'Add as owned' : 'Add to Wishlist'}
        </button>
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={busy}>
          Back
        </button>
      </div>
    </div>
  );
}

interface AddGameResultRowProps {
  result: GameSearchResult;
  added: boolean;
  suggested: boolean;
  adding: boolean;
  busy: boolean;
  onAdd: () => void;
  /** Only the search tab supports arrow-key navigation (it's the one with a text input to type
   * into) - the Popular tab is a plain browse list, so this is omitted there. */
  optionProps?: { id: string; highlighted: boolean; onMouseEnter: () => void };
}

/** One result row, shared by the search list and the Popular browse list (issue #363) - identical
 * thumb/title/platform/Add-button markup either way, since gamesApi.create's suggestion-vs-add
 * response handling in handleAdd doesn't care which tab a GameSearchResult came from. */
function AddGameResultRow({ result, added, suggested, adding, busy, onAdd, optionProps }: AddGameResultRowProps) {
  return (
    <div
      id={optionProps?.id}
      role={optionProps ? 'option' : undefined}
      aria-selected={optionProps ? optionProps.highlighted : undefined}
      className={`${styles.resultOption} ${optionProps?.highlighted ? styles.resultOptionHighlighted : ''}`}
      onMouseEnter={optionProps?.onMouseEnter}
    >
      <ResultThumb title={result.title} coverImageUrl={result.coverImageUrl} />
      <div className={styles.resultMeta}>
        <span className={styles.resultTitle}>
          {result.title}
          {result.releaseYear ? ` (${result.releaseYear})` : ''}
        </span>
        <span className={styles.resultPlatform}>{result.platform}</span>
      </div>
      <button
        type="button"
        className={`${styles.addButton} ${added ? styles.addButtonAdded : ''}`}
        onClick={onAdd}
        disabled={busy || added}
      >
        {adding ? 'Adding…' : added ? (suggested ? 'Suggested ✓' : 'Added ✓') : 'Add'}
      </button>
    </div>
  );
}

interface CollectionReviewProps {
  collection: CollectionSearchResult;
  roomId: string | null;
  onAdded: () => void;
  onBack: () => void;
  /** Lets the parent modal disable its own close controls while a batch add is running - closing
   * mid-batch previously left the add loop running invisibly in the background with no way for the
   * user to know, since nothing stopped it and the parent had no idea it was in progress. */
  onBusyChange: (busy: boolean) => void;
  /** Carries the search screen's "Hide DLC & add-ons" checkbox into the collection review list
   * (issue #354) - without this, a franchise collection (e.g. Borderlands 2) showed its DLC/season-
   * pass entries regardless of what the checkbox on the previous screen was set to. */
  hideAddons: boolean;
}

/** The screen shown after picking a collection from search (issue #272) - a review checklist
 * (pre-checked) rather than a single "add all" button, since a franchise can include remasters,
 * spinoffs, or regional re-releases someone might not want, and each add is still a full intake
 * (gg.deals pricing lookup) so silently kicking off a large batch from one click isn't a good
 * default. Sequential POSTs to the same single-game create endpoint everything else uses, rather
 * than a new bulk-create route - collections are small enough (capped server-side) that this
 * doesn't need its own backend path. */
function CollectionReview({ collection, roomId, onAdded, onBack, onBusyChange, hideAddons }: CollectionReviewProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<CollectionGamesResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<string | null>(null);
  // Belt-and-suspenders alongside onBusyChange disabling the parent's close controls - if the
  // component ever unmounts some other way while a batch add is in flight, this stops the loop
  // from starting any *further* creates, rather than letting it run to completion invisibly.
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Resetting here (not just on cleanup) matters in dev: React 18 StrictMode mounts, unmounts,
    // and remounts every component once on purpose to shake out exactly this class of bug - the
    // first (simulated) unmount's cleanup sets this true, and without resetting it back to false
    // on the second (real) mount, every batch add silently no-oped forever afterward (it would
    // immediately see cancelledRef.current === true and break before the first create). Harmless
    // in production, where there's no such double-invoke.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    gamesApi
      .collectionGames(collection.collectionId, roomId, hideAddons)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSelectedIds(new Set(result.games.map((g) => g.igdbId)));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load that collection');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collection.collectionId, roomId, hideAddons]);

  function toggle(igdbId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(igdbId)) next.delete(igdbId);
      else next.add(igdbId);
      return next;
    });
  }

  async function handleAddSelected() {
    if (!data || selectedIds.size === 0) return;
    const toAdd = data.games.filter((g) => selectedIds.has(g.igdbId));
    setAdding(true);
    onBusyChange(true);
    setAddError(null);
    setAddSummary(null);
    setAddProgress({ done: 0, total: toAdd.length });

    let added = 0;
    // Issue #362: in a room with requireGameApproval on, a plain Member's create call comes back
    // as a suggestion instead of a real game - tracked separately so the summary below can say
    // "suggested" rather than falsely claiming these landed in the backlog.
    let suggested = 0;
    const failedIds = new Set<number>();
    // Rooms are shared backlogs, typically meant to be played together - worth calling out which
    // of a batch add have no co-op data at all (see the single-add warning below for the same
    // reasoning), rather than only surfacing that one at a time via the per-card detail modal.
    const noCoopTitles: string[] = [];
    for (const game of toAdd) {
      if (cancelledRef.current) break;
      try {
        const response = await gamesApi.create({ igdbId: game.igdbId, roomId });
        if ('suggestion' in response) {
          suggested += 1;
        } else {
          added += 1;
          if (roomId && response.game.maxCoopPlayers == null) noCoopTitles.push(response.game.title);
        }
      } catch {
        failedIds.add(game.igdbId);
      }
      setAddProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    if (cancelledRef.current) return;

    // Drop the games that were actually added/suggested from the checklist, so a retry after a
    // partial failure only resubmits the ones that failed instead of re-creating (and getting
    // duplicate-rejected on) ones that already succeeded.
    setData((prev) => (prev ? { ...prev, games: prev.games.filter((g) => failedIds.has(g.igdbId)) } : prev));
    setSelectedIds(new Set(failedIds));

    setAdding(false);
    onBusyChange(false);
    setAddProgress(null);
    if (added > 0 || suggested > 0) onAdded();
    const failed = failedIds.size;
    const parts: string[] = [];
    if (added > 0) parts.push(`Added ${added} game${added === 1 ? '' : 's'}`);
    if (suggested > 0) parts.push(`Suggested ${suggested} game${suggested === 1 ? '' : 's'} for approval`);
    if (parts.length === 0) parts.push('Added 0 games');
    let summary = failed === 0 ? `${parts.join(' · ')}.` : `${parts.join(' · ')} - ${failed} couldn't be added.`;
    if (noCoopTitles.length > 0) {
      summary += ` ⚠️ No co-op data for: ${noCoopTitles.join(', ')}.`;
    }
    setAddSummary(summary);
    if (failed > 0) setAddError(`${failed} game${failed === 1 ? '' : 's'} failed to add - try again individually from search.`);
  }

  if (loading) {
    return <div className={styles.searching}>Loading collection…</div>;
  }

  if (loadError || !data) {
    return <div className={styles.error}>{loadError ?? 'Could not load that collection'}</div>;
  }

  const nothingLeft = data.games.length === 0;

  return (
    <div>
      {addError && <div className={styles.error}>{addError}</div>}
      {addSummary && !addError && <div className={styles.added}>{addSummary}</div>}
      {!addSummary && data.truncated && (
        <div className={styles.searching}>
          Showing the first {data.games.length} games in this collection - it has more than that.
        </div>
      )}

      {nothingLeft ? (
        <div className={styles.searching}>
          {addSummary
            ? 'Nothing else left to add from this collection.'
            : `Nothing left to add from ${data.name} - every game in it is already here, or none are available on this platform.`}
        </div>
      ) : (
        <div className={styles.resultsList}>
          {data.games.map((g: GameSearchResult) => (
            <label key={g.igdbId} className={styles.collectionRow}>
              <input
                type="checkbox"
                checked={selectedIds.has(g.igdbId)}
                onChange={() => toggle(g.igdbId)}
                disabled={adding}
              />
              <ResultThumb title={g.title} coverImageUrl={g.coverImageUrl} />
              <div className={styles.resultMeta}>
                <span className={styles.resultTitle}>
                  {g.title}
                  {g.releaseYear ? ` (${g.releaseYear})` : ''}
                </span>
                <span className={styles.resultPlatform}>{g.platform}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className={styles.collectionActions}>
        {!nothingLeft && (
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddSelected}
            disabled={adding || selectedIds.size === 0}
          >
            {adding && addProgress
              ? `Adding ${addProgress.done}/${addProgress.total}…`
              : `Add ${selectedIds.size} game${selectedIds.size === 1 ? '' : 's'}`}
          </button>
        )}
        <button type="button" className={styles.cancelButton} onClick={onBack} disabled={adding}>
          Back to search
        </button>
      </div>
    </div>
  );
}

/** Centered modal (matching Room Settings / Add Room) for searching and adding a game - replaces
 * the old always-visible inline search bar above the game grid. */
export function AddGameModal({ roomId, onAdded, onClose }: AddGameModalProps) {
  const { ownedPlatforms } = useAuth();
  // Personal Shelf only (see AddGameOwnershipStep) - which result the owned/platforms step is
  // currently showing, or null while the normal search/tabs UI is in view. Rooms skip this step
  // entirely (handleAddClick adds directly instead of setting this).
  const [pendingResult, setPendingResult] = useState<GameSearchResult | null>(null);
  // Issue #402: the platform a barcode scan resolved pendingResult to, if pendingResult came from
  // a scan rather than a normal search/Popular pick - passed through to AddGameOwnershipStep as
  // forcedPlatform. Cleared alongside pendingResult (see handleConfirmOwnership/handleAddClick).
  const [pendingResultPlatform, setPendingResultPlatform] = useState<RoomPlatform | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  // Issue #363: "Popular" is a separate browse mode alongside search, for discovering something
  // nobody had already thought to search for - its own fetch/loading/error state below, entirely
  // independent of the search-query-driven state that follows.
  const [activeTab, setActiveTab] = useState<'search' | 'popular'>('search');
  const [trendingResults, setTrendingResults] = useState<GameSearchResult[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [collections, setCollections] = useState<CollectionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Infinite-scroll paging (issue: search capped at one batch, missing titles that don't rank in
  // IGDB's first page for a franchise-heavy query) - nextOffset/hasMore mirror the API response,
  // loadingMore is tracked separately from `searching` (the initial/debounced fetch) so a "load
  // more" in flight doesn't show the "Searching…" state or block the input.
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Opt-out (issue #345): DLC/season-pass/expansion entries are hidden by default - a long-running
  // franchise search can otherwise be dominated by add-ons instead of the games someone's actually
  // looking for. Unchecking re-runs the search (it's a dependency of the search effects below).
  const [hideAddons, setHideAddons] = useState(true);
  // Bumped on every trending fetch so a response for a stale request (e.g. hideAddons flipped
  // mid-flight) can recognize it's outdated and skip overwriting fresher results - same pattern
  // as latestRequestIdRef below for search.
  const latestTrendingRequestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Counts consecutive loaded pages that added zero new results (every row already added to this
  // room/shelf) while IGDB still reported more raw matches - a large enough franchise someone
  // mostly already owns would otherwise auto-fire page after page back-to-back with nothing to
  // show for it, since an empty page doesn't push the sentinel out of view to stop the observer.
  // Not component state - it's write-only bookkeeping for the effect below, never rendered.
  const consecutiveEmptyPagesRef = useRef(0);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [addedTitle, setAddedTitle] = useState<string | null>(null);
  // Issue #362: whether the most recent addedTitle became a pending suggestion rather than
  // landing directly in the backlog - drives the confirmation banner's wording below.
  const [addedWasSuggestion, setAddedWasSuggestion] = useState(false);
  const [coopWarningTitle, setCoopWarningTitle] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  // Which of addedIds actually became a pending suggestion - drives the "Suggested ✓" per-row
  // button label below (addedWasSuggestion only tracks the single most recent one, for the banner).
  const [suggestedIds, setSuggestedIds] = useState<Set<number>>(new Set());
  const [activeCollection, setActiveCollection] = useState<CollectionSearchResult | null>(null);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coopWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // Bumped on every new search so a response for an older query can recognize it's stale and
  // avoid overwriting the results of a newer one that resolved first.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      if (coopWarningTimeoutRef.current) clearTimeout(coopWarningTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAddedTitle(null);
    if (!query.trim()) {
      // Bump the request id here too, or a still-in-flight search from before the query was
      // cleared can resolve afterward and pass the staleness check below, overwriting this
      // intentional clear with stale results.
      ++latestRequestIdRef.current;
      setResults([]);
      setCollections([]);
      setNextOffset(0);
      setHasMore(false);
      setLoadMoreError(null);
      consecutiveEmptyPagesRef.current = 0;
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++latestRequestIdRef.current;
      setSearching(true);
      setLoadMoreError(null);
      consecutiveEmptyPagesRef.current = 0;
      try {
        const { results, collections, nextOffset, hasMore } = await gamesApi.search(query.trim(), roomId, 0, hideAddons);
        if (requestId !== latestRequestIdRef.current) return;
        setResults(results);
        setCollections(collections);
        setNextOffset(nextOffset);
        setHasMore(hasMore);
      } catch {
        if (requestId !== latestRequestIdRef.current) return;
        setResults([]);
        setCollections([]);
        setNextOffset(0);
        setHasMore(false);
      } finally {
        if (requestId === latestRequestIdRef.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, roomId, hideAddons]);

  // Issue #363: fetches (or re-fetches, if hideAddons is toggled while this tab is active) the
  // "Popular" browse list. Only runs while that tab is actually showing - switching to "Search"
  // and back re-fetches rather than caching, but this is a single un-paginated request, not
  // meaningfully more expensive than showing a possibly-stale list.
  useEffect(() => {
    if (activeTab !== 'popular') return;
    const requestId = ++latestTrendingRequestIdRef.current;
    setTrendingLoading(true);
    setTrendingError(null);
    gamesApi
      .trending(roomId, hideAddons)
      .then(({ results }) => {
        if (requestId !== latestTrendingRequestIdRef.current) return;
        setTrendingResults(results);
      })
      .catch((err) => {
        if (requestId !== latestTrendingRequestIdRef.current) return;
        setTrendingResults([]);
        setTrendingError(err instanceof Error ? err.message : 'Could not load popular games');
      })
      .finally(() => {
        if (requestId === latestTrendingRequestIdRef.current) setTrendingLoading(false);
      });
  }, [activeTab, roomId, hideAddons]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  // Keeps loading the next page (IGDB's own "does this query have more" signal, via `hasMore`)
  // as the sentinel at the bottom of the results list scrolls into view - lets a franchise-heavy
  // search be paged all the way through instead of stopping at one fixed batch. Re-subscribes on
  // every dependency change so the observer's closure always has the current query/offset; while
  // loadingMore is true the effect bails before observing, which doubles as in-flight de-duping -
  // once it flips back to false, the effect re-runs and immediately re-fires if the sentinel is
  // still on screen (e.g. a page that filtered down to very few shown results).
  useEffect(() => {
    const trimmed = query.trim();
    if (!hasMore || searching || loadingMore || !trimmed) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const requestId = ++latestRequestIdRef.current;
        setLoadingMore(true);
        setLoadMoreError(null);
        gamesApi
          .search(trimmed, roomId, nextOffset, hideAddons)
          .then(({ results: more, nextOffset: newOffset, hasMore: stillMore }) => {
            if (requestId !== latestRequestIdRef.current) return;
            if (more.length > 0) {
              consecutiveEmptyPagesRef.current = 0;
            } else {
              consecutiveEmptyPagesRef.current += 1;
            }
            setResults((prev) => [...prev, ...more]);
            setNextOffset(newOffset);
            // A run of pages that came back fully filtered out (every match already added to this
            // room/shelf) stops auto-loading rather than hammering the endpoint indefinitely - the
            // franchise is effectively exhausted from this user's perspective even if IGDB itself
            // still has more raw rows for the query.
            setHasMore(stillMore && consecutiveEmptyPagesRef.current < MAX_CONSECUTIVE_EMPTY_PAGES);
          })
          .catch((err) => {
            if (requestId !== latestRequestIdRef.current) return;
            setHasMore(false);
            setLoadMoreError(err instanceof Error ? err.message : 'Could not load more results.');
          })
          .finally(() => {
            if (requestId === latestRequestIdRef.current) setLoadingMore(false);
          });
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, searching, loadingMore, nextOffset, query, roomId, hideAddons]);

  async function handleAdd(
    result: GameSearchResult,
    extra?: { status?: 'backlog' | 'wishlist'; ownedPlatforms?: RoomPlatform[] },
  ): Promise<boolean> {
    setAddingId(result.igdbId);
    setError(null);
    try {
      const response = await gamesApi.create({ igdbId: result.igdbId, roomId, ...extra });
      onAdded();
      // Stay open and keep the search results as-is so the user can add several games from the
      // same search without retyping - just mark this one as added (or suggested).
      setAddedIds((prev) => new Set(prev).add(result.igdbId));
      setAddedTitle(result.title);
      setAddedWasSuggestion('suggestion' in response);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setAddedTitle(null), 2500);

      if ('suggestion' in response) {
        // Issue #362: this room requires approval and the caller is a plain Member - nothing was
        // added to the backlog yet, so there's no maxCoopPlayers to warn about either.
        setSuggestedIds((prev) => new Set(prev).add(result.igdbId));
        return true;
      }

      // Rooms are shared backlogs, typically meant to be played together - a game with no co-op
      // data at all (IGDB found no multiplayer modes, or just doesn't have the data) is worth
      // flagging right when it's added, since that's the one moment someone's actually deciding
      // whether it belongs in this room. Not shown on the Personal Shelf (roomId null) - solo play
      // is the default there, so there's nothing to warn about.
      if (roomId && response.game.maxCoopPlayers == null) {
        setCoopWarningTitle(result.title);
        if (coopWarningTimeoutRef.current) clearTimeout(coopWarningTimeoutRef.current);
        coopWarningTimeoutRef.current = setTimeout(() => setCoopWarningTitle(null), 4000);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that game');
      return false;
    } finally {
      setAddingId(null);
    }
  }

  // Personal Shelf: a plain "Add" click opens the owned/platforms step instead of adding right
  // away (see AddGameOwnershipStep). Rooms have no such step - a room's own ownership toggle
  // already infers its platform from the room, so there's nothing extra to ask here.
  function handleAddClick(result: GameSearchResult) {
    if (roomId === null) {
      setPendingResult(result);
      setPendingResultPlatform(null);
      setError(null);
      return;
    }
    handleAdd(result);
  }

  async function handleConfirmOwnership(status: 'backlog' | 'wishlist', selectedPlatforms: RoomPlatform[]) {
    if (!pendingResult) return;
    const ok = await handleAdd(pendingResult, {
      status,
      ownedPlatforms: status === 'backlog' ? selectedPlatforms : undefined,
    });
    if (ok) {
      setPendingResult(null);
      setPendingResultPlatform(null);
    }
  }

  // Issue #402: a decoded barcode is looked up via ScanDex, then fed straight into the same
  // owned/platforms step a normal search pick uses - no match just surfaces a message and returns
  // to the scanner-free search view, rather than leaving the camera view stuck open on a dead end.
  async function handleBarcodeScanned(barcode: string) {
    setShowScanner(false);
    setBarcodeLoading(true);
    setBarcodeError(null);
    try {
      const { result } = await gamesApi.barcodeLookup(barcode);
      if (!result) {
        setBarcodeError("Couldn't find a match for that barcode - try searching by name instead.");
        return;
      }
      setPendingResult({
        igdbId: result.igdbId,
        title: result.title,
        platform: result.platform,
        coverImageUrl: result.coverImageUrl,
        releaseYear: result.releaseYear,
      });
      setPendingResultPlatform(result.matchedPlatform);
      setError(null);
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : "Couldn't look up that barcode.");
    } finally {
      setBarcodeLoading(false);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        handleAddClick(results[highlightedIndex]);
      }
    }
  }

  const listboxId = 'add-game-listbox';
  const busy = addingId !== null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={collectionBusy ? undefined : closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Add a game"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>
            {pendingResult ? `Add "${pendingResult.title}"` : activeCollection ? activeCollection.name : 'Add a Game'}
          </span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={collectionBusy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {pendingResult ? (
          <AddGameOwnershipStep
            result={pendingResult}
            ownedPlatformDefaults={ownedPlatforms}
            forcedPlatform={pendingResultPlatform}
            busy={addingId === pendingResult.igdbId}
            error={error}
            onConfirm={handleConfirmOwnership}
            onCancel={() => {
              setPendingResult(null);
              setPendingResultPlatform(null);
              setError(null);
            }}
          />
        ) : activeCollection ? (
          <CollectionReview
            collection={activeCollection}
            roomId={roomId}
            onAdded={onAdded}
            onBack={() => setActiveCollection(null)}
            onBusyChange={setCollectionBusy}
            hideAddons={hideAddons}
          />
        ) : (
          <>
            {/* Issue #363: "Popular" is a plain browse list alongside search, for discovering
                something nobody had already thought to search for. */}
            <div className={styles.tabRow} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'search'}
                className={`${styles.tabButton} ${activeTab === 'search' ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab('search')}
              >
                Search
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'popular'}
                className={`${styles.tabButton} ${activeTab === 'popular' ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab('popular')}
              >
                Popular
              </button>
              {/* Issue #402: importing a physical game from its box - Personal Shelf only, same
                  reasoning as the owned/platforms step this feeds into (rooms have no per-copy
                  ownership concept to scan for). */}
              {roomId === null && (
                <button
                  type="button"
                  className={styles.scanButton}
                  onClick={() => {
                    setBarcodeError(null);
                    setShowScanner(true);
                  }}
                  disabled={barcodeLoading}
                  title="Scan a physical game's barcode"
                  aria-label="Scan a physical game's barcode"
                >
                  📷
                </button>
              )}
            </div>

            {barcodeLoading && <div className={styles.searching}>Looking up that barcode…</div>}
            {barcodeError && <div className={styles.error}>{barcodeError}</div>}
            {error && <div className={styles.error}>{error}</div>}
            {addedTitle && !error && (
              <div className={styles.added}>
                {addedWasSuggestion
                  ? `Suggested "${addedTitle}" - waiting for a moderator to approve.`
                  : `Added "${addedTitle}" ✓`}
              </div>
            )}
            {coopWarningTitle && !error && (
              <div className={styles.coopWarning}>⚠️ "{coopWarningTitle}" doesn't appear to support co-op</div>
            )}

            {activeTab === 'search' ? (
              <>
                <input
                  ref={inputRef}
                  className={styles.input}
                  placeholder="Search for a game…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={busy}
                  autoFocus
                  role="combobox"
                  aria-expanded={results.length > 0}
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    highlightedIndex >= 0 && highlightedIndex < results.length
                      ? optionId(results[highlightedIndex].igdbId)
                      : undefined
                  }
                />

                <label className={styles.hideAddonsField}>
                  <input
                    type="checkbox"
                    checked={hideAddons}
                    onChange={(e) => setHideAddons(e.target.checked)}
                  />
                  Hide DLC &amp; add-ons
                </label>

                {searching && <div className={styles.searching}>Searching…</div>}

                {collections.length > 0 && (
                  <div className={styles.collectionsList}>
                    {collections.map((c) => (
                      <button
                        key={c.collectionId}
                        type="button"
                        className={styles.collectionOption}
                        onClick={() => setActiveCollection(c)}
                      >
                        <span aria-hidden="true">📚</span> {c.name}
                        <span className={styles.collectionHint}>View series</span>
                      </button>
                    ))}
                  </div>
                )}

                {results.length > 0 && (
                  <div className={styles.resultsList} role="listbox" id={listboxId}>
                    {results.map((r, i) => (
                      <AddGameResultRow
                        key={r.igdbId}
                        result={r}
                        added={addedIds.has(r.igdbId)}
                        suggested={suggestedIds.has(r.igdbId)}
                        adding={addingId === r.igdbId}
                        busy={busy}
                        onAdd={() => handleAddClick(r)}
                        optionProps={{
                          id: optionId(r.igdbId),
                          highlighted: i === highlightedIndex,
                          onMouseEnter: () => setHighlightedIndex(i),
                        }}
                      />
                    ))}
                    {hasMore && <div ref={sentinelRef} className={styles.loadMoreSentinel} aria-hidden="true" />}
                    {loadingMore && <div className={styles.searching}>Loading more…</div>}
                    {loadMoreError && !loadingMore && <div className={styles.error}>{loadMoreError}</div>}
                  </div>
                )}
              </>
            ) : (
              <>
                <label className={styles.hideAddonsField}>
                  <input
                    type="checkbox"
                    checked={hideAddons}
                    onChange={(e) => setHideAddons(e.target.checked)}
                  />
                  Hide DLC &amp; add-ons
                </label>

                {trendingLoading && <div className={styles.searching}>Loading popular games…</div>}
                {trendingError && !trendingLoading && <div className={styles.error}>{trendingError}</div>}

                {!trendingLoading && !trendingError && trendingResults.length === 0 && (
                  <div className={styles.searching}>Nothing to show - every popular title is already here.</div>
                )}

                {trendingResults.length > 0 && (
                  <div className={styles.resultsList}>
                    {trendingResults.map((r) => (
                      <AddGameResultRow
                        key={r.igdbId}
                        result={r}
                        added={addedIds.has(r.igdbId)}
                        suggested={suggestedIds.has(r.igdbId)}
                        adding={addingId === r.igdbId}
                        busy={busy}
                        onAdd={() => handleAddClick(r)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!activeCollection && !pendingResult && (
          <div className={styles.cancelZone}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScannerModal onScanned={handleBarcodeScanned} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}
