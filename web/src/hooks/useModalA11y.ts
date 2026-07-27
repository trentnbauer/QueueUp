import { useEffect, useRef, type MouseEvent } from 'react';

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

// A plain incrementing counter, not the openModalStack Symbol above - a Symbol's .toString() only
// reflects its *description* ("Symbol(modal)"), identical for every instance, so it can't be used
// to tell "is my history entry still the current one" apart from another modal's. This just needs
// to be unique per open modal within one page session.
let modalStateKeyCounter = 0;

/** Shared modal accessibility behavior, applied consistently across every dialog in the app
 * (previously each modal only closed via a backdrop click or its own close button, with no
 * keyboard support and no focus management):
 * - Escape closes the dialog.
 * - The browser/mobile Back gesture closes the dialog instead of navigating away from QueueUp
 *   entirely (previously it did the latter - Back had no idea a modal was "in front" of the page).
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

    // Back-closes-the-modal support: pushing a throwaway history entry on open means the *first*
    // Back press only pops this entry (intercepted below as a popstate event) instead of leaving
    // QueueUp entirely - without it, Back has no idea a modal is "in front" of the current page at
    // all. `closedViaPopState` distinguishes the two ways this effect's cleanup can run: if Back
    // itself triggered the close, the entry is already gone and popping again in cleanup would
    // incorrectly send the browser back a *second* step; if the modal closed some other way
    // (Escape, backdrop click, its own close button, an action that closes it), the pushed entry
    // is still sitting there unused and needs to be consumed (history.back()) so it doesn't linger
    // as a dead, do-nothing step the next time the user presses Back for an unrelated reason.
    //
    // Spreads the *existing* history.state rather than replacing it outright - react-router (which
    // this app uses for room/shelf routing) stores its own bookkeeping there (an `idx` it uses to
    // compute navigation deltas on every popstate); overwriting that wholesale would desync the
    // router's own back/forward math the next time it navigates, in a way tsc/tests/build can't
    // catch since it only shows up as broken browser navigation.
    let closedViaPopState = false;
    const modalStateKey = `modal-${++modalStateKeyCounter}`;
    history.pushState({ ...history.state, queueupModal: modalStateKey }, '');

    function handlePopState() {
      // Same "only the topmost modal reacts" rule as Escape below - if this isn't topmost, the
      // entry Back just popped belongs to a nested modal opened on top of this one, not this one.
      if (openModalStack[openModalStack.length - 1] !== id) return;
      closedViaPopState = true;
      onCloseRef.current();
    }

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
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      const index = openModalStack.indexOf(id);
      if (index !== -1) openModalStack.splice(index, 1);
      previouslyFocused?.focus();
      // Only pop if our entry is still the current one - a modal that navigates before closing
      // (e.g. AddRoomModal into the room it just created) pushes its *own* entry on top of ours
      // first, so by the time this cleanup runs, history.state is that navigation's, not ours.
      // Popping then would undo the navigation the user just asked for, not clean up after us.
      if (!closedViaPopState && history.state?.queueupModal === modalStateKey) history.back();
    };
  }, []);

  return ref;
}

/** Backdrop close handler for every modal (issue #342) - attach as `onMouseDown` on the backdrop
 * element, not `onClick`. A native `click` event fires based on wherever `mouseup` lands, so a
 * plain `onClick={onClose}` on the backdrop closes the modal even when the drag *started* inside
 * the dialog (e.g. selecting text and dragging past its edge before releasing). Keying off
 * `mousedown` instead, and requiring the event's target to be the backdrop itself rather than a
 * bubbled-up child, means only a press that begins outside the dialog closes it. */
export function closeOnBackdropMouseDown(onClose: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
}
