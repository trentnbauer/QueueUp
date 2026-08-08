import { useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type Game, type RoomPlatform } from '@queueup/shared';
import { authApi } from '../api/auth';
import { gamesApi } from '../api/games';
import { useAuth } from '../context/AuthContext';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { exportGames } from '../utils/exportGames';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './ShelfSettingsModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

interface ShelfSettingsModalProps {
  games: Game[];
  onClose: () => void;
}

/** The Personal Shelf's counterpart to RoomSettingsModal - same gear-icon-in-the-header entry
 * point and dialog shape, scaled down to what actually applies to a shelf (no members/invites/
 * platform to set, since the shelf isn't scoped to one system the way a room is). Owned platforms
 * is also editable on the Profile Settings page (issue: originally the only place) - kept there
 * too rather than moved, since it's a genuinely per-account setting; this is just a closer-at-hand
 * shortcut for the one shelf-shaping setting that exists, matching how Room Settings puts a room's
 * own defining fields one click away instead of on a separate page. */
export function ShelfSettingsModal({ games, onClose }: ShelfSettingsModalProps) {
  const { ownedPlatforms, refetch } = useAuth();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const [selected, setSelected] = useState<Set<RoomPlatform>>(new Set(ownedPlatforms));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  const dirty = selected.size !== ownedPlatforms.length || ownedPlatforms.some((p) => !selected.has(p));

  // Issue #580 - fetched lazily behind "Show activity", same collapsed-by-default pattern as
  // RoomSettingsModal's room activity feed: not something this modal needs ready on every open.
  const activity = useInfiniteQuery({
    queryKey: ['shelf-activity'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => gamesApi.activity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    enabled: showActivity,
  });
  const activityEntries = activity.data?.pages.flatMap((page) => page.entries) ?? [];

  function toggle(platform: RoomPlatform) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await authApi.updateOwnedPlatforms(Array.from(selected));
      await refetch();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your systems owned');
    } finally {
      setSaving(false);
    }
  }

  function handleExport(format: 'csv' | 'json') {
    exportGames(games, format, 'personal-shelf');
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Personal Shelf settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Personal Shelf Settings</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Systems owned</div>
          <p className={styles.readonlyNote}>
            Tick the systems you own to limit the add-game search to games available on them. Leave
            everything unticked to see all platforms.
          </p>
          <div className={styles.checkboxList}>
            {ROOM_PLATFORM_OPTIONS.map((platform) => (
              <label key={platform} className={styles.checkboxField}>
                <input type="checkbox" checked={selected.has(platform)} onChange={() => toggle(platform)} />
                {ROOM_PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
          <div className={styles.saveRow}>
            <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && !dirty && <span className={styles.savedHint}>Saved</span>}
          </div>
        </div>

        {games.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Export</div>
            <div className={styles.exportRow}>
              <button type="button" className={styles.memberAction} onClick={() => handleExport('csv')}>
                Export as CSV
              </button>
              <button type="button" className={styles.memberAction} onClick={() => handleExport('json')}>
                Export as JSON
              </button>
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Activity</div>
          {!showActivity ? (
            <button type="button" className={styles.memberAction} onClick={() => setShowActivity(true)}>
              Show shelf activity
            </button>
          ) : (
            <>
              {activity.isLoading ? (
                <p className={styles.readonlyNote}>Loading…</p>
              ) : activityEntries.length === 0 ? (
                <p className={styles.readonlyNote}>Nothing's happened on your shelf yet.</p>
              ) : (
                <div className={styles.activityList}>
                  {activityEntries.map((entry) => (
                    <div key={entry.id} className={styles.activityRow}>
                      <span className={styles.activityMessage}>{entry.message}</span>
                      <span className={styles.activityTime}>{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              {activity.hasNextPage && (
                <div className={styles.loadMoreRow}>
                  <button
                    type="button"
                    className={styles.memberAction}
                    onClick={() => activity.fetchNextPage()}
                    disabled={activity.isFetchingNextPage}
                  >
                    {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className={styles.readonlyNote}>
          Currency, card size, linked sign-in accounts, and your account itself are managed on the{' '}
          <Link to="/profile" onClick={onClose}>
            Profile Settings
          </Link>{' '}
          page.
        </p>
      </div>
    </div>
  );
}
