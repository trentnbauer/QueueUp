import { useState } from 'react';
import type { Toast } from '../context/toastReducer';
import { useUi } from '../context/UiContext';
import { st } from './st';
import { t } from '../i18n';

const PILL =
  'display:flex;align-items:center;gap:12px;max-width:min(560px, calc(100vw - 32px));padding:12px 12px 12px 18px;border-radius:999px;background:var(--text);color:var(--onText);box-shadow:0 12px 32px oklch(0 0 0 / 0.35);font:600 14px var(--font-ui);animation:qu-pop .2s ease both';
/** A persistent toast: a card, since it carries a message and a row of actions. */
const CARD =
  'display:flex;flex-direction:column;gap:12px;width:min(420px, calc(100vw - 32px));padding:12px 14px 14px 18px;border-radius:20px;background:var(--text);color:var(--onText);box-shadow:0 12px 32px oklch(0 0 0 / 0.35);font:600 14px/1.4 var(--font-ui);animation:qu-pop .2s ease both';
const ACTION =
  'flex-shrink:0;height:32px;padding:0 14px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 13px var(--font-ui)';

/** A transient message from useUi().notify. It sits at the top of the screen, not the bottom: dialogs and
 * the match/merge screens keep their buttons at the bottom, which a bottom toast covered. A toast with no
 * button lets taps through to whatever is under it. */
export function UiToast() {
  const { toast, dismissToast } = useUi();
  // The live region stays mounted and only its content changes: a region that appears together with
  // its text is often not announced by screen readers. Errors are announced assertively.
  return (
    <div
      role={toast?.error ? 'alert' : 'status'}
      aria-live={toast?.error ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={st('position:fixed;left:0;right:0;top:calc(env(safe-area-inset-top, 0px) + 12px);z-index:300;display:flex;justify-content:center;pointer-events:none;padding:0 16px')}
    >
      {toast && <div key={toast.key} style={st(`${PILL};pointer-events:${toast.action ? 'auto' : 'none'}`)}>
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

  // The message on top, with its actions on one line underneath.
  return (
    <div role="status" style={st(`${CARD};pointer-events:auto`)}>
      <div style={st('display:flex;align-items:flex-start;gap:10px')}>
        {toast.onOpen ? (
          <button
            type="button"
            onClick={() => {
              toast.onOpen?.();
              dismiss();
            }}
            style={st('flex:1;min-width:0;padding:4px 0 0;border:none;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;text-wrap:pretty')}
          >
            {toast.message}
          </button>
        ) : (
          <span style={st('flex:1;min-width:0;padding-top:4px;text-wrap:pretty')}>{toast.message}</span>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('common.dismiss')}
          style={st('flex-shrink:0;width:30px;height:30px;margin:-2px -4px 0 0;border-radius:50%;border:none;background:transparent;color:inherit;font-size:18px;line-height:1;opacity:0.6')}
        >
          ×
        </button>
      </div>
      {toast.actions.length > 0 && (
        <div style={st('display:flex;flex-wrap:nowrap;gap:8px')}>
          {toast.actions.map((a) => (
            <button key={a.label} type="button" disabled={pendingLabel !== null} style={st(`${ACTION};white-space:nowrap;${pendingLabel !== null ? 'opacity:0.6' : ''}`)} onClick={() => run(a)}>
              {pendingLabel === a.label ? '…' : a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Persistent, actionable toasts (spin started, Playnite synced, ...). They stay until dismissed or acted on. */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={t('shell.nav.notifications')}
      style={st('position:fixed;left:0;right:0;bottom:96px;z-index:290;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 16px')}
    >
      {toasts.map((toast) => (
        <StackItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
