import { useState } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import stripStyles from './PlayingStrip.module.css';
import styles from './DroppedStrip.module.css';

interface DroppedStripProps {
  games: Game[];
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetSteamMatch: (gameId: string, steamAppId: number | null) => void;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  onSetManualPrice: (gameId: string, manualPrice: string | null) => void;
  onSetOwnership?: (gameId: string, owned: boolean) => void;
  onApplyTag: (gameId: string, name: string) => Promise<void>;
  onRemoveTag: (gameId: string, tagId: string) => void;
  onSetPrerequisite?: (gameId: string, prerequisiteGameId: string | null) => void;
}

/** Mirrors BeatenStrip, but for games marked Dropped, sits below it, and starts collapsed - a
 * "we bounced off this" pile is the least useful thing to look at by default, but still worth
 * keeping visible-on-demand rather than only reachable via the status filter pill. Collapse state
 * is local/ephemeral (not persisted) - resets to collapsed on next visit, which is the point. */
export function DroppedStrip({
  games,
  currentUserId,
  memberCount,
  roomMembers,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
  onSetSteamMatch,
  onSetTargetPrice,
  onSetManualPrice,
  onSetOwnership,
  onApplyTag,
  onRemoveTag,
  onSetPrerequisite,
}: DroppedStripProps) {
  const [expanded, setExpanded] = useState(false);

  // Most recently dropped first, same ordering reasoning as BeatenStrip's most-recently-beaten.
  const dropped = games
    .filter((g) => g.status === 'dropped')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (dropped.length === 0) return null;

  return (
    <div className={stripStyles.strip}>
      <button type="button" className={styles.toggle} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className={stripStyles.label}>
          Dropped ({dropped.length})
        </span>
      </button>
      {expanded && (
        <div className={stripStyles.row}>
          {dropped.map((game) => (
            <div key={game.id} className={stripStyles.item}>
              <GameCard
                game={game}
                currentUserId={currentUserId}
                memberCount={memberCount}
                roomMembers={roomMembers}
                onStatusChange={(next) => onStatusChange(game.id, next)}
                onVote={(value) => onVote(game.id, value)}
                onRemove={() => onRemove(game.id)}
                onRefreshPrice={() => onRefreshPrice(game.id)}
                isRefreshingPrice={isRefreshingPrice ? isRefreshingPrice(game.id) : false}
                onSetSteamMatch={(steamAppId) => onSetSteamMatch(game.id, steamAppId)}
                onSetTargetPrice={(targetPrice) => onSetTargetPrice(game.id, targetPrice)}
                onSetManualPrice={(manualPrice) => onSetManualPrice(game.id, manualPrice)}
                onSetOwnership={onSetOwnership ? (owned) => onSetOwnership(game.id, owned) : undefined}
                onApplyTag={(name) => onApplyTag(game.id, name)}
                onRemoveTag={(tagId) => onRemoveTag(game.id, tagId)}
                roomGames={games}
                onSetPrerequisite={onSetPrerequisite ? (prerequisiteGameId) => onSetPrerequisite(game.id, prerequisiteGameId) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
