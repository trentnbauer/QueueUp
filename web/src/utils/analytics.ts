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

const CONSENT_KEY = 'sq-analytics-consent';

/** The visitor's answer to "share usage stats?" in this browser; null until they've answered. */
export type AnalyticsConsent = 'granted' | 'denied' | null;

export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

let configRequest: Promise<string | null> | null = null;

/** This server's GA4 measurement id (Administrator settings or GA_MEASUREMENT_ID), or null when
 * analytics isn't set up - in which case the consent question is never shown. Fetched once. */
export function fetchAnalyticsId(): Promise<string | null> {
  configRequest ??= fetch(`${getBasePath()}/api/analytics-config`)
    .then(async (res) => (res.ok ? ((await res.json()) as { gaMeasurementId: string | null }).gaMeasurementId : null))
    .catch(() => {
      configRequest = null;
      return null;
    });
  return configRequest;
}

let measurementId: string | null = null;
let loadedId: string | null = null;

function disableFlag(id: string): string {
  return `ga-disable-${id}`;
}

/** Loads gtag.js for `id` (once per page) and switches sending back on if it was turned off. */
function start(id: string): void {
  (window as unknown as Record<string, unknown>)[disableFlag(id)] = false;
  measurementId = id;
  if (loadedId) return;
  loadedId = id;
  window.dataLayer = window.dataLayer ?? [];
  // gtag reads `arguments`, not an array, so this has to stay a plain function.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** Stops anything more being sent this page load and deletes Google's _ga cookies. */
function stop(): void {
  if (loadedId) (window as unknown as Record<string, unknown>)[disableFlag(loadedId)] = true;
  measurementId = null;
  const host = window.location.hostname;
  const parts = host.split('.');
  // gtag sets its cookies on the widest domain it can, so try each parent of this host too.
  const domains = ['', ...parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.'))];
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim())) {
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
  }
}

/** Starts Google Analytics when this server has a measurement id set AND the visitor said yes
 * (onboarding or Settings); otherwise nothing from Google is loaded. Automatic page views are off -
 * they would report the raw URL - so pages are sent by trackPageView instead. */
export async function initAnalytics(): Promise<void> {
  if (getAnalyticsConsent() !== 'granted') return;
  const id = await fetchAnalyticsId();
  // Re-checked: the answer could have changed while the config was loading.
  if (!id || getAnalyticsConsent() !== 'granted' || measurementId) return;
  start(id);
  trackPageView(window.location.pathname);
}

/** Records the visitor's answer for this browser and applies it straight away. */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    /* private mode - the choice just won't stick */
  }
  if (granted) await initAnalytics();
  else stop();
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
