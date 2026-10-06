import { useSyncExternalStore } from 'react';

/** Below this width the phone layout is used; at or above it, the three-column desktop layout. */
export const MOBILE_MAX = 719;

// One subscribe function per query, so useSyncExternalStore doesn't unsubscribe and resubscribe
// the media listener on every render (it does whenever the function's identity changes).
const subscribers = new Map<string, (cb: () => void) => () => void>();

function subscribe(query: string) {
  let fn = subscribers.get(query);
  if (!fn) {
    fn = (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    };
    subscribers.set(query, fn);
  }
  return fn;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on phones - picks the mobile shell, bottom sheets and tap-first list rows. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}

/** How many pixels of the layout viewport the on-screen keyboard covers (0 when it is closed, or the
 * browser already resizes the page for it). Lets a bottom sheet sit above the keyboard instead of
 * behind it - iOS Safari and older Android browsers cover the page rather than resize it. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(
    (cb) => {
      const vv = window.visualViewport;
      if (!vv) return () => {};
      vv.addEventListener('resize', cb);
      vv.addEventListener('scroll', cb);
      return () => {
        vv.removeEventListener('resize', cb);
        vv.removeEventListener('scroll', cb);
      };
    },
    () => {
      const vv = window.visualViewport;
      if (!vv) return 0;
      const covered = Math.round(window.innerHeight - (vv.height + vv.offsetTop));
      // Small differences are browser chrome sliding in and out, not a keyboard.
      return covered > 80 ? covered : 0;
    },
    () => 0,
  );
}
