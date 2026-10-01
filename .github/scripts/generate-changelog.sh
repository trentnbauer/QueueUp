#!/usr/bin/env bash
# Generates web/public/changelog.json from merged PR titles, for the
# "updates since last access" banner in the web app (see
# web/src/hooks/useChangelog.ts / web/src/dialogs/MiscDialogs.tsx).
#
# Requires `gh` to be authenticated (GITHUB_TOKEN with `pull-requests: read`
# is enough), `jq`, and a checkout with full history and tags (fetch-depth: 0).
# Safe to re-run — it always regenerates the full file from GitHub's
# merged-PR history, capped at the most recent 200 so the file doesn't grow
# unbounded.
#
# Each entry gets a `version`: the first vX.Y.Z release tag that contains its
# merge commit, so the app can show "Updated to vX.Y.Z" per release. PRs merged
# since the last release get CHANGELOG_NEXT_VERSION (the version this build is
# about to publish), or null when unset (dev builds).
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
OUT="${1:-web/public/changelog.json}"
NEXT_VERSION="${CHANGELOG_NEXT_VERSION:-}"

mkdir -p "$(dirname "$OUT")"
RAW="$(mktemp)"
VERSIONS="$(mktemp)"
trap 'rm -f "$RAW" "$VERSIONS"' EXIT

gh pr list --repo "$REPO" --state merged --limit 200 \
  --json number,title,url,mergedAt,mergeCommit \
  --search "sort:updated-desc" \
  > "$RAW"

# "<number> <version>" per PR; version is empty when not in any release yet.
jq -r '.[] | "\(.number) \(.mergeCommit.oid // "")"' "$RAW" | while read -r number sha; do
  version=""
  if [ -n "$sha" ] && git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    version="$(git tag --contains "$sha" -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | head -1)"
  fi
  echo "$number ${version:-$NEXT_VERSION}"
done > "$VERSIONS"

jq --rawfile versions "$VERSIONS" '
  ($versions | split("\n") | map(select(length > 0) | split(" ")) | map({ key: .[0], value: (.[1] // "") }) | from_entries) as $v
  | map({ number, title, url, mergedAt, version: (($v[(.number | tostring)] // "") | if . == "" then null else . end) })
  | sort_by(.mergedAt) | reverse
' "$RAW" > "$OUT"

echo "Wrote $(jq 'length' "$OUT") merged PR entries to $OUT"
