/** Query parameters that carry a secret: a guest's lobby token, and the codes, states and tokens of a sign-in or an API key. */
const SECRET_PARAMS = /(^|&)(guest|code|state|token|key|api_key|access_token|id_token)=[^&]*/gi;

/** A request URL that is safe to write to a log, which an administrator can export: the query string of a sign-in route (`/auth/...`, under any BASE_PATH) is
 * dropped, since it carries the provider's code and state, and a secret parameter anywhere else is blanked. Everything else is kept, since a search or filter is
 * what is needed to see why a request was slow. */
export function loggableUrl(url: string): string {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const path = url.slice(0, at);
  if (/(^|\/)auth\//.test(path)) return path;
  return `${path}?${url.slice(at + 1).replace(SECRET_PARAMS, '$1$2=[redacted]')}`;
}
