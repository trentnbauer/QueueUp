import type { GameStatus } from '@queueup/shared';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/gameView';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';

/** Floating action bar while selecting games on the shelf (Set status / Remove). */
export function BulkBar({
  mobile,
  count,
  allSelected,
  onAll,
  onDone,
  onStatus,
  onRemove,
}: {
  mobile: boolean;
  count: number;
  allSelected: boolean;
  onAll: () => void;
  onDone: () => void;
  onStatus: () => void;
  onRemove: () => void;
}) {
  const pos = mobile
    ? 'position:fixed;left:12px;right:12px;bottom:16px'
    : 'position:fixed;left:50%;transform:translateX(-50%);width:min(560px, calc(100% - 48px));bottom:24px';
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      style={st(
        `${pos};z-index:31;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:24px;background:var(--sheet);border:1px solid var(--line);box-shadow:0 12px 32px oklch(0 0 0 / 0.4)`,
      )}
    >
      <div style={st('display:flex;align-items:center;gap:8px')}>
        <span style={st('flex:1;font:700 15px var(--font-ui)')}>{count ? `${count} selected` : mobile ? 'Tap games to select' : 'Click games to select'}</span>
        <button type="button" onClick={onAll} style={st('height:32px;padding:0 10px;border:none;background:none;color:var(--muted);font:600 13px var(--font-ui)')}>
          {allSelected ? 'Clear' : 'Select all'}
        </button>
        <button type="button" onClick={onDone} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 13px var(--font-ui)')}>
          Done
        </button>
      </div>
      <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
        <button type="button" onClick={onStatus} style={st(`height:46px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 14px var(--font-ui);opacity:${count ? 1 : 0.4}`)}>
          Set status
        </button>
        <button type="button" onClick={onRemove} style={st(`height:46px;border-radius:999px;border:none;background:oklch(0.62 0.19 25 / 0.16);color:var(--danger);font:700 14px var(--font-ui);opacity:${count ? 1 : 0.4}`)}>
          Remove
        </button>
      </div>
    </div>
  );
}

export function BulkStatusSheet({
  count,
  onClose,
  onPick,
}: {
  count: number;
  onClose: () => void;
  onPick: (status: GameStatus, label: string) => void;
}) {
  return (
    <Dialog onClose={onClose} title={`Set status for ${count} games`} gap={14}>
      <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
        {STATUS_ORDER.map((key) => [key, STATUS_LABEL[key]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key, label)}
            style={st('height:48px;border-radius:14px;border:none;background:var(--surf);color:var(--text);font:600 14px var(--font-ui)')}
          >
            {label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
