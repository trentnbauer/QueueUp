/** Wire format for a "connection code" (issue #441) - a single paste-able string that packs
 * everything an external companion agent (a Playnite extension, a home dashboard, ...) needs to
 * talk to a self-hosted QueueUp instance's /api/v1 API, so a user only has to copy-paste one value
 * instead of separately entering a server URL and an API key. QueueUp only ever *generates* this
 * string (see web/src/components/PlayniteImportSection.tsx) - nothing in this repo decodes it back,
 * since the only consumer is external, not-yet-built tooling. `decodeConnectionCode` exists purely
 * as this format's reference implementation/round-trip test, for whoever builds that tooling later.
 *
 * Format: `CONNECTION_CODE_PREFIX` + base64(JSON({ url, key })). Versioned via the prefix (`qc1_`,
 * matching the `qk_` convention used for a raw API key's own prefix - see server's apiKeys.ts) so
 * a future breaking change to the packed shape can bump to `qc2_` and have old extension versions
 * fail loudly on an unrecognized prefix instead of silently misparsing a new format. Uses
 * btoa/atob (not Buffer) so the same implementation runs unchanged in the browser and in Node
 * (both Vite and vitest have them globally) - safe here specifically because `url` and `key` are
 * always plain ASCII (a URL and a base64url token), never arbitrary Unicode text that btoa/atob
 * would mangle. */
const CONNECTION_CODE_PREFIX = 'qc1_';

export interface QueueUpConnectionCode {
  /** The QueueUp instance's own base URL (e.g. `window.location.origin`) - self-hosted, so there's
   * no single fixed address an extension could assume. */
  url: string;
  /** A personal API key (see server's ApiKey model) - grants pull/push on this key's owner's
   * library and any room they're a member of, same access a real /api/v1 request with this key
   * would have. Treat the whole connection code as sensitive as the raw key it contains. */
  key: string;
}

export function encodeConnectionCode(data: QueueUpConnectionCode): string {
  return CONNECTION_CODE_PREFIX + btoa(JSON.stringify(data));
}

/** Reference decoder - see this file's top comment. Returns null for anything that isn't a
 * well-formed code of the current version, rather than throwing, so a caller (or, if this logic
 * is ported elsewhere, an extension) can show "that doesn't look like a QueueUp connection code"
 * instead of an unhandled exception. */
export function decodeConnectionCode(code: string): QueueUpConnectionCode | null {
  if (!code.startsWith(CONNECTION_CODE_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(atob(code.slice(CONNECTION_CODE_PREFIX.length)));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as QueueUpConnectionCode).url === 'string' &&
      typeof (parsed as QueueUpConnectionCode).key === 'string'
    ) {
      return parsed as QueueUpConnectionCode;
    }
    return null;
  } catch {
    return null;
  }
}
