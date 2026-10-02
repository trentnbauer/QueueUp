import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Game, VoteValue } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useViewMode } from '../context/ViewModeContext';
import { useCardDensity } from '../context/CardDensityContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAttention } from '../hooks/useAttention';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { useVersion } from '../hooks/useVersion';
import { SHELF_TABS, SHELF_MORE_TABS, SHELF_IMPORT_TABS, ROOM_TABS } from '../lib/gameView';
import { PendingImportsList } from './PendingImportsList';
import { useQuery } from '@tanstack/react-query';
import { DISMISSED_IMPORTS_QUERY_KEY, PENDING_IMPORTS_QUERY_KEY, pendingImportsApi } from '../api/pendingImports';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import { Avatar, Banner, Btn } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { buildHomeLists, toRowItem } from './derive';
import { ComingStrip, CoverCard, DesktopRow, MobileRow, PlayNextRow } from './Rows';
import { Footer } from '../shell/Footer';
import { BulkBar, BulkStatusSheet } from './BulkBar';
import { useIncrementalList } from '../hooks/useIncrementalList';

const MAX_SHOWN_HINT = 5000;

const SHELF_ALL_TABS = [...SHELF_TABS, ...SHELF_MORE_TABS];

/** The Personal Shelf / room home: header, nudges, tabs + search, lists. One component for both
 * layouts - the row/header geometry branches on `mobile`. */
