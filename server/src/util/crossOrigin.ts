/** Whether a request is a cookie-authenticated, state-changing request sent from another origin -
 * the CSRF case the SameSite=Lax session cookie alone doesn't cover (a sibling subdomain of the same
 * site). Browsers always send Origin on such requests; requests without one (non-browser clients)
 * and the bearer-token /api/v1 surface, which never reads the cookie, are let through. */
export function isCrossOriginWrite(
  method: string,
  origin: string | undefined,
  url: string,
  appOrigin: string,
  apiV1Prefix: string,
): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (origin === undefined || origin === appOrigin) return false;
  return !url.startsWith(apiV1Prefix);
}
