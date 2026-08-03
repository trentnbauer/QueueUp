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

  // Both persist across React 18 StrictMode's dev-only mount -> cleanup -> remount cycle (only
  // effects re-run, not the component instance, so refs survive) - see the pushState/cleanup
  // comment below for how they're used to make that cycle a no-op instead of a spurious close
  // (issue #494).
  const historyKeyRef = useRef<string | null>(null);
  const mountTokenRef = useRef(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const id = idRef.current!;
    const myMountToken = ++mountTokenRef.current;
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
    //
    // Reuses a still-pending entry from `historyKeyRef` instead of always pushing a fresh one -
    // StrictMode's remount (below) leaves its predecessor's entry sitting there un-consumed (see
    // the deferred history.back() in cleanup), so pushing again here would leave a second,
    // harmless-but-confusing entry stacked on top of it once that back() is correctly skipped.
    let closedViaPopState = false;
    let modalStateKey = historyKeyRef.current;
    if (modalStateKey === null) {
      modalStateKey = `modal-${++modalStateKeyCounter}`;
      historyKeyRef.current = modalStateKey;
      history.pushState({ ...history.state, queueupModal: modalStateKey }, '');
    }

    function handlePopState() {
      // Same "only the topmost modal reacts" rule as Escape below - if this isn't topmost, the
      // entry Back just popped belongs to a nested modal opened on top of this one, not this one.
      if (openModalStack[openModalStack.length - 1] !== id) return;
      closedViaPopState = true;
      historyKeyRef.current = null;
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
      if (closedViaPopState) return;
      // Deferred, not called directly here (issue #494): React 18 StrictMode (dev only) mounts
      // this effect, cleans it up, then mounts it again - synchronously, all in the same tick,
      // before this microtask gets a chance to run. `history.back()`'s own popstate lands
      // asynchronously later still (a macrotask), so calling it straight from this "throwaway"
      // cleanup used to fire a real navigation whose delayed popstate would then hit the
      // *second* mount's listener and get misread as a genuine Back-button dismissal, closing
      // the modal the user just (re)opened. Checking mountTokenRef here - after the remount, if
      // any, has already had a chance to bump it - tells the two cases apart: if it moved on,
      // this cleanup was the StrictMode throwaway, so skip navigating entirely and leave the
      // still-`historyKeyRef`-tracked entry for the *next* (real) cleanup to consume instead.
      queueMicrotask(() => {
        if (mountTokenRef.current !== myMountToken) return;
        // Re-checked here rather than once, synchronously, above: only pop if our entry is *still*
        // the current one at the moment we're actually about to act - a modal that navigates
        // before closing (e.g. AddRoomModal into the room it just created) pushes its *own* entry
        // on top of ours, and since that can happen in the gap between this cleanup running and
        // this microtask firing (not just before cleanup starts), checking only once up front
        // could still pop a navigation the user just asked for. Popping then would undo it.
        if (history.state?.queueupModal !== modalStateKey) return;
        historyKeyRef.current = null;
        history.back();
      });
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