export function HomeView() {
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
  const navigate = useNavigate();

  // The shelf's primary tabs, plus the filters tucked behind the "+" button (Dropped, Won't play and
  // the two lists of synced titles that never became games).
  const tabs = isShelf ? SHELF_ALL_TABS : ROOM_TABS;
  const primaryTabs = isShelf ? SHELF_TABS : ROOM_TABS;
  const [tab, setTab] = useState('queue');
  const [moreOpen, setMoreOpen] = useState(false);
  const pendingList = useQuery({ queryKey: PENDING_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.list, enabled: isShelf });
  const dismissedList = useQuery({ queryKey: DISMISSED_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.listDismissed, enabled: isShelf && moreOpen });
  const importTab = tab === 'matching' || tab === 'dismissed' ? tab : null;
  const moreActive = tab === 'dropped' || tab === 'wont_play' || importTab !== null;
  const [query, setQuery] = useState('');
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
  const lists = useMemo(() => buildHomeLists(games, { isShelf, tabs, tab, query }), [games, isShelf, tabs, tab, query]);
  const showRank = tab === 'queue' && !searching;
  const ctx = { isShelf, tab, searching, all: games };
  const items = importTab ? [] : lists.list.map((g, i) => toRowItem(g, i + 1, ctx));
  const playNextItems = importTab ? [] : lists.playNext.map((g, i) => toRowItem(g, i + 1, ctx));
  const { visible: visibleItems, hasMore, sentinelRef } = useIncrementalList(items, `${scope.scopeId}|${tab}|${query}|${viewMode}`);

  const toVote = room ? attention.toVote(room.id) : 0;
  const toApprove = scope.canManage && !isShelf ? scope.suggestions.length : 0;

  const onVote = (g: Game, v: VoteValue) => (g.myVote === v ? ops.unvote(g.id) : ops.vote(g.id, v));
  const open = (g: Game) => {
    if (bulk) setBulkSel((prev) => (prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]));
    else ui.selectGame(g.id);
  };

  const meta = isShelf
    ? 'JUST YOU · EVERY PLATFORM'
    : [
        room?.platform ? ROOM_PLATFORM_LABELS[room.platform] : 'Any platform',
        `${members.length} members`,
        `${games.filter((g) => g.status === 'backlog').length} queued`,
      ]
        .join(' · ')
        .toUpperCase();

  const title = isShelf ? 'Personal Shelf' : (room?.name ?? '');
  const emptyAdd = !searching && tab === 'queue';
  const emptyMsg = searching
    ? `No games match "${query}".`
    : tab === 'queue'
      ? 'Nothing queued yet. Add the first game.'
      : tab === 'playing'
        ? 'Nothing being played right now.'
        : 'Nothing here yet.';

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
      title: `Remove ${n} game${n === 1 ? '' : 's'}?`,
      message: "This removes them from your Personal Shelf for good. It can't be undone.",
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await ops.bulkRemove(bulkSel);
    setBulkSel([]);
    ui.notify(`Removed ${n} games`);
  }

  const showNudge = !searching && (isShelf ? pendingImports > 0 : toVote > 0);
  const nudgeLabel = isShelf
    ? pendingImports === 1
      ? '1 synced game needs a match'
      : `${pendingImports} synced games need a match`
    : `${toVote} to vote on`;

  const Row = mobile ? MobileRow : DesktopRow;

  const nudges = (showNudge || (toApprove > 0 && !searching)) ? (
        <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
          {showNudge && (
            <button
              type="button"
              onClick={() => (isShelf ? ui.openDialog('needsReview') : ui.openDialog('deck'))}
              style={st('align-self:flex-start;display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:999px;border:none;background:var(--accSoft);color:var(--accText);font:600 13.5px var(--font-ui)')}
            >
              <span style={st('width:8px;height:8px;border-radius:50%;background:var(--acc)')} />
              {nudgeLabel}
              <span style={st('height:28px;padding:0 11px;border-radius:999px;background:var(--acc);color:var(--ink);display:flex;align-items:center;font-size:12px')}>
                {isShelf ? 'Match' : 'Vote now'}
              </span>
            </button>
          )}
          {toApprove > 0 && !searching && (
            <button
              type="button"
              onClick={() => ui.openDialog('roomSettings')}
              style={st('display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}
            >
              {toApprove} to approve
              <span style={st('height:28px;padding:0 11px;border-radius:999px;background:var(--chip);color:var(--accText);display:flex;align-items:center;font-size:12px')}>Review</span>
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
                Ranked
              </Btn>
              <Btn hover height={42} fontSize={14} onClick={() => ui.openDialog('add', {})}>
                + Add game
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
            Spin
          </Btn>
          <button
            type="button"
            onClick={() => ui.openDialog(isShelf ? 'shelfSettings' : 'roomSettings')}
            aria-label={isShelf ? 'Shelf settings' : 'Room settings'}
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
              Every game you own or want, kept in sync with your imported libraries
            </span>
          </div>
        ) : (
          <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:2px')}>
            <div style={{ display: 'flex', paddingLeft: 8 }}>
              {members.map((m) => (
                <button
                  key={m.user.id}
                  type="button"
                  onClick={() => navigate(`/u/${m.user.id}`)}
                  aria-label={`${m.user.displayName}'s profile`}
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
            <Btn height={32} padX={14} fontSize={13} weight={500} onClick={() => ui.openDialog('roomSettings')} style={{ color: 'var(--muted)' }}>
              Invite
            </Btn>
            {nudges}
          </div>
        )}
      </header>

      {scope.truncated && (
        <Banner kind="warn">
          Showing the {MAX_SHOWN_HINT} most recently added games. Older ones are hidden. Mark some Beaten or remove ones you no longer want to track.
        </Banner>
      )}

      {isShelf && nudges}

      <div style={st(mobile ? 'display:flex;flex-direction:column;gap:12px' : 'display:flex;flex-wrap:wrap;align-items:center;gap:12px')}>
        <div
          role="tablist"
          style={st(`${mobile ? '' : 'flex:1 1 380px;min-width:0;'}display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--surf);overflow-x:auto`)}
        >
          {primaryTabs.map((t) => {
            const on = tab === t.id && !searching;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(t.id);
                  setQuery('');
                }}
                style={st(
                  `flex:1 0 auto;display:flex;align-items:center;justify-content:center;gap:5px;height:36px;padding:0 12px;border-radius:999px;border:none;background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--muted)'};font:600 13.5px var(--font-ui)`,
                )}
              >
                {t.label}
                <span style={st('font:500 11px var(--font-mono);opacity:0.6')}>{lists.counts[t.id] ?? 0}</span>
              </button>
            );
          })}
          {isShelf && (
            <button
              type="button"
              aria-label="More filters"
              aria-expanded={moreOpen || moreActive}
              title="More filters"
              onClick={() => setMoreOpen((o) => !o)}
              style={st(
                `flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;border:none;background:${moreActive ? 'var(--text)' : 'transparent'};color:${moreActive ? 'var(--onText)' : 'var(--muted)'};font:500 20px/1 var(--font-ui);transform:${moreOpen || moreActive ? 'rotate(45deg)' : 'none'};transition:transform 0.15s`,
              )}
            >
              +
            </button>
          )}
        </div>
        <div style={st(mobile ? 'display:flex;gap:10px' : 'flex:1 1 320px;min-width:0;display:flex;gap:10px')}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${isShelf ? 'your shelf' : 'this room'}`}
            aria-label="Search games"
            style={st('flex:1;min-width:0;height:44px;padding:0 16px;border-radius:999px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none')}
          />
          {isShelf && !bulk && items.length > 0 && (
            <Btn height={44} padX={16} onClick={() => { setBulk(true); setBulkSel([]); ui.selectGame(null); }}>
              Select
            </Btn>
          )}
          {mobile && (tab === 'queue' || tab === 'playing') && (
            <Btn height={44} padX={16} onClick={() => ui.openDialog('ranked')}>
              Ranked
            </Btn>
          )}
        </div>
      </div>

      {isShelf && (moreOpen || moreActive) && (
        <div role="tablist" aria-label="More filters" style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {[
            ...SHELF_MORE_TABS.map((t) => ({ id: t.id, label: t.label, count: lists.counts[t.id] ?? 0 })),
            { id: 'matching', label: SHELF_IMPORT_TABS[0].label, count: pendingList.data?.pending.length ?? 0 },
            { id: 'dismissed', label: SHELF_IMPORT_TABS[1].label, count: dismissedList.data?.pending.length ?? null },
          ].map((t) => {
            const on = tab === t.id && !searching;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(t.id);
                  setQuery('');
                }}
                style={st(
                  `display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;border:1px solid ${on ? 'transparent' : 'var(--line)'};background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--text2)'};font:600 13px var(--font-ui)`,
                )}
              >
                {t.label}
                {t.count !== null && <span style={st('font:500 11px var(--font-mono);opacity:0.6')}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {importTab && <PendingImportsList kind={importTab} />}

      {!importTab && lists.coming.length > 0 && (
        <ComingStrip
          games={lists.coming}
          onOpen={(g) => ui.selectGame(g.id)}
          onToggleWatch={(g) => {
            ops.setReleaseAlert(g.id, !g.releaseAlert);
            ui.notify(g.releaseAlert ? 'Release alert off' : `We'll ping you when ${g.title} is out`);
          }}
        />
      )}

      {!importTab && scope.gamesLoading && items.length === 0 && (
        <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>Loading…</div>
      )}

      {!importTab && !scope.gamesLoading && items.length === 0 && (
        <div style={st('padding:36px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px')}>
          <span style={st('font:500 14.5px var(--font-ui);color:var(--muted);text-wrap:pretty')}>{emptyMsg}</span>
          {emptyAdd && (
            <Btn height={40} onClick={() => ui.openDialog('add', {})}>
              + Add a game
            </Btn>
          )}
        </div>
      )}

      {viewMode === 'list' ? (
        <div style={st(mobile ? 'display:flex;flex-direction:column;gap:2px;margin:0 -10px' : 'display:flex;flex-direction:column;margin:0 -12px')}>
          {visibleItems.map((it) => (
            <Row
              key={it.game.id}
              item={it}
              showRank={showRank}
              bulk={bulk}
              selected={bulkSel.includes(it.game.id)}
              active={ui.selectedGameId === it.game.id}
              onOpen={() => open(it.game)}
              onVote={(v) => onVote(it.game, v)}
            />
          ))}
        </div>
      ) : (
        <div
          style={st(
            mobile
              ? `display:grid;grid-template-columns:repeat(${density === 'small' ? 3 : 2},minmax(0,1fr));gap:18px 12px`
              : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px 12px',
          )}
        >
          {visibleItems.map((it) => (
            <CoverCard
              key={it.game.id}
              item={it}
              showRank={showRank}
              bulk={bulk}
              selected={bulkSel.includes(it.game.id)}
              active={ui.selectedGameId === it.game.id}
              big={!mobile || density !== 'small'}
              onOpen={() => open(it.game)}
              onVote={(v) => onVote(it.game, v)}
            />
          ))}
        </div>
      )}

      {hasMore && <div ref={sentinelRef} aria-hidden style={st('height:1px')} />}

      {playNextItems.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:6px;margin-top:6px')}>
          <div style={st('display:flex;align-items:baseline;justify-content:space-between;padding-top:14px;border-top:1px solid var(--chip)')}>
            <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>PLAY NEXT · {playNextItems.length}</span>
            <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>Up after what you're playing</span>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:2px;margin:0 -10px')}>
            {playNextItems.map((it) => (
              <PlayNextRow
                key={it.game.id}
                item={it}
                desktop={!mobile}
                onOpen={() => ui.selectGame(it.game.id)}
                onStart={() => {
                  ops.updateStatus(it.game.id, 'playing');
                  ui.notify(`${it.game.title} is now Playing`);
                }}
              />
            ))}
          </div>
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
            await ops.bulkUpdateStatus(bulkSel, status);
            setBulkSel([]);
            setBulkStatusOpen(false);
            ui.notify(`${n} games set to ${label}`);
          }}
        />
      )}

      {mobile && !bulk && (
        <button
          type="button"
          onClick={() => ui.openDialog('add', {})}
          aria-label="Add a game"
          style={st('position:fixed;right:16px;bottom:20px;z-index:30;width:60px;height:60px;border-radius:50%;border:none;background:var(--acc);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 10px 28px var(--accA40)')}
        >
          <span style={st('font:500 24px/1 var(--font-ui)')}>+</span>
          <span style={st('font:700 10px var(--font-ui)')}>Add</span>
        </button>
      )}
    </>
  );

}
