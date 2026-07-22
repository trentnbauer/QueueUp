import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every open modal (across every instance of this hook) in mount order, most-recent last - lets
 * nested modals (e.g. SteamMatchPicker opened from within GameDetailModal) figure out which one is
 * actually on top. Module-level and shared on purpose: each modal registers its own `keydown`
 * listener directly on `document`, and `stopPropagation()` does nothing to stop *other* listeners
 * already registered on that same node from also firing - only this shared stack lets a handler
 * tell whether it's the topmost modal before acting, instead of every open modal reacting to the
 * same Escape/Tab press at once. */
const openModalStack: symbol[] = [];

/** Shared modal accessibility behavior, applied consistently across every dialog in the app
 * (previously each modal only closed via a backdrop click or its own close button, with no
 * keyboard support and no focus management):
 * - Escape closes the dialog.
 * - Tab is trapped inside the dialog while it's open, so a keyboard user can't tab out into the
 *   page behind it.
 * - Focus moves into the dialog (its first focusable element, or the dialog itself) on open, and
 *   is restored to whatever was focused before the dialog opened once it closes.
 *
 * Attach the returned ref to the dialog element itself (the one with role="dialog"), not the
 * backdrop - and give that element `tabIndex={-1}` so it can still receive focus as a fallback
 * when the dialog has no focusable children yet (e.g. a modal that opens straight into a form). */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const idRef = useRef<symbol>();
  if (!idRef.current) idRef.current = Symbol('modal');

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const id = idRef.current!;
    openModalStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;

    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      // Only the topmost open modal reacts - see openModalStack's comment above.
      if (openModalStack[openModalStack.length - 1] !== id) return;

      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;

      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = openModalStack.indexOf(id);
      if (index !== -1) openModalStack.splice(index, 1);
      previouslyFocused?.focus();
    };
  }, []);

  return ref;
}
