import type { GameStatus } from '@squadqueue/shared';

const STATUS_LABEL: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  done: 'Done',
};

const STATUS_STYLE: Record<GameStatus, { bg: string; fg: string }> = {
  backlog: { bg: 'var(--sq-neutral-pill-bg)', fg: 'var(--sq-muted)' },
  playing: { bg: 'var(--sq-accent-pill-bg)', fg: 'var(--sq-accent)' },
  done: { bg: 'var(--sq-accent2-pill-bg)', fg: 'var(--sq-accent2)' },
};

const NEXT_STATUS: Record<GameStatus, GameStatus> = {
  backlog: 'playing',
  playing: 'done',
  done: 'backlog',
};

interface StatusBadgeProps {
  status: GameStatus;
  onClick?: (next: GameStatus) => void;
}

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const style = STATUS_STYLE[status];
  return (
    <button
      onClick={onClick ? () => onClick(NEXT_STATUS[status]) : undefined}
      title={onClick ? `Click to change status (currently ${STATUS_LABEL[status]})` : undefined}
      aria-label={onClick ? `Status: ${STATUS_LABEL[status]}. Click to change to ${STATUS_LABEL[NEXT_STATUS[status]]}.` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 9px 4px 11px',
        borderRadius: 999,
        background: style.bg,
        color: style.fg,
        fontWeight: 700,
        fontSize: 10.5,
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {STATUS_LABEL[status]}
      {/* Small caret hints this is interactive/cyclable, not just a static label - the only
          previous affordance was a title tooltip, invisible on touch and easy to miss on desktop. */}
      {onClick && (
        <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.7 }}>
          ▾
        </span>
      )}
    </button>
  );
}
