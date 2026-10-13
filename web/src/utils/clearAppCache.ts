/** Wipes everything this browser has kept for the app, so the next load fetches the latest version fresh: the browser's Cache Storage
 * (and any service worker that fills it) and the session storage. Returns how many caches were removed. Never signs anyone out or
 * touches saved preferences (language, theme and so on) or anything on the server. The caller clears the in-memory query cache and reloads. */
export async function clearAppCache(): Promise<number> {
  let removed = 0;
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    /* no service worker support: nothing to remove */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      const results = await Promise.all(keys.map((k) => caches.delete(k)));
      removed = results.filter(Boolean).length;
    }
  } catch {
    /* Cache Storage blocked: the reload below still revalidates the page */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* storage blocked */
  }
  return removed;
}
