import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Game, GameStatus, VoteValue } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useViewMode } from '../context/ViewModeContext';
import { useAiActivity } from '../hooks/useAiActivity';
import { useCardDensity } from '../context/CardDensityContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAttention } from '../hooks/useAttention';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { useVersion } from '../hooks/useVersion';
import { SHELF_TABS, SHELF_MORE_TABS, SHELF_IMPORT_TABS, ROOM_TABS } from '../lib/gameView';
import { JournalList } from './JournalList';
import { UNDO_MS } from '../game/useChangeStatus';
import { PendingImportsList } from './PendingImportsList';
import { useQuery } from '@tanstack/react-query';
import { DUPLICATE_COUNT_QUERY_KEY, MERGED_GAMES_QUERY_KEY, gamesApi } from '../api/games';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { MergedGamesList } from './MergedGamesList';
import { DISMISSED_IMPORTS_QUERY_KEY, PENDING_IMPORTS_QUERY_KEY, pendingImportsApi } from '../api/pendingImports';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import { Avatar, Banner, Btn, SearchField, Spinner } from '../ui/primitives';
import { useStableOrder } from './useStableOrder';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { buildHomeLists, toRowItem } from './derive';
import { useBacklogSort } from './backlogSort';
import { useMaxInstallGb } from './installSize';
import { PlatformMenu, useIncludeOlder, usePlatformFilter, usePlatformOptions } from './PlatformMenu';
import { ComingStrip, CoverCard, DesktopRow, MobileRow, PlayNextRow } from './Rows';
import { ComingDlcStrip } from './ComingDlcStrip';
import { Footer } from '../shell/Footer';
import { BulkBar, BulkStatusSheet } from './BulkBar';
import { useIncrementalList } from '../hooks/useIncrementalList';
import { rich, useT } from '../i18n';

const MAX_SHOWN_HINT = 5000;

const SHELF_ALL_TABS = [...SHELF_TABS, ...SHELF_MORE_TABS];

/** A card already dealt with in this search: greyed and faded, but still tappable and readable. */
const dimStyle = (on: boolean) => (on ? 'opacity:0.45;filter:grayscale(1);transition:opacity .2s,filter .2s' : 'transition:opacity .2s,filter .2s');

/** The Personal Shelf / room home: header, nudges, tabs + search, lists. One component for both
 * layouts - the row/header geometry branches on `mobile`. */
