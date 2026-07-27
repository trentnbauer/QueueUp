import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IGDB_PLATFORM_NAMES, type GameStatus, type RoomRole } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGames } from '../hooks/useGames';
import { useGameFilter } from '../context/GameFilterContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { ALL_FILTER_VALUE, NEGLECTED_BACKLOG_MONTHS, distinctValues, distinctTagNames, isNeglectedBacklogGame } from './gameGridLogic';
import { roomsApi, gameSuggestionsApi } from '../api/rooms';
import { AvatarBadge } from './AvatarBadge';
import { RoomSettingsModal } from './RoomSettingsModal';
import { ShelfSettingsModal } from './ShelfSettingsModal';
import { AddGameModal } from './AddGameModal';
import { FilterModal } from './FilterModal';
import { PillFilter } from './PillFilter';
import { SpinPickerButton } from './SpinPickerButton';
import { RankedQueueModal } from './RankedQueueModal';
import { ImportLibraryModal } from './ImportLibraryModal';
import { SuggestionsModal } from './SuggestionsModal';
import styles from './Header.module.css';

const ROLE_LABEL: Record<RoomRole, string> = {
  room_master: 'Room Master',
  moderator: 'Moderator',
  member: 'Member',
};

// Fixed display order for the status filter pills (issue #182) - not alphabetical, reads in the
// same rough lifecycle order as the status menu itself.
const STATUS_FILTER_ORDER: GameStatus[] = ['wishlist', 'backlog', 'playing', 'done', 'replay', 'dropped'];

