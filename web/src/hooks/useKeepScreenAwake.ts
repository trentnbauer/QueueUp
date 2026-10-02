import { useEffect } from 'react';

/** Keeps the screen awake while mounted (Screen Wake Lock API), so a trailer or a scan isn't cut off by the
 * screen dimming. The browser drops the lock whenever the tab is hidden, so it's asked for again
 * when the tab comes back. Browsers without the API, or that refuse it (e.g. low battery), just
 * carry on without it. */
export function useKeepScreenAwake() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) void next.release().catch(() => undefined);
        else lock = next;
      } catch {
        /* not allowed right now - fine */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