export function HomeView() {
  const t = useT();
  const scope = useScope();
  const ui = useUi();
  const mobile = useIsMobile();
  const { viewMode } = useViewMode();
  const { density } = useCardDensity();
  const confirm = useConfirm();
  const attention = useAttention();
  const pendingImports = usePendingImportsCount();
  const { version } = useVersion();
  const { isShelf, room, members, games, ops } = scope;
  // "Possible duplicates" nudge: counted from titles alone (free, no AI), and only offered once AI is
  // set up, since the AI is what judges them and merges them into the original.
  const aiSettings = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine, enabled: isShelf });
  const aiReady = !!aiSettings.data && aiSettings.data.effectiveSource !== 'none';
  const duplicateCount = useQuery({ queryKey: DUPLICATE_COUNT_QUERY_KEY, queryFn: gamesApi.duplicateCandidateCount, enabled: isShelf && aiReady, staleTime: 10 * 60_000 });
  const possibleDuplicates = duplicateCount.data?.count ?? 0;
  const scanningDuplicates = useAiActivity('duplicates');
  const navigate = useNavigate();

  // Room header row (members, Invite, vote/approve nudges): if it spills onto a second line, first
  // try collapsing the nudges to just their buttons (data-compact="1" hides .nudge-text, see
  // global.css). Done on the DOM directly so there's no flash of the wrapped layout.
  const metaRowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = metaRowRef.current;
    if (!el) return;
    const check = () => {
      el.dataset.compact = '0';
      const items = Array.from(el.querySelectorAll<HTMLElement>(':scope > *, :scope > * > button'));
      const top = items[0]?.getBoundingClientRect().top ?? 0;
      el.dataset.compact = items.some((i) => i.getBoundingClientRect().top - top > 4) ? '1' : '0';
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // The shelf's primary tabs, plus the filters tucked behind the "+" button (Dropped, Won't play and
  // the two lists of synced titles that never became games).
  const tabs = isShelf ? SHELF_ALL_TABS : ROOM_TABS;
  const primaryTabs = isShelf ? SHELF_TABS : ROOM_TABS;
  const [tab, setTab] = useState('queue');
  const [moreOpen, setMoreOpen] = useState(false);
  const pendingList = useQuery({ queryKey: PENDING_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.list, enabled: isShelf });
  const dismissedList = useQuery({ queryKey: DISMISSED_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.listDismissed, enabled: isShelf && moreOpen });
  const importTab = tab === 'matching' || tab === 'dismissed' || tab === 'merged' ? tab : null;
  const mergedList = useQuery({ queryKey: MERGED_GAMES_QUERY_KEY, queryFn: gamesApi.mergedList, enabled: isShelf && moreOpen });
  const moreActive = SHELF_MORE_TABS.some((tb) => tb.id === tab) || importTab !== null;
  const [query, setQuery] = useState('');
  // The 📖 tab shows the play journal instead of a game list - the room's, or on the shelf your own
  // across the shelf and your rooms (a search still searches games).
  const journalTab = tab === 'journal' && query.trim().length === 0;
  const otherTab = importTab !== null || journalTab;
  const [bulk, setBulk] = useState(false);
  const [bulkSel, setBulkSel] = useState<string[]>([]);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  // Switching shelf/room resets the view, like the design.
  useEffect(() => {
    setTab('queue');
    setMoreOpen(false);
    setQuery('');
    setBulk(false);
    setBulkSel([]);
  }, [scope.scopeId]);

  const searching = query.trim().length > 0;
  // Header platform filter (#799) and the shelf's Backlog sort from Shelf settings (#798).
  const [savedPlatform, setPlatform] = usePlatformFilter(scope.scopeId);
  // A room locked to one platform shows no filter, so a pick saved before it was locked mustn't apply.
  const platform = isShelf || !room?.platform ? savedPlatform : null;
  const [includeOlder, setIncludeOlder] = useIncludeOlder(scope.scopeId);
  const platformOptions = usePlatformOptions({ isShelf, roomId: room?.id ?? null });
  const [backlogSort] = useBacklogSort();
  const [maxInstallGb, setMaxInstallGb] = useMaxInstallGb();
  const lists = useMemo(
    () => buildHomeLists(games, { isShelf, tabs, tab, query, platform, includeOlder, backlogSort, maxInstallGb }),
    [games, isShelf, tabs, tab, query, platform, includeOlder, backlogSort, maxInstallGb],
  );
  const showRank = tab === 'queue' && !searching;
  const ctx = { isShelf, tab, searching, all: games };
  // Voting changes scores, which would re-sort the list under you - keep the order until the view changes.
  const orderKey = `${scope.scopeId}|${tab}|${query}|${platform ?? ''}|${includeOlder}|${backlogSort.join(',')}|${maxInstallGb}`;
  const orderedList = useStableOrder(lists.list, orderKey);
  const orderedPlayNext = useStableOrder(lists.playNext, `${orderKey}|next`);
  const items = otherTab ? [] : orderedList.map((g, i) => toRowItem(g, i + 1, ctx));
  const playNextItems = otherTab ? [] : orderedPlayNext.map((g, i) => toRowItem(g, i + 1, ctx));
  const { visible: visibleItems, hasMore, sentinelRef } = useIncrementalList(items, `${orderKey}|${viewMode}`);

  const toVote = room ? attention.toVote(room.id) : 0;
  const toApprove = scope.canManage && !isShelf ? scope.suggestions.length : 0;

  const onVote = (g: Game, v: VoteValue) => (g.myVote === v ? ops.unvote(g.id) : ops.vote(g.id, v));
  // While searching, a card that has been opened (to mark it Beaten, vote, ...) goes grey, so going down a long list of
  // results shows where you left off. Forgotten as soon as the search is cleared or the shelf/room changes.
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!searching) setVisited((prev) => (prev.size ? new Set() : prev));
  }, [searching]);
  useEffect(() => setVisited(new Set()), [scope.scopeId]);
  const dimmed = (id: string) => searching && visited.has(id);
  const open = (g: Game) => {
    if (bulk) setBulkSel((prev) => (prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]));
    else {
      if (searching) setVisited((prev) => (prev.has(g.id) ? prev : new Set(prev).add(g.id)));
      ui.selectGame(g.id);
    }
  };

  // A room locked to one platform has nothing to filter - its platform stays plain text.
  const platformMenu = (
    <PlatformMenu
      value={platform}
      options={platformOptions}
      allLabel={isShelf ? t('home.platform.every') : t('home.platform.any')}
      onChange={setPlatform}
      includeOlder={includeOlder}
      onIncludeOlder={setIncludeOlder}
      maxInstallGb={maxInstallGb}
      onMaxInstallGb={setMaxInstallGb}
      emptyHint={isShelf ? t('home.platform.emptyShelf') : t('home.platform.emptyRoom')}
      lockedLabel={!isShelf && room?.platform ? ROOM_PLATFORM_LABELS[room.platform] : undefined}
    />
  );
  const meta = isShelf ? (
    <>{rich(t('home.meta.justYou'), { platform: platformMenu })}</>
  ) : (
    <>
      {platformMenu} · {t(members.length === 1 ? 'home.meta.room.one' : 'home.meta.room.other', { n: members.length, queued: games.filter((g) => g.status === 'backlog').length }).toUpperCase()}
    </>
  );

  const title = isShelf ? t('home.title.shelf') : (room?.name ?? '');
  const emptyAdd = !searching && !platform && tab === 'queue';
  const emptyMsg = searching
    ? t('home.empty.search', { query })
    : platform
      ? t('home.empty.platform', { platform: ROOM_PLATFORM_LABELS[platform] })
    : tab === 'queue'
      ? t('home.empty.queue')
      : tab === 'playing'
        ? t('home.empty.playing')
        : t('home.empty.default');

  const allSelected = items.length > 0 && items.every((it) => bulkSel.includes(it.game.id));
  // Action failures (e.g. a rate-limited price refresh) show as a toast, wherever they came from.
  const { actionError, clearActionError } = ops;
  useEffect(() => {
    if (!actionError) return;
    ui.showError(actionError);
    clearActionError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionError]);

  async function bulkRemove() {
    const n = bulkSel.length;
    if (!n) return;
    const ok = await confirm({
      title: t(n === 1 ? 'home.bulk.removeTitle.one' : 'home.bulk.removeTitle.other', { n }),
      message: t('home.bulk.removeMessage'),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    await ops.bulkRemove(bulkSel);
    setBulkSel([]);
    ui.notify(t(n === 1 ? 'home.bulk.removed.one' : 'home.bulk.removed.other', { n }));
  }

  const showNudge = !searching && (isShelf ? pendingImports > 0 : toVote > 0);
  const nudgeLabel = isShelf
    ? t(pendingImports === 1 ? 'home.nudge.match.one' : 'home.nudge.match.other', { n: pendingImports })
    : t('home.nudge.toVote', { n: toVote });
  const nudgeAction = isShelf ? t('home.nudge.matchBtn') : t('home.nudge.voteNow');

  const Row = mobile ? MobileRow : DesktopRow;
  const coverGridStyle = mobile
    ? `display:grid;grid-template-columns:repeat(${density === 'small' ? 3 : 2},minmax(0,1fr));gap:18px 12px`
    : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px 12px';
  const startPlaying = (game: Game) => {
    ops.updateStatus(game.id, 'playing');
    ui.notify(t('home.notify.nowPlaying', { title: game.title }));
  };

  const showMergeNudge = isShelf && !searching && possibleDuplicates > 0;
  const nudges = (showNudge || showMergeNudge || (toApprove > 0 && !searching)) ? (
        <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
          {showNudge && (
            <button
              type="button"
              onClick={() => (isShelf ? ui.openDialog('needsReview') : ui.openDialog('deck'))}
              aria-label={t('home.nudge.aria', { label: nudgeLabel, action: nudgeAction })}
              title={nudgeLabel}
              className="nudge"
              style={st('align-self:flex-start;display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:999px;border:none;background:var(--accSoft);color:var(--accText);font:600 13.5px var(--font-ui)')}
            >
              <span className="nudge-text" style={st('display:flex;align-items:center;gap:10px')}>
                <span style={st('width:8px;height:8px;border-radius:50%;background:var(--acc)')} />
                {nudgeLabel}
              </span>
              <span style={st('height:28px;padding:0 11px;border-radius:999px;background:var(--acc);color:var(--ink);display:flex;align-items:center;font-size:12px')}>
                {nudgeAction}
              </span>
            </button>
          )}
          {showMergeNudge && (
            <button
              type="button"
              onClick={() => ui.openDialog('duplicates')}
              aria-label={t('home.nudge.aria', { label: t(possibleDuplicates === 1 ? 'home.nudge.merge.one' : 'home.nudge.merge.other', { n: possibleDuplicates }), action: t('home.nudge.mergeBtn') })}
              title={t('home.nudge.merge.title')}
              className="nudge"
              style={st('align-self:flex-start;display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}
            >
              {scanningDuplicates && <Spinner />}
              <span className="nudge-text">{scanningDuplicates ? t('home.nudge.merge.scanning') : t(possibleDuplicates === 1 ? 'home.nudge.merge.one' : 'home.nudge.merge.other', { n: possibleDuplicates })}</span>
              <span style={st('height:28px;padding:0 11px;border-radius:999px;background:var(--chip);color:var(--accText);display:flex;align-items:center;font-size:12px')}>{t('home.nudge.mergeBtn')}</span>
            </button>
          )}
          {toApprove > 0 && !searching && (
            <button
              type="button"
              onClick={() => ui.openDialog('roomSettings')}
              aria-label={t('home.nudge.toApproveAria', { n: toApprove })}
              title={t('home.nudge.toApprove', { n: toApprove })}
              className="nudge"
              style={st('display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}
            >
              <span className="nudge-text">{t('home.nudge.toApprove', { n: toApprove })}</span>
              <span style={st('height:28px;padding:0 11px;border-radius:999px;background:var(--chip);color:var(--accText);display:flex;align-items:center;font-size:12px')}>{t('home.nudge.review')}</span>
            </button>
          )}
        </div>
      ) : null;

  return (
    <>
      <header style={st('display:flex;flex-direction:column;gap:8px')}>
        <span style={st('font:500 12px var(--font-mono);letter-spacing:0.04em;color:var(--muted)')}>{meta}</span>
        <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:10px')}>
          <h1
            style={st(
              `flex:1 1 ${mobile ? 0 : 280}px;min-width:0;margin:0;${mobile ? 'min-height:calc(2 * 1.05em);display:flex;align-items:center;' : ''}font:700 ${mobile ? 34 : 44}px/${mobile ? 1.05 : 1.02} var(--font-display);letter-spacing:-0.03${mobile ? '' : '5'}em;text-wrap:balance`,
            )}
          >
            {title}
          </h1>
          {!mobile && (
            <>
              <Btn hover height={42} fontSize={14} onClick={() => ui.openDialog('ranked')}>
                {t('home.header.ranked')}
              </Btn>
              <Btn hover height={42} fontSize={14} onClick={() => ui.openDialog('add', {})}>
                {t('home.header.addGame')}
              </Btn>
            </>
          )}
          <Btn
            kind="accent"
            height={mobile ? 40 : 42}
            padX={mobile ? 18 : 22}
            fontSize={14}
            weight={800}
            onClick={() => ui.openDialog('spin')}
            style={{ fontFamily: 'var(--font-display)', boxShadow: '0 6px 20px var(--accA30)' }}
          >
            {t('home.header.spin')}
          </Btn>
          <button
            type="button"
            onClick={() => ui.openDialog(isShelf ? 'shelfSettings' : 'roomSettings')}
            aria-label={isShelf ? t('home.header.shelfSettings') : t('home.header.roomSettings')}
            style={st(
              `flex-shrink:0;width:${mobile ? 40 : 42}px;height:${mobile ? 40 : 42}px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font:700 16px var(--font-ui);letter-spacing:1px;padding:0 0 6px`,
            )}
          >
            …
          </button>
        </div>
        {isShelf ? (
          <div style={st('display:flex;align-items:center;height:32px;margin-top:2px;min-width:0')}>
            <span style={st('min-width:0;font:400 13.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
              {t('home.header.shelfSub')}
            </span>
          </div>
        ) : (
          <div ref={metaRowRef} style={st('display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:2px')}>
            <div style={{ display: 'flex', paddingLeft: 8 }}>
              {members.map((m) => (
                <button
                  key={m.user.id}
                  type="button"
                  onClick={() => navigate(`/u/${m.user.id}`)}
                  aria-label={t('home.header.memberProfile', { name: m.user.displayName })}
                  title={m.user.displayName}
                  style={{ marginLeft: -8, padding: 0, border: 'none', background: 'none', borderRadius: '50%', cursor: 'pointer' }}
                >
                  <Avatar
                    name={m.user.displayName}
                    color={m.user.avatarColor}
                    avatarUrl={m.user.avatarUrl}
                    size={30}
                    fontSize={12}
                    style={{ border: '2.5px solid var(--bg)' }}
                  />
                </button>
              ))}
            </div>
            {(scope.canManage || room?.invitePermission === 'members') && (
              <Btn height={32} padX={14} fontSize={13} weight={500} onClick={() => ui.openDialog('roomSettings')} style={{ color: 'var(--muted)' }}>
                {t('home.header.invite')}
              </Btn>
            )}
            {nudges}
          </div>
        )}
      </header>

      {scope.truncated && (
        <Banner kind="warn">
          {t('home.truncated', { n: MAX_SHOWN_HINT })}
        </Banner>
      )}

      {isShelf && nudges}

      <div style={st(mobile ? 'display:flex;flex-direction:column;gap:12px' : 'display:flex;flex-wrap:wrap;align-items:center;gap:12px')}>
        <div
          role="tablist"
          style={st(`${mobile ? '' : 'flex:1 1 380px;min-width:0;'}display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--surf);overflow-x:auto`)}
        >
          {primaryTabs.map((tb) => {
            const on = tab === tb.id && !searching;
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(tb.id);
                  setQuery('');
                }}
                style={st(
                  `flex:1 0 auto;display:flex;align-items:center;justify-content:center;gap:5px;height:36px;padding:0 12px;border-radius:999px;border:none;background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--muted)'};font:600 13.5px var(--font-ui)`,
                )}
              >
                {tb.label}
                <span style={st('font:500 11px var(--font-mono);opacity:0.6')}>{lists.counts[tb.id] ?? 0}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={journalTab}
            aria-label={t('home.journalTab')}
            title={t('home.journalTab')}
            onClick={() => {
              setTab('journal');
              setQuery('');
            }}
            style={st(
              // Pinned to the end so it stays in view when the tabs scroll on a phone.
              `position:sticky;right:${isShelf ? 32 : 0}px;z-index:1;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:40px;height:36px;border-radius:999px;border:none;background:${journalTab ? 'var(--text)' : 'var(--surf)'};box-shadow:-8px 0 8px var(--surf);font:400 17px/1 var(--font-ui)`,
            )}
          >
            <span aria-hidden>📖</span>
          </button>
          {isShelf && (
            <button
              type="button"
              aria-label={t('home.moreFilters')}
              aria-expanded={moreOpen || moreActive}
              title={t('home.moreFilters')}
              onClick={() => setMoreOpen((o) => !o)}
              style={st(
                `position:sticky;right:0;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;border:none;background:${moreActive ? 'var(--text)' : 'var(--surf)'};box-shadow:6px 0 0 var(--surf);color:${moreActive ? 'var(--onText)' : 'var(--muted)'};font:500 20px/1 var(--font-ui);transform:${moreOpen || moreActive ? 'rotate(45deg)' : 'none'};transition:transform 0.15s`,
              )}
            >
              +
            </button>
          )}
        </div>
        <div style={st(mobile ? 'display:flex;gap:10px' : 'flex:1 1 320px;min-width:0;display:flex;gap:10px')}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={isShelf ? t('home.search.shelf') : t('home.search.room')}
            ariaLabel={t('home.search.aria')}
            wrapStyle="flex:1"
            style="height:44px;padding-left:16px;border-radius:999px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none"
          />
          {isShelf && !bulk && items.length > 0 && (
            <Btn height={44} padX={16} onClick={() => { setBulk(true); setBulkSel([]); ui.selectGame(null); }}>
              {t('home.select')}
            </Btn>
          )}
          {mobile && (tab === 'queue' || tab === 'playing') && (
            <Btn height={44} padX={16} onClick={() => ui.openDialog('ranked')}>
              {t('home.header.ranked')}
            </Btn>
          )}
        </div>
      </div>

      {isShelf && (moreOpen || moreActive) && (
        <div role="tablist" aria-label={t('home.moreFilters')} style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {[
            ...SHELF_MORE_TABS.map((tb) => ({ id: tb.id, label: tb.label, count: lists.counts[tb.id] ?? 0 })),
            { id: 'matching', label: SHELF_IMPORT_TABS[0].label, count: pendingList.data?.pending.length ?? 0 },
            { id: 'dismissed', label: SHELF_IMPORT_TABS[1].label, count: dismissedList.data?.pending.length ?? null },
            { id: 'merged', label: SHELF_IMPORT_TABS[2].label, count: mergedList.data?.merged.length ?? null },
          ].map((tb) => {
            const on = tab === tb.id && !searching;
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(tb.id);
                  setQuery('');
                }}
                style={st(
                  `display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;border:1px solid ${on ? 'transparent' : 'var(--line)'};background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--text2)'};font:600 13px var(--font-ui)`,
                )}
              >
                {tb.label}
                {tb.count !== null && <span style={st('font:500 11px var(--font-mono);opacity:0.6')}>{tb.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {importTab === 'merged' && <MergedGamesList />}
      {(importTab === 'matching' || importTab === 'dismissed') && <PendingImportsList kind={importTab} />}
      {journalTab && (
        <JournalList
          roomId={room?.id}
          onOpen={(e) => {
            // A shelf journal entry can be from a room: go there before opening it.
            if (e.roomId !== (room?.id ?? null)) navigate(e.roomId ? `/room/${e.roomId}` : '/');
            ui.selectGame(e.gameId);
          }}
        />
      )}

      {!otherTab && lists.coming.length > 0 && (
        <ComingStrip
          games={lists.coming}
          onOpen={(g) => ui.selectGame(g.id)}
          onToggleWatch={(g) => {
            ops.setReleaseAlert(g.id, !g.releaseAlert);
            ui.notify(g.releaseAlert ? t('home.notify.alertOff') : t('home.notify.alertOn', { title: g.title }));
          }}
        />
      )}

      {!otherTab && isShelf && !searching && tab === lists.comingTab && <ComingDlcStrip />}

      {!otherTab && (scope.gamesLoading || scope.roomsLoading) && items.length === 0 && (
        <div role="status" aria-label={t('common.loading')} style={st('padding:56px 12px;display:flex;flex-direction:column;align-items:center;gap:14px;font:500 14.5px var(--font-ui);color:var(--muted)')}>
          <Spinner size={32} />
          {t('common.loading')}
        </div>
      )}

      {!otherTab && !scope.gamesLoading && !scope.roomsLoading && items.length === 0 && (
        <div style={st('padding:36px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px')}>
          <span style={st('font:500 14.5px var(--font-ui);color:var(--muted);text-wrap:pretty')}>{emptyMsg}</span>
          {emptyAdd && (
            <Btn height={40} onClick={() => ui.openDialog('add', {})}>
              {t('home.empty.addGame')}
            </Btn>
          )}
        </div>
      )}

      {viewMode === 'list' ? (
        <div style={st(mobile ? 'display:flex;flex-direction:column;gap:2px;margin:0 -10px' : 'display:flex;flex-direction:column;margin:0 -12px')}>
          {visibleItems.map((it) => (
            <div key={it.game.id} style={st(dimStyle(dimmed(it.game.id)))} title={dimmed(it.game.id) ? t('home.search.visited') : undefined}>
              <Row
                item={it}
                showRank={showRank}
                bulk={bulk}
                selected={bulkSel.includes(it.game.id)}
                active={ui.selectedGameId === it.game.id}
                onOpen={() => open(it.game)}
                onVote={(v) => onVote(it.game, v)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={st(coverGridStyle)}>
          {visibleItems.map((it) => (
            <div key={it.game.id} style={st(`min-width:0;${dimStyle(dimmed(it.game.id))}`)} title={dimmed(it.game.id) ? t('home.search.visited') : undefined}>
              <CoverCard
                item={it}
                showRank={showRank}
                bulk={bulk}
                selected={bulkSel.includes(it.game.id)}
                active={ui.selectedGameId === it.game.id}
                big={!mobile || density !== 'small'}
                onOpen={() => open(it.game)}
                onVote={(v) => onVote(it.game, v)}
              />
            </div>
          ))}
        </div>
      )}

      {hasMore && <div ref={sentinelRef} aria-hidden style={st('height:1px')} />}

      {playNextItems.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:6px;margin-top:6px')}>
          <div style={st('display:flex;align-items:baseline;justify-content:space-between;padding-top:14px;border-top:1px solid var(--chip)')}>
            <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('home.playNext.heading', { n: playNextItems.length })}</span>
            <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>{t('home.playNext.sub')}</span>
          </div>
          {/* Same List/Covers choice as the main list above - the app-wide view setting. */}
          {viewMode === 'list' ? (
            <div style={st('display:flex;flex-direction:column;gap:2px;margin:0 -10px')}>
              {playNextItems.map((it) => (
                <PlayNextRow key={it.game.id} item={it} desktop={!mobile} onOpen={() => ui.selectGame(it.game.id)} onStart={() => startPlaying(it.game)} />
              ))}
            </div>
          ) : (
            <div style={st(coverGridStyle)}>
              {playNextItems.map((it) => (
                <CoverCard
                  key={it.game.id}
                  item={it}
                  showRank={false}
                  bulk={false}
                  selected={false}
                  active={ui.selectedGameId === it.game.id}
                  big={!mobile || density !== 'small'}
                  onOpen={() => ui.selectGame(it.game.id)}
                  onVote={(v) => onVote(it.game, v)}
                  onStart={() => startPlaying(it.game)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Footer version={version} />

      {bulk && (
        <BulkBar
          mobile={mobile}
          count={bulkSel.length}
          allSelected={allSelected}
          onAll={() => setBulkSel(allSelected ? [] : items.map((it) => it.game.id))}
          onDone={() => {
            setBulk(false);
            setBulkSel([]);
          }}
          onStatus={() => bulkSel.length && setBulkStatusOpen(true)}
          onRemove={bulkRemove}
        />
      )}
      {bulkStatusOpen && (
        <BulkStatusSheet
          count={bulkSel.length}
          onClose={() => setBulkStatusOpen(false)}
          onPick={async (status, label) => {
            const n = bulkSel.length;
            // Remember where each game was so Undo can put them all back (grouped by old status).
            const before = new Map<GameStatus, string[]>();
            for (const g of games) {
              if (bulkSel.includes(g.id) && g.status !== status) before.set(g.status, [...(before.get(g.status) ?? []), g.id]);
            }
            await ops.bulkUpdateStatus(bulkSel, status);
            setBulkSel([]);
            setBulkStatusOpen(false);
            ui.notify(
              t(n === 1 ? 'home.bulk.statusSet.one' : 'home.bulk.statusSet.other', { n, label }),
              {
                label: t('common.undo'),
                run: () => {
                  for (const [old, ids] of before) void ops.bulkUpdateStatus(ids, old);
                },
              },
              UNDO_MS,
            );
          }}
        />
      )}

      {mobile && !bulk && (
        <button
          type="button"
          onClick={() => ui.openDialog('add', {})}
          aria-label={t('home.fab.aria')}
          style={st('position:fixed;right:16px;bottom:20px;z-index:30;width:60px;height:60px;border-radius:50%;border:none;background:var(--acc);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 10px 28px var(--accA40)')}
        >
          <span style={st('font:500 24px/1 var(--font-ui)')}>+</span>
          <span style={st('font:700 10px var(--font-ui)')}>{t('common.add')}</span>
        </button>
      )}
    </>
  );

}
