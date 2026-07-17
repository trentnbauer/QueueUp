import { VOTE_SCALE, type VoteValue } from '@squadqueue/shared';

const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

interface VoteRowProps {
  myVote: VoteValue | null;
  onVote: (value: VoteValue) => void;
}

export function VoteRow({ myVote, onVote }: VoteRowProps) {
  return (
    <div>
      <div
        style={{
          font: '600 10px system-ui, sans-serif',
          letterSpacing: '.05em',
          color: 'var(--sq-muted)',
          marginBottom: 7,
          textTransform: 'uppercase',
        }}
      >
        Your want-to-play
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {SCALE_VALUES.map((value) => {
          const active = value === myVote;
          return (
            <button
              key={value}
              onClick={() => onVote(value)}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                background: active ? 'var(--sq-accent-pill-bg)' : 'var(--sq-neutral-pill-bg)',
                border: active ? '2px solid var(--sq-accent)' : '2px solid transparent',
              }}
            >
              {VOTE_SCALE[value]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
