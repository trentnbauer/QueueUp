import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ToastStack } from '../components/ToastStack';
import { addToast, removeToast, type Toast, type ToastAction } from './toastReducer';

export type { Toast, ToastAction };

interface ToastContextValue {
  toasts: Toast[];
  /** `id` should be stable and derived from whatever triggered the toast (e.g. a game id, a spin
   * session id) - see addToast's doc comment for why a repeat call with the same id is a no-op
   * rather than a duplicate. */
  showToast: (toast: Toast) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Bottom-right stack of dismissible, actionable popups (issue #553) - foundation for #554 ("mark
 * as Playing") and #555 ("a spin just started"), and anything later that needs to interrupt
 * someone who isn't currently looking at the notification bell. Same "announce from anywhere via a
 * hook, mounted once near the app root" shape as AchievementUnlockContext, but a stack (every
 * toast stays visible until dismissed or acted on) rather than a one-at-a-time queue - these need
 * an actual decision, not just a celebratory beat, so piling up unseen behind each other would
 * bury real asks instead of just delaying a flourish. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Toast) => {
    setToasts((prev) => addToast(prev, toast));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => removeToast(prev, id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
