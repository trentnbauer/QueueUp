import { getBasePath } from './basePath';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Path segments that identify a person, room or secret (invite and friend codes, the email
 * confirmation token). They're replaced before a page view leaves the browser, so Google only ever
 * sees "/room/:id", never which room - and never a code someone could use to join it. */
const REDACTED: [RegExp, string][] = [
  [/^\/room\/[^/]+/, '/room/:id'],
  [/^\/u\/[^/]+/, '/u/:id'],
  [/^\/friends\/[^/]+/, '/friends/:id'],
  [/^\/join\/[^/]+/, '/join/:code'],
  [/^\/add\/[^/]+/, '/add/:code'],
  [/^\/confirm-email\/[^/]+/, '/confirm-email/:token'],
];

/** The app path to report for `pathname` (no base path, query or hash, ids replaced). */
export function analyticsPath(pathname: string): string {
  const base = getBasePath();
  let path = base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  for (const [pattern, replacement] of REDACTED) path = path.replace(pattern, replacement);
  return path;
}

let measurementId: string | null = null;
let started = false;

/** Starts Google Analytics if this server has a measurement id set (Administrator settings or
 * GA_MEASUREMENT_ID); otherwise nothing from Google is loaded. Automatic page views are off - they
 * would report the raw URL - so pages are sent by trackPageView instead. */
export async function initAnalytics(): Promise<void> {
  // Once per page load - React's dev-mode double effects (or a remount) must not add a second tag.
  if (started) return;
  started = true;
  try {
    const res = await fetch(`${getBasePath()}/api/analytics-config`);
    if (!res.ok) return;
    const { gaMeasurementId } = (await res.json()) as { gaMeasurementId: string | null };
    if (!gaMeasurementId) return;
    window.dataLayer = window.dataLayer ?? [];
    // gtag reads `arguments`, not an array, so this has to stay a plain function.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', gaMeasurementId, { send_page_view: false });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    document.head.appendChild(script);
    measurementId = gaMeasurementId;
    trackPageView(window.location.pathname);
  } catch {
    /* analytics is best-effort */
  }
}

/** Reports one page view with ids and codes stripped from the address. No-op when analytics is off. */
export function trackPageView(pathname: string): void {
  if (!measurementId || !window.gtag) return;
  const path = analyticsPath(pathname);
  const location = `${window.location.origin}${getBasePath()}${path}`;
  // Set for every later event too, so nothing Google collects carries the raw URL.
  window.gtag('set', { page_location: location, page_path: path, page_referrer: '' });
  window.gtag('event', 'page_view', { page_location: location, page_path: path, page_title: document.title });
}