export function Header() {
  const { user, ownedPlatforms, steamLinked } = useAuth();
  const { activeRoom } = useView();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const {
    platformFilter,
    genreFilter,
    statusFilter,
    tagFilter,
    searchQuery,
    neglectedFilter,
    setPlatformFilter,
    setGenreFilter,
    setStatusFilter,
    setTagFilter,
    setSearchQuery,
    setNeglectedFilter,
  } = useGameFilter();

  const membersMenuRef = useRef<HTMLDetailsElement>(null);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showShelfSettings, setShowShelfSettings] = useState(false);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showRankedQueue, setShowRankedQueue] = useState(false);
  const [showImportLibrary, setShowImportLibrary] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  // Which member's row is expanded to show their completed/100%'d counts - at most one at a time,
  // toggled by clicking the row again (see memberRow below). Not persisted; closes on re-render of
  // a fresh menu open, same as any other transient UI-only state.
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  const membersQueryKey = ['room-members', activeRoom?.id];
  const { data: membersData } = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => roomsApi.members(activeRoom!.id),
    enabled: !!activeRoom,
  });
  const members = membersData?.members ?? [];
  const myRole = activeRoom?.myRole;
  const isElevated = myRole === 'room_master' || myRole === 'moderator';

  // Issue #362: only fetched for a Room Master/Moderator in a room that actually has
  // requireGameApproval on - a plain Member never sees the pending-suggestions queue, and there's
  // nothing to poll for on the Personal Shelf or in a room that doesn't gate adds.
  const suggestionsEnabled = Boolean(activeRoom && isElevated && activeRoom.requireGameApproval);
  const { data: suggestionsData } = useQuery({
    queryKey: ['room-suggestions', activeRoom?.id],
    queryFn: () => gameSuggestionsApi.list(activeRoom!.id),
    enabled: suggestionsEnabled,
    refetchInterval: suggestionsEnabled ? 30000 : false,
  });
  const pendingSuggestionCount = suggestionsData?.suggestions.length ?? 0;
  // Same derivation RoomView uses for GameGrid's identical props - RankedQueueModal's GameListRow
  // rows need them too (co-op warnings, "who hasn't voted"), undefined on the Personal Shelf where
  // there's no group to derive them from.
  const memberCount = activeRoom ? members.length : undefined;
  const roomMembers = activeRoom ? members.map((m) => m.user) : undefined;

  const { data: memberStats, isLoading: memberStatsLoading } = useQuery({
    queryKey: ['room-member-stats', activeRoom?.id, expandedMemberId],
    queryFn: () => roomsApi.memberStats(activeRoom!.id, expandedMemberId!),
    enabled: !!activeRoom && !!expandedMemberId,
  });

  // Reuses the same ['games', 'room'|'shelf', ...] query as the active view (RoomView/ShelfView) -
  // React Query dedupes by queryKey, so this doesn't trigger an extra network fetch.
  const {
    games,
    invalidate: invalidateGames,
    actionError,
    clearActionError,
    updateStatus,
    vote,
    remove,
    refreshPrice,
    isRefreshingPrice,
    setSteamMatch,
    setTargetPrice,
    setOwnership,
    applyTag,
    removeTag,
    setPrerequisite,
    shelfSyncPrompt,
    confirmShelfSync,
    dismissShelfSync,
    bulkUpdateStatus,
    isBulkUpdatingStatus,
  } = useGames(activeRoom?.id ?? null);

  // Mirrors RoomView's identical prompt (issue #360) - marking a room game Beaten from the Ranked
  // Queue modal uses this same useGames instance, not RoomView's, so without this the "sync your
  // shelf copy too?" confirm would silently never appear for that path.
  useEffect(() => {
    if (!shelfSyncPrompt) return;
    const { suggestion } = shelfSyncPrompt;
    confirm({
      title: 'Mark it Beaten on your shelf too?',
      message:
        suggestion.shelfGameId === null
          ? `"${suggestion.title}" isn't on your Personal Shelf yet - add it there, already marked Beaten?`
          : `"${suggestion.title}" is on your Personal Shelf too - mark it Beaten there as well?`,
      confirmLabel: 'Yes, sync it',
      cancelLabel: 'No thanks',
    }).then((ok) => (ok ? confirmShelfSync() : dismissShelfSync()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfSyncPrompt]);

  // Import Library button (issue #203, relocated into its own modal by issue #359) - only
  // meaningful on the Personal Shelf (Steam games always land there, never straight into a room).
  // Shared via SteamImportContext (not its own useSteamImport instance) so this button, the modal
  // it opens, and the Sidebar's notification bell all see the same in-flight state instead of
  // risking two concurrent imports.
  const steamImport = useSteamImportContext();

  // A Room already has one fixed platform, so every game in it matches - the platform filter is
  // only meaningful on the Personal Shelf, where games can span multiple systems. There, once the
  // user has ticked which systems they own, only show filter pills for those - a filter option for
  // a system they don't own (surfaced by e.g. a cross-platform title's IGDB platform list) isn't a
  // useful choice.
  const ownedPlatformLabels = useMemo(
    () => (ownedPlatforms.length > 0 ? new Set(ownedPlatforms.flatMap((p) => IGDB_PLATFORM_NAMES[p])) : null),
    [ownedPlatforms],
  );
  const platformOptions = useMemo(() => {
    if (activeRoom) return [];
    const all = distinctValues(games, (g) => g.platform);
    return ownedPlatformLabels ? all.filter((label) => ownedPlatformLabels.has(label)) : all;
  }, [games, activeRoom, ownedPlatformLabels]);
  const genreOptions = useMemo(() => distinctValues(games, (g) => g.genre), [games]);
  const statusOptions = useMemo(() => {
    const present = new Set(games.map((g) => g.status));
    return STATUS_FILTER_ORDER.filter((status) => present.has(status));
  }, [games]);
  // Drives the badge dot on the Filters button (issue #335) - the button collapses these three
  // into a modal, so there's no other on-screen sign that one of them is silently narrowing the grid.
  const quickFiltersActive = platformFilter !== ALL_FILTER_VALUE || genreFilter !== ALL_FILTER_VALUE || statusFilter !== ALL_FILTER_VALUE;
  // Only ever the viewer's own tags (see Game.tags) - a room game someone else added never
  // contributes an option here, matching who's actually allowed to apply/filter by a tag.
  const tagOptions = useMemo(() => distinctTagNames(games), [games]);

  // Only shown once at least one game actually qualifies - same "don't offer a filter with nothing
  // to filter" reasoning PillFilter already applies to platform/genre/status (issue #249).
  const neglectedCount = useMemo(() => games.filter((g) => isNeglectedBacklogGame(g)).length, [games]);

  function canPromote(memberRole: RoomRole): boolean {
    return myRole === 'room_master' && memberRole === 'member';
  }

  function canRemove(memberUserId: string, memberRole: RoomRole): boolean {
    if (memberRole === 'room_master') return false; // never removable, including by themselves
    if (memberUserId === user?.id) return true; // leave
    return myRole === 'room_master' || myRole === 'moderator';
  }

  async function handlePromote(targetUserId: string) {
    if (!activeRoom) return;
    await roomsApi.setRole(activeRoom.id, targetUserId, 'moderator');
    queryClient.invalidateQueries({ queryKey: membersQueryKey });
  }

  async function handleRemove(targetUserId: string, isSelf: boolean) {
    if (!activeRoom) return;
    const ok = await confirm({
      message: isSelf ? 'Leave this room?' : 'Remove this member from the room?',
      confirmLabel: isSelf ? 'Leave' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    await roomsApi.removeMember(activeRoom.id, targetUserId);
    queryClient.invalidateQueries({ queryKey: membersQueryKey });
    if (isSelf) {
      membersMenuRef.current?.removeAttribute('open');
      navigate('/');
    }
  }

  async function handleCopyInviteCode() {
    if (!activeRoom?.inviteCode) return;
    await navigator.clipboard.writeText(`${window.location.origin}/join/${activeRoom.inviteCode}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  if (!user) return null;

  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.left}>
          <div className={styles.title}>{activeRoom ? activeRoom.name : 'Personal Shelf'}</div>

          {activeRoom?.inviteCode && (
            <button
              type="button"
              className={styles.inviteBadge}
              onClick={handleCopyInviteCode}
              title="Click to copy a shareable invite link"
              aria-label="Copy room invite link"
            >
              {inviteCopied ? 'Copied!' : `Invite: ${activeRoom.inviteCode}`}
            </button>
          )}

          {activeRoom ? (
            <button
              type="button"
              className={styles.settingsButton}
              onClick={() => setShowRoomSettings(true)}
              title="Room info & settings"
              aria-label="Room info & settings"
            >
              ⚙
            </button>
          ) : (
            <button
              type="button"
              className={styles.settingsButton}
              onClick={() => setShowShelfSettings(true)}
              title="Personal Shelf settings"
              aria-label="Personal Shelf settings"
            >
              ⚙
            </button>
          )}
        </div>

        <div className={styles.right}>
          {activeRoom && members.length > 0 && (
            <details className={styles.menu} ref={membersMenuRef}>
              <summary className={styles.avatarStackButton}>
                <div className={styles.avatarStack}>
                  {members.map((m) => (
                    <AvatarBadge
                      key={m.user.id}
                      name={m.user.displayName}
                      color={m.user.avatarColor}
                      avatarUrl={m.user.avatarUrl}
                      size={32}
                    />
                  ))}
                </div>
              </summary>
              <div className={styles.menuPanel}>
                {members.map((m) => {
                  const isSelf = m.user.id === user.id;
                  const isExpanded = expandedMemberId === m.user.id;
                  return (
                    <div key={m.user.id} className={styles.memberRow}>
                      <div className={styles.memberRowTop}>
                        <button
                          type="button"
                          className={styles.memberInfoButton}
                          onClick={() => setExpandedMemberId(isExpanded ? null : m.user.id)}
                          aria-expanded={isExpanded}
                        >
                          <AvatarBadge name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={22} />
                          <div className={styles.memberInfo}>
                            <span className={styles.memberName}>
                              {m.user.displayName}
                              {isSelf ? ' (you)' : ''}
                            </span>
                            <span className={styles.memberRole}>{ROLE_LABEL[m.role]}</span>
                          </div>
                        </button>
                        {canPromote(m.role) && (
                          <button className={styles.memberAction} onClick={() => handlePromote(m.user.id)}>
                            Promote
                          </button>
                        )}
                        {canRemove(m.user.id, m.role) && (
                          <button className={styles.memberAction} onClick={() => handleRemove(m.user.id, isSelf)}>
                            {isSelf ? 'Leave' : 'Remove'}
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className={styles.memberStats}>
                          {memberStatsLoading ? (
                            'Loading…'
                          ) : (
                            <>
                              🏁 {memberStats?.completedCount ?? 0} completed · 💯 {memberStats?.fullyCompletedCount ?? 0} 100%'d
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className={styles.addGameButton} onClick={() => setShowAddGame(true)}>
          + Add Game
        </button>
        <SpinPickerButton
          games={games}
          spinOwnershipMaxPrice={activeRoom?.spinOwnershipMaxPrice}
          spinWheelTheme={activeRoom?.spinWheelTheme}
          onSetSteamMatch={setSteamMatch}
        />
        {/* Deterministic alternative to the wheel above (issue #360) - same eligible pool, browsable
            in priority order instead of left to chance. */}
        <button
          type="button"
          className={styles.rankedQueueButton}
          onClick={() => setShowRankedQueue(true)}
          title="Browse the backlog ranked by vote score"
        >
          📋 Ranked Queue
        </button>
        {/* Replaces the three permanent "Import Steam Library/Wishlist/Sync Completions" tiles
            that used to sit at the end of the shelf grid (issue #359) - same underlying actions
            (still shared via SteamImportContext so nothing here can race a concurrent import),
            just relocated into one on-demand modal instead of always-visible grid space. Also
            covers what used to be a separate "Re-sync Library" button - importing already skips
            anything already on the shelf, so there's no separate "first import" vs. "re-sync"
            action needed. */}
        {!activeRoom && (
          <button
            type="button"
            className={styles.importLibraryButton}
            onClick={() => setShowImportLibrary(true)}
            disabled={steamImport.busy}
            title={steamLinked ? 'Import or re-sync your Steam library, wishlist, or achievement completions' : 'Link your Steam account to import your library'}
          >
            {steamImport.busy ? 'Importing…' : '📥 Import Library'}
          </button>
        )}
        {/* Issue #362: only shown to a Room Master/Moderator in a room that requires approval for
            member-suggested games - the review queue for those pending suggestions. */}
        {suggestionsEnabled && (
          <button
            type="button"
            className={styles.suggestionsButton}
            onClick={() => setShowSuggestions(true)}
            title="Review games members have suggested for this room"
          >
            🗳️ Suggestions{pendingSuggestionCount > 0 ? ` (${pendingSuggestionCount})` : ''}
          </button>
        )}
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search games…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search games by title"
        />
        {(platformOptions.length > 1 || genreOptions.length > 1 || statusOptions.length > 1) && (
          <button
            type="button"
            className={styles.filtersButton}
            onClick={() => setShowFilters(true)}
            aria-haspopup="dialog"
          >
            Filters
            {quickFiltersActive && <span className={styles.filtersButtonBadge} aria-hidden="true" />}
          </button>
        )}
        <PillFilter
          label="Tags"
          allLabel="All tags"
          options={tagOptions}
          value={tagFilter}
          onChange={setTagFilter}
          // Issue #341: unlike Platform/Genre/Status, tags aren't exhaustive - a game can have
          // zero - so even a single distinct tag name still meaningfully splits the list, and
          // the default minOptions={2} was hiding this filter entirely for anyone with just one
          // tag defined (making it look like tags "don't have any use").
          minOptions={1}
        />
        {neglectedCount > 0 && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Neglected</span>
            <div className={styles.filterPills}>
              <button
                type="button"
                className={`${styles.filterPill} ${neglectedFilter ? styles.filterPillActive : ''}`}
                onClick={() => setNeglectedFilter(!neglectedFilter)}
                title={`Backlog games added ${NEGLECTED_BACKLOG_MONTHS}+ months ago with no vote or status change since`}
              >
                🕸 Collecting dust ({neglectedCount})
              </button>
            </div>
          </div>
        )}
      </div>

      {showRoomSettings && activeRoom && (
        <RoomSettingsModal
          room={activeRoom}
          members={members}
          games={games}
          onClose={() => setShowRoomSettings(false)}
        />
      )}

      {showShelfSettings && !activeRoom && (
        <ShelfSettingsModal games={games} onClose={() => setShowShelfSettings(false)} />
      )}

      {showAddGame && (
        <AddGameModal
          roomId={activeRoom?.id ?? null}
          onAdded={invalidateGames}
          onClose={() => setShowAddGame(false)}
        />
      )}

      {showFilters && (
        <FilterModal
          platformOptions={platformOptions}
          genreOptions={genreOptions}
          statusOptions={statusOptions}
          platformFilter={platformFilter}
          genreFilter={genreFilter}
          statusFilter={statusFilter}
          setPlatformFilter={setPlatformFilter}
          setGenreFilter={setGenreFilter}
          setStatusFilter={setStatusFilter}
          onClose={() => setShowFilters(false)}
        />
      )}

      {showRankedQueue && (
        <RankedQueueModal
          games={games}
          currentUserId={user.id}
          memberCount={memberCount}
          roomMembers={roomMembers}
          actionError={actionError}
          onDismissActionError={clearActionError}
          onStatusChange={updateStatus}
          onVote={vote}
          onRemove={remove}
          onRefreshPrice={refreshPrice}
          isRefreshingPrice={isRefreshingPrice}
          onSetSteamMatch={setSteamMatch}
          onSetTargetPrice={setTargetPrice}
          onSetOwnership={activeRoom ? setOwnership : undefined}
          onApplyTag={applyTag}
          onRemoveTag={removeTag}
          onSetPrerequisite={activeRoom ? setPrerequisite : undefined}
          onClose={() => setShowRankedQueue(false)}
        />
      )}

      {showImportLibrary && !activeRoom && (
        <ImportLibraryModal
          steamLinked={steamLinked}
          onApplyCompletions={(gameIds) => bulkUpdateStatus(gameIds, 'done')}
          applyingCompletions={isBulkUpdatingStatus}
          actionError={actionError}
          onDismissActionError={clearActionError}
          onClose={() => setShowImportLibrary(false)}
        />
      )}

      {showSuggestions && activeRoom && (
        <SuggestionsModal roomId={activeRoom.id} onClose={() => setShowSuggestions(false)} />
      )}
    </header>
  );
}
