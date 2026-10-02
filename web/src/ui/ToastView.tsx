import { useState } from 'react';
import type { Toast } from '../context/toastReducer';
import { useUi } from '../context/UiContext';
import { st } from './st';

const PILL =
  'display:flex;align-items:center;gap:12px;max-width:min(560px, calc(100vw - 32px));padding:12px 12px 12px 18px;border-radius:999px;background:var(--text);color:var(--onText);box-shadow:0 12px 32px oklch(0 0 0 / 0.35);font:600 14px var(--font-ui);animation:qu-pop .2s ease both';
const ACTION =
  'flex-shrink:0;height:32px;padding:0 14px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 13px var(--font-ui)';

/** The design's bottom-centre toast: a transient message from useUi().notify. */
export function UiToast() {
  const { toast, dismissToast } = useUi();
  // The live region stays mounted and only its content changes: a region that appears together with
  // its text is often not announced by screen readers. Errors are announced assertively.
  return (
    <div
      role={toast?.error ? 'alert' : 'status'}
      aria-live={toast?.error ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={st('position:fixed;left:0;right:0;bottom:24px;z-index:300;display:flex;justify-content:center;pointer-events:none;padding:0 16px')}
    >
      {toast && <div key={toast.key} style={st(`${PILL};pointer-events:auto`)}>
        <span style={{ minWidth: 0, textWrap: 'pretty' }}>{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            style={st(ACTION)}
            onClick={() => {
              toast.action?.run();
              dismissToast();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>}
    </div>
  );
}

function StackItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function dismiss() {
    toast.onDismiss?.();
    onDismiss(toast.id);
  }

  async function run(action: Toast['actions'][number]) {
    setPendingLabel(action.label);
    try {
      await action.onClick();
      dismiss();
    } catch {
      // A failed action leaves the toast up (button re-enabled) so it can be retried.
      setPendingLabel(null);
    }
  }

  return (
    <div role="status" style={st(`${PILL};pointer-events:auto;border-radius:22px`)}>
      {toast.onOpen ? (
        <button
          type="button"
          onClick={() => {
            toast.onOpen?.();
            dismiss();
          }}
          style={st('flex:1;min-width:0;padding:0;border:none;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;text-wrap:pretty')}
        >
          {toast.message}
        </button>
      ) : (
        <span style={{ flex: 1, minWidth: 0, textWrap: 'pretty' }}>{toast.message}</span>
      )}
      {toast.actions.map((a) => (
        <button key={a.label} type="button" disabled={pendingLabel !== null} style={st(`${ACTION};${pendingLabel !== null ? 'opacity:0.6' : ''}`)} onClick={() => run(a)}>
          {pendingLabel === a.label ? '…' : a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={st('flex-shrink:0;width:30px;height:30px;border-radius:50%;border:none;background:transparent;color:inherit;font-size:18px;line-height:1;opacity:0.6')}
      >
        ×
      </button>
    </div>
  );
}

/** Persistent, actionable toasts (spin started, Playnite synced, ...). They stay until dismissed or acted on. */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      style={st('position:fixed;left:0;right:0;bottom:96px;z-index:290;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 16px')}
    >
      {toasts.map((t) => (
        <StackItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
