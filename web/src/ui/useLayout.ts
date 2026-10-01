import { useSyncExternalStore } from 'react';

/** Below this width the phone layout is used; at or above it, the three-column desktop layout. */
export const MOBILE_MAX = 719;

function subscribe(query: string) {
  return (cb: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  };
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
