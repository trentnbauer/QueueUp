export interface ToastAction {
  label: string;
  /** May return a promise (e.g. a mutation) - ToastStack awaits it and only dismisses the toast
   * once it resolves, so a failed action (network blip, a conflicting concurrent change) leaves
   * the toast up instead of silently discarding it while telling the person nothing happened. A
   * plain `() => void` action (no network call to wait on) dismisses immediately, same as before. */
  onClick: () => void | Promise<unknown>;
}

export interface Toast {
  id: string;
  message: string;
  actions: ToastAction[];
  /** Called whenever this toast leaves the stack, whether via the dismiss (x) button or an action
   * button (issue #554) - the one place to record "the person has seen/handled this," regardless
   * of which path they took. Optional since not every toast needs a persisted seen-state - a
   * purely client-side/ephemeral toast has nothing to record. */
  onDismiss?: () => void;
}

/** Pure list operations behind ToastContext (issue #553), kept separate from the React state
 * wiring so they're testable without mounting a provider - same reasoning as this codebase's other
 * extracted-pure-logic-next-to-an-I/O-shaped-caller pieces (e.g. computePlaytimeIncreases). Adding
 * a toast whose id is already present is a no-op rather than a duplicate entry - callers (like
 * #554/#555) use a stable id derived from what triggered the toast (e.g. a game id) specifically
 * so a re-poll that finds the same still-unacted-on event doesn't stack a second copy. */
export function addToast(toasts: Toast[], toast: Toast): Toast[] {
  if (toasts.some((t) => t.id === toast.id)) return toasts;
  return [...toasts, toast];
}

export function removeToast(toasts: Toast[], id: string): Toast[] {
  return toasts.filter((t) => t.id !== id);
}
