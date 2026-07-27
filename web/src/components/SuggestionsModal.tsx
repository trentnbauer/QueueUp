import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameSuggestion } from '@queueup/shared';
import { gameSuggestionsApi } from '../api/rooms';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { GAME_STATUS_LABEL } from './gameGridLogic';
import styles from './SuggestionsModal.module.css';

interface SuggestionsModalProps {
  roomId: string;
  onClose: () => void;
}

/** Room Master/Moderator review queue for pending game suggestions (issue #362) - only reachable
 * when the room has requireGameApproval on and there's at least one suggestion waiting (see the
 * button that opens this in Header.tsx). Approving re-runs full intake server-side (Steam app id
 * resolution, gg.deals pricing) - deliberately deferred until now rather than done at suggest
 * time, so a declined suggestion never paid for that. */
export function SuggestionsModal({ roomId, onClose }: SuggestionsModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const queryKey = ['room-suggestions', roomId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => gameSuggestionsApi.list(roomId),
  });
  const suggestions = data?.suggestions ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['games', 'room', roomId] });
  }

  const approve = useMutation({
    mutationFn: (suggestionId: string) => gameSuggestionsApi.approve(roomId, suggestionId),
    onMutate: (suggestionId) => setActingOnId(suggestionId),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not approve that suggestion'),
    onSettled: () => setActingOnId(null),
  });

  const decline = useMutation({
    mutationFn: (suggestionId: string) => gameSuggestionsApi.decline(roomId, suggestionId),
    onMutate: (suggestionId) => setActingOnId(suggestionId),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not decline that suggestion'),
    onSettled: () => setActingOnId(null),
  });

  const busy = actingOnId !== null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Game suggestions"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>🗳️ Suggestions</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {isLoading ? (
          <div className={styles.empty}>Loading…</div>
        ) : suggestions.length === 0 ? (
          <div className={styles.empty}>Nothing pending - suggested games will show up here.</div>
        ) : (
          <div className={styles.list}>
            {suggestions.map((s: GameSuggestion) => (
              <div key={s.id} className={styles.row}>
                <div
                  className={styles.thumb}
                  style={s.coverImageUrl ? { backgroundImage: `url(${s.coverImageUrl})` } : undefined}
                >
                  {!s.coverImageUrl && <span className={styles.thumbFallback}>{(Array.from(s.title)[0] ?? '').toUpperCase()}</span>}
                </div>
                <div className={styles.meta}>
                  <span className={styles.gameTitle}>
                    {s.title}
                    {s.releaseYear ? ` (${s.releaseYear})` : ''}
                  </span>
                  <span className={styles.suggestedBy}>Suggested by {s.suggestedBy.displayName}</span>
                  {/* Only shown when the suggester made an explicit Wishlist/Backlog/Playing
                      quick-add choice - a moderator approving this should know where it's about to
                      land, not just that it's landing "somewhere" (see requestedStatus). */}
                  {s.requestedStatus && (
                    <span className={styles.suggestedBy}>Requested as: {GAME_STATUS_LABEL[s.requestedStatus]}</span>
                  )}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.approveButton}
                    onClick={() => approve.mutate(s.id)}
                    disabled={busy}
                  >
                    {actingOnId === s.id && approve.isPending ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className={styles.declineButton}
                    onClick={() => decline.mutate(s.id)}
                    disabled={busy}
                  >
                    {actingOnId === s.id && decline.isPending ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
