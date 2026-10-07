import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode, PLAYNITE_API_KEY_LABEL, ROOM_PLATFORM_LABELS, type AiImportClassification, type AiMatchSuggestion, type GameSearchResult, type PendingLibraryImportDto, type SteamCompletionCandidate } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { gamesApi } from '../api/games';
import { pendingImportsApi, DISMISSED_IMPORTS_QUERY_KEY, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { XBOX_STATUS_QUERY_KEY, xboxApi } from '../api/xbox';
import { PSN_STATUS_QUERY_KEY, psnApi } from '../api/psn';
import { RETROACHIEVEMENTS_STATUS_QUERY_KEY, retroAchievementsApi } from '../api/retroachievements';
import { EXOPHASE_STATUS_QUERY_KEY, exophaseApi } from '../api/exophase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useSyncSources } from '../hooks/useSyncSources';
import { useUi } from '../context/UiContext';
import { useUndoChange } from '../hooks/useUndoChange';
import { useLibraryLimits } from '../hooks/useLibraryLimits';
import { Dialog } from '../ui/Dialog';
import { LibraryBadge, type LibraryKind } from '../ui/LibraryLogo';
import { AutoHideAdultRow } from './AutoHideAdultRow';
import { AiBadge, AiPickedBadge, Banner, Btn, Cover, Group, Kicker, Spinner, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT, type MessageKey } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];
const PLAYNITE_URL = 'https://playnite.link/';
// Redirects to the latest release's .pext file itself (see server/src/routes/playniteExtension.ts).
const EXTENSION_URL = `${getBasePath()}/api/playnite-extension`;
const LINK_POLL_MS = 3000;

function ImportRow({ kind, title, sub, cta, onClick, disabled, accent }: { kind: LibraryKind; title: string; sub: string; cta: string; onClick: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 12px 10px 16px;background:var(--surf)')}>
      <LibraryBadge kind={kind} size={40} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{title}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);text-wrap:pretty')}>{sub}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={st(`flex-shrink:0;height:36px;padding:0 14px;border-radius:999px;border:none;background:${accent ? 'var(--acc)' : 'var(--text)'};color:${accent ? 'var(--ink)' : 'var(--onText)'};font:600 13px var(--font-ui);opacity:${disabled ? 0.5 : 1}`)}
      >
        {cta}
      </button>
    </div>
  );
}

/** "Import your library": Steam (library + wishlist + completions) and Playnite. */
export function ImportDialog() {
  const t = useT();
  const ui = useUi();
  const { steamLinked } = useAuth();
  const { busy, activeKind, progress, wishlistProgress, startLink, syncingEverything, completions, result, error } = useSteamImportContext();
  const running = busy || completions.busy || syncingEverything;
  // Opened from Add game (issue #859): a linked library's button syncs it here, rather than opening its settings.
  const syncMode = ui.dialogs.import?.mode === 'sync';
  const sync = useSyncSources();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const syncBusy = sync.busy || syncingId !== null;
  const { data: psnStatus } = useQuery({ queryKey: PSN_STATUS_QUERY_KEY, queryFn: psnApi.status });
  const { data: raStatus } = useQuery({ queryKey: RETROACHIEVEMENTS_STATUS_QUERY_KEY, queryFn: retroAchievementsApi.status });
  const limits = useLibraryLimits();
  const { data: exophaseStatus } = useQuery({ queryKey: EXOPHASE_STATUS_QUERY_KEY, queryFn: exophaseApi.status });
  // Playnite pushes from the desktop; its connection code having been used says it is set up.
  const { data: apiKeys } = useQuery({ queryKey: API_KEYS_QUERY_KEY, queryFn: apiKeysApi.list });
  const playniteKey = apiKeys?.keys
    .filter((k) => k.label === PLAYNITE_API_KEY_LABEL && !k.revokedAt)
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))[0];
  // The Xbox row only shows when the server has an Xbox app set up.
  const { data: xboxStatus } = useQuery({ queryKey: XBOX_STATUS_QUERY_KEY, queryFn: xboxApi.status });

  async function syncRow(id: string, label: string) {
    setSyncingId(id);
    try {
      const outcome = await sync.syncOne(id);
      if (outcome === 'limited') ui.showError(t('add.import.rateLimited', { minutes: limits.minutesLeft(id) ?? 1 }));
      else ui.notify(t('add.import.synced', { source: label }));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('add.import.syncFailed', { source: label }));
    } finally {
      setSyncingId(null);
    }
  }

  // Linked: the Steam dialog is where it is synced or disconnected (issue #861), like the other sources.
  // Every source dialog opens on top of Libraries rather than replacing it (issue #860), so closing one
  // lands back here instead of leaving the settings flow altogether.
  function steamManage() {
    if (!steamLinked) {
      startLink('library');
      return;
    }
    ui.openDialog('steam');
  }

  const status = busy && activeKind === 'library'
    ? progress
      ? t('add.import.libraryProgress', { owned: progress.totalOwned, checked: progress.imported + progress.skipped, total: progress.consideredCount, imported: progress.imported })
      : t('add.import.checkingLibrary')
    : busy && activeKind === 'wishlist'
      ? wishlistProgress
        ? t('add.import.wishlistProgress', { wishlisted: wishlistProgress.totalWishlisted, checked: wishlistProgress.imported + wishlistProgress.skipped, total: wishlistProgress.consideredCount })
        : t('add.import.checkingWishlist')
      : completions.busy
        ? t('add.import.checkingAchievements')
        : (error ?? completions.error ?? result);

  return (
    <Dialog onClose={() => ui.closeDialog('import')} title={t('add.import.title')} gap={16}>
      {status && <div style={st('padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px var(--font-ui);text-wrap:pretty')}>{status}</div>}
      <Group>
        <ImportRow
          kind="steam"
          title={t('add.import.steamTitle')}
          sub={steamLinked ? t('add.import.steamSub') : t('add.import.steamLinkSub')}
          cta={running || syncingId === 'steam' ? t('add.import.importing') : steamLinked ? t(syncMode ? 'settings.me.sync' : 'settings.me.steam.manage') : t('add.import.linkSteam')}
          disabled={running || syncingId !== null}
          accent
          onClick={steamLinked && syncMode ? () => void syncRow('steam', 'Steam') : steamManage}
        />
        <ImportRow
          kind="playnite"
          title="Playnite"
          sub={playniteKey?.lastUsedAt ? t('settings.me.playnite.lastSynced', { when: formatRelativeTime(playniteKey.lastUsedAt) }) : t('add.import.playniteSub')}
          cta={playniteKey?.lastUsedAt ? t('settings.me.playnite.manage') : t('add.import.setUp')}
          onClick={() => ui.openDialog('playnite')}
        />
        <ImportRow
          kind="exophase"
          title="Exophase"
          sub={limits.isLimited('exophase') ? t('add.import.rateLimited', { minutes: limits.minutesLeft('exophase') ?? 1 }) : t('add.import.exophaseSub')}
          cta={syncingId === 'exophase' ? t('add.import.syncing') : exophaseStatus?.connected ? t(syncMode ? 'settings.me.sync' : 'settings.me.exophase.manage') : t('settings.me.exophase.link')}
          disabled={syncMode && !!exophaseStatus?.connected && (syncBusy || limits.isLimited('exophase'))}
          onClick={exophaseStatus?.connected && syncMode ? () => void syncRow('exophase', 'Exophase') : () => ui.openDialog('exophase')}
        />
        <ImportRow
          kind="playstation"
          title="PlayStation"
          sub={t('add.import.psnSub')}
          cta={syncingId === 'psn' ? t('add.import.syncing') : psnStatus?.connected ? t(syncMode ? 'settings.me.sync' : 'settings.me.psn.manage') : t('settings.me.psn.link')}
          disabled={syncMode && !!psnStatus?.connected && syncBusy}
          onClick={psnStatus?.connected && syncMode ? () => void syncRow('psn', 'PlayStation') : () => ui.openDialog('psn')}
        />
        <ImportRow
          kind="retroachievements"
          title="RetroAchievements"
          sub={limits.isLimited('retroachievements') ? t('add.import.rateLimited', { minutes: limits.minutesLeft('retroachievements') ?? 1 }) : t('add.import.retroAchievementsSub')}
          cta={syncingId === 'retroachievements' ? t('add.import.syncing') : raStatus?.connected ? t(syncMode ? 'settings.me.sync' : 'settings.me.exophase.manage') : t('settings.me.exophase.link')}
          disabled={syncMode && !!raStatus?.connected && (syncBusy || limits.isLimited('retroachievements'))}
          onClick={raStatus?.connected && syncMode ? () => void syncRow('retroachievements', 'RetroAchievements') : () => ui.openDialog('retroachievements')}
        />
        {xboxStatus?.configured && (
          <ImportRow
            kind="xbox"
            title="Xbox"
            sub={t('add.import.xboxSub')}
            cta={syncingId === 'xbox' ? t('add.import.syncing') : xboxStatus.connected ? t(syncMode ? 'settings.me.sync' : 'settings.me.xbox.manage') : t('settings.me.xbox.link')}
            disabled={syncMode && xboxStatus.connected && syncBusy}
            onClick={xboxStatus.connected && syncMode ? () => void syncRow('xbox', 'Xbox') : () => ui.openDialog('xbox')}
          />
        )}
      </Group>
      <Group>
        <AutoHideAdultRow />
      </Group>
    </Dialog>
  );
}

/** Playnite setup: install Playnite, install the extension, paste the setup code. Detects the first
 * call from Playnite itself (the key's lastUsedAt) and flips to a success state. */
export function PlayniteDialog() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const linkStatus = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: apiKeysApi.list,
    enabled: keyId !== null && !linked,
    refetchInterval: LINK_POLL_MS,
  });
  useEffect(() => {
    if (!keyId || linked) return;
    if (linkStatus.data?.keys.find((k) => k.id === keyId)?.lastUsedAt) {
      setLinked(true);
      ui.notify(t('add.playniteSetup.connected'));
    }
  }, [keyId, linked, linkStatus.data, ui]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(PLAYNITE_API_KEY_LABEL);
      setCode(encodeConnectionCode({ url: `${window.location.origin}${getBasePath()}`, key: created.key }));
      setKeyId(created.id);
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.playniteSetup.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    ui.notify(t('add.playniteSetup.copied'));
  }

  const steps: { t: string; d: string; link?: [string, string] }[] = [
    { t: t('add.playniteSetup.step1Title'), d: t('add.playniteSetup.step1Body'), link: [t('add.playniteSetup.step1Link'), PLAYNITE_URL] },
    { t: t('add.playniteSetup.step2Title'), d: t('add.playniteSetup.step2Body'), link: [t('add.playniteSetup.step2Link'), EXTENSION_URL] },
    { t: t('add.playniteSetup.step3Title'), d: t('add.playniteSetup.step3Body') },
  ];

  return (
    <Dialog onClose={() => ui.closeDialog('playnite')} title={t('add.playniteSetup.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {linked ? (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <span style={st('font:700 20px var(--font-display)')}>{t('add.playniteSetup.linked')}</span>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
            {t('add.playniteSetup.linkedBody')}
          </span>
          <Btn kind="text" height={46} weight={700} onClick={() => ui.closeDialog('playnite')}>
            {t('add.playniteSetup.finish')}
          </Btn>
        </div>
      ) : (
        <>
          {steps.map((s, i) => (
            <div key={s.t} style={st('display:flex;gap:12px')}>
              <span style={st(`width:28px;height:28px;flex-shrink:0;border-radius:50%;background:${i === 2 && code ? 'var(--acc)' : 'var(--chip)'};color:${i === 2 && code ? 'var(--ink)' : 'var(--text)'};display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)`)}>{i + 1}</span>
              <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{s.t}</span>
                <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{s.d}</span>
                {s.link && (
                  <a
                    href={s.link[1]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={st('align-self:flex-start;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none')}
                  >
                    {s.link[0]}
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </span>
            </div>
          ))}
          {code ? (
            <>
              <div style={st('display:flex;align-items:center;gap:10px;padding:10px 10px 10px 16px;border-radius:16px;background:var(--surf)')}>
                <span style={st('flex:1;min-width:0;font:600 13px var(--font-mono);letter-spacing:0.02em;word-break:break-all')}>{code}</span>
                <Btn kind="text" height={36} padX={14} fontSize={13} weight={700} onClick={copy}>
                  {t('add.playniteSetup.copy')}
                </Btn>
              </div>
              <span style={st('display:flex;align-items:center;gap:10px;font:400 13px var(--font-ui);color:var(--muted)')}>
                <span style={st('width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />
                {t('add.playniteSetup.waiting')}
              </span>
            </>
          ) : (
            <Btn kind="accent" height={48} weight={700} fontSize={14} disabled={generating} onClick={generate}>
              {generating ? t('add.playniteSetup.generating') : t('add.playniteSetup.generate')}
            </Btn>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Find the right game for a pending import by searching (including games already owned). */
function ManualMatchDialog({ entry, onClose, onResolved, onPick }: { entry: PendingLibraryImportDto; onClose: () => void; onResolved: () => void; onPick?: (result: GameSearchResult) => void }) {
  const t = useT();
  const [query, setQuery] = useState(entry.title);
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const [idQuery, setIdQuery] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      latest.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++latest.current;
    setSearching(true);
    const handle = setTimeout(() => {
      gamesApi
        .search(q, null, 0, true, true)
        .then(({ results }) => {
          if (latest.current !== id) return;
          setResults(results);
          setError(null);
        })
        .catch((err) => latest.current === id && setError(err instanceof Error ? err.message : t('add.manualMatch.searchFailed')))
        .finally(() => latest.current === id && setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  async function pick(igdbId: number) {
    setResolving(igdbId);
    setError(null);
    try {
      await pendingImportsApi.resolve(entry.id, igdbId);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.review.matchFailed'));
      setResolving(null);
    }
  }

  function submitId() {
    const id = idQuery.trim();
    if (!/^\d+$/.test(id)) {
      setError(t('add.manualMatch.invalidId'));
      return;
    }
    void pick(Number(id));
  }

  return (
    <Dialog
      onClose={onClose}
      height="tall"
      padded={false}
      header={
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
          <span style={st('font:700 21px var(--font-display)')}>{t('add.manualMatch.title')}</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {t('add.manualMatch.subtitle', { title: entry.title })}
          </span>
        </span>
      }
      top={
        <div style={st('flex-shrink:0;padding:6px 20px 10px')}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('add.manualMatch.searchGames')} aria-label={t('add.manualMatch.searchGames')} style={st(inputPill, { width: '100%', height: 48 })} />
        </div>
      }
    >
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 12px 20px')}>
        {error && <div style={{ padding: '0 8px 10px' }}><Banner>{error}</Banner></div>}
        {searching && <div style={st('padding:12px 10px;color:var(--muted);font-size:14px')}>{t('add.manualMatch.searching')}</div>}
        {!searching && query.trim() && results.length === 0 && !error && <div style={st('padding:18px 10px;color:var(--muted);font-size:14px')}>{t('add.manualMatch.noMatches')}</div>}
        {results.map((r) => (
          <div key={r.igdbId} style={st('min-height:64px;display:flex;align-items:center;gap:12px;padding:6px 8px;border-radius:14px')}>
            <Cover title={r.title} url={r.coverImageUrl} width={36} radius={7} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                {r.title}
                {r.releaseYear ? ` (${r.releaseYear})` : ''}
              </span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{r.platform}</span>
            </span>
            <button type="button" disabled={resolving !== null} onClick={() => (onPick ? onPick(r) : pick(r.igdbId))} style={st('height:34px;padding:0 14px;border-radius:999px;border:none;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui)')}>
              {resolving === r.igdbId ? t('add.manualMatch.matching') : onPick ? t('add.bundle.addGame') : t('add.manualMatch.thisOne')}
            </button>
          </div>
        ))}
        {!onPick && (
        <div style={st('margin:10px 8px 0;padding-top:14px;border-top:1px solid var(--chip);display:flex;flex-direction:column;gap:8px')}>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('add.manualMatch.byIdHint')}</span>
          <div style={st('display:flex;gap:8px')}>
            <input value={idQuery} onChange={(e) => setIdQuery(e.target.value)} inputMode="numeric" placeholder={t('add.manualMatch.idPlaceholder')} aria-label={t('add.manualMatch.idLabel')} style={st(inputPill, { flex: 1, minWidth: 0 })} />
            <Btn height={44} onClick={submitId} disabled={resolving !== null || !idQuery.trim()}>
              {t('add.manualMatch.match')}
            </Btn>
          </div>
        </div>
        )}
      </div>
    </Dialog>
  );
}

/** Needs Review: imported titles that didn't confidently match, one at a time. */
export function NeedsReviewDialog() {
  const t = useT();
  const ui = useUi();
  const undoable = useUndoChange();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: PENDING_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.list });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bundle mode (issue #857): the games this title is a bundle of, picked from the suggestions or by
  // search. Null when the title is being matched to a single game as usual.
  const [bundle, setBundle] = useState<Map<number, GameSearchResult> | null>(null);
  // What the AI picked for each waiting title (issue #819), keyed by pending id.
  const [aiPicks, setAiPicks] = useState<Map<string, AiMatchSuggestion>>(new Map());
  // What the AI thinks each non-game title is (issue #828), keyed by pending id.
  const [aiKinds, setAiKinds] = useState<Map<string, AiImportClassification>>(new Map());
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const aiReady = !!ai.data && ai.data.effectiveSource !== 'none';

  // Skipped items go to the back of the line.
  const pending = data?.pending ?? [];
  // Titles the AI is sure are not games, still waiting, for the one-click "skip all of these".
  const skippable = pending.filter((p) => aiKinds.get(p.id)?.suggestSkip);  const ordered = [...pending.filter((p) => !skipped.includes(p.id)), ...pending.filter((p) => skipped.includes(p.id))];
  const entry: PendingLibraryImportDto | undefined = ordered[0];
  const entryKind = entry ? aiKinds.get(entry.id) : undefined;
  // The AI's pick for this title, when it named one of the candidates shown.
  const aiIndex = entry ? entry.candidates.findIndex((c) => c.igdbId === aiPicks.get(entry.id)?.igdbId) : -1;
  // The AI's pick, else the top candidate (a match other people made, else IGDB's best guess), is
  // selected until the person taps another, so the usual case is a single tap on "Use this match".
  const selected = pick ?? (aiIndex >= 0 ? aiIndex : entry && entry.candidates.length > 0 ? 0 : null);

  // A different title comes up next: it starts as a normal single match again.
  useEffect(() => setBundle(null), [entry?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
  };

  const resolve = useMutation({
    mutationFn: ({ id, igdbId }: { id: string; igdbId: number }) => pendingImportsApi.resolve(id, igdbId),
    onSuccess: () => refresh(),
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.matchFailed')),
  });
  const resolveBundle = useMutation({
    mutationFn: ({ id, igdbIds }: { id: string; igdbIds: number[] }) => pendingImportsApi.resolveBundle(id, igdbIds),
    onSuccess: () => refresh(),
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.matchFailed')),
  });
  // One press runs the AI over everything waiting: the server does a chunk at a time and hands back
  // where the next one starts, so this keeps asking until it runs out (no cap - with your own
  // provider that is just the whole list; on the shared key the daily limit ends it, and what was
  // done so far is kept). `progress` is "checked so far" out of "checked + still to do".
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const aiMatch = useMutation({
    mutationFn: async () => {
      const picks = new Map<string, AiMatchSuggestion>();
      let autoMatched = 0;
      let checked = 0;
      let after: string | null = null;
      let stopped: string | null = null;
      for (;;) {
        let res;
        try {
          res = await pendingImportsApi.aiMatch(after);
        } catch (err) {
          // Nothing done yet: surface the error. Part way: keep what the earlier chunks found.
          if (checked === 0 && picks.size === 0 && autoMatched === 0) throw err;
          stopped = err instanceof Error ? err.message : t('add.review.ai.failed');
          break;
        }
        for (const s of res.suggestions) picks.set(s.id, s);
        autoMatched += res.autoMatched;
        checked += res.checked;
        setAiPicks(new Map(picks));
        setAiProgress({ done: checked, total: checked + res.remaining });
        if (res.stopped) stopped = res.stopped;
        if (!res.next) break;
        after = res.next;
      }
      return { picks, autoMatched, stopped };
    },
    onSuccess: ({ picks, autoMatched, stopped }) => {
      setError(null);
      setAiPicks(picks);
      refresh();
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
      ui.notify(t('add.review.ai.done', { auto: autoMatched, suggested: picks.size }));
      if (stopped) setError(t('add.review.ai.stopped', { reason: stopped }));
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.ai.failed')),
    onSettled: () => setAiProgress(null),
  });
  const aiClassify = useMutation({
    mutationFn: async () => {
      const kinds = new Map<string, AiImportClassification>();
      let checked = 0;
      let after: string | null = null;
      let stopped: string | null = null;
      for (;;) {
        let res;
        try {
          res = await pendingImportsApi.aiClassify(after);
        } catch (err) {
          if (checked === 0) throw err;
          stopped = err instanceof Error ? err.message : t('add.review.ai.failed');
          break;
        }
        for (const i of res.items) kinds.set(i.id, i);
        checked += res.checked;
        setAiKinds(new Map(kinds));
        setAiProgress({ done: checked, total: checked + res.remaining });
        if (res.stopped) stopped = res.stopped;
        if (!res.next) break;
        after = res.next;
      }
      return { kinds, stopped };
    },
    onSuccess: ({ kinds, stopped }) => {
      setError(null);
      setAiKinds(kinds);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
      const n = [...kinds.values()].filter((i) => i.suggestSkip).length;
      ui.notify(t(n === 0 ? 'add.review.cleanup.none' : 'add.review.cleanup.found', { n }));
      if (stopped) setError(t('add.review.ai.stopped', { reason: stopped }));
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.ai.failed')),
    onSettled: () => setAiProgress(null),
  });
  const skipAll = useMutation({
    mutationFn: (ids: string[]) => pendingImportsApi.dismissMany(ids),
    onSuccess: (res) => {
      setPick(null);
      queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: DISMISSED_IMPORTS_QUERY_KEY });
      ui.notify(t('add.review.cleanup.skipped', { n: res.dismissed }));
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.dismissFailed')),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => pendingImportsApi.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY }),
    onError: (err) => setError(err instanceof Error ? err.message : t('add.review.dismissFailed')),
  });

  const platforms = entry ? entry.platforms.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') || t('add.review.unknownPlatform') : '';

  async function confirmPick() {
    if (!entry || selected === null) return;
    const c = entry.candidates[selected];
    setError(null);
    const res = await resolve.mutateAsync({ id: entry.id, igdbId: c.igdbId });
    setPick(null);
    undoable(t('add.review.matchedTitle', { title: c.title }), res?.undoToken);
  }

  function toggleBundleGame(game: GameSearchResult) {
    setBundle((current) => {
      if (!current) return current;
      const next = new Map(current);
      if (next.has(game.igdbId)) next.delete(game.igdbId);
      else next.set(game.igdbId, game);
      return next;
    });
  }

  async function finishBundle() {
    if (!entry || !bundle || bundle.size === 0) return;
    setError(null);
    const count = bundle.size;
    await resolveBundle.mutateAsync({ id: entry.id, igdbIds: [...bundle.keys()] });
    setBundle(null);
    ui.notify(t(count === 1 ? 'add.bundle.done.one' : 'add.bundle.done.other', { n: count, title: entry.title }));
  }

  async function dismissEntry() {
    if (!entry) return;
    const ok = await confirm({
      title: t('add.review.dismissTitle', { title: entry.title }),
      message: t('add.review.dismissMessage'),
      confirmLabel: t('common.dismiss'),
      danger: true,
    });
    if (!ok) return;
    await dismiss.mutateAsync(entry.id);
    setPick(null);
    ui.notify(t('add.review.dismissed', { title: entry.title }));
  }

  /** A soundtrack, tool, demo or the like: set aside for good without the Dismiss confirmation. It is kept (like any
   * dismissed title), so a later sync does not ask about it again, and it can be restored from the dismissed list. */
  async function markNotAGame() {
    if (!entry) return;
    await dismiss.mutateAsync(entry.id);
    setPick(null);
    ui.notify(t('add.review.notAGameDone', { title: entry.title }));
  }

  return (
    <>
      <Dialog
        onClose={() => ui.closeDialog('needsReview')}
        height="tall"
        padded={false}
        header={
          <Kicker size={12} style={{ flex: 1 }}>
            {entry ? t('add.review.kickerLeft', { n: pending.length }) : t('add.review.kicker')}
          </Kicker>
        }
        footer={
          entry && bundle ? (
            <div style={st('flex-shrink:0;display:grid;grid-template-columns:1fr 1.6fr;gap:8px;padding:12px 16px 26px;border-top:1px solid var(--chip)')}>
              <Btn kind="soft" height={50} style={{ background: 'var(--chip)', color: 'var(--text)' }} onClick={() => setBundle(null)} disabled={resolveBundle.isPending}>
                {t('common.cancel')}
              </Btn>
              <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={bundle.size === 0 || resolveBundle.isPending} onClick={finishBundle}>
                {resolveBundle.isPending ? t('add.manualMatch.matching') : t('add.bundle.finish', { n: bundle.size })}
              </Btn>
            </div>
          ) : entry && (
            <div style={st('flex-shrink:0;display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;padding:12px 16px 26px;border-top:1px solid var(--chip)')}>
              <Btn kind="soft" height={50} style={{ background: 'var(--chip)', color: 'var(--text)' }} onClick={dismissEntry} disabled={dismiss.isPending}>
                {t('common.dismiss')}
              </Btn>
              <Btn
                height={50}
                style={{ background: 'var(--chip)', border: 'none' }}
                onClick={() => {
                  setSkipped((s) => [...s.filter((x) => x !== entry.id), entry.id]);
                  setPick(null);
                }}
              >
                {t('common.skip')}
              </Btn>
              <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={selected === null || resolve.isPending} onClick={confirmPick}>
                {resolve.isPending ? t('add.manualMatch.matching') : t('add.review.useMatch')}
              </Btn>
            </div>
          )
        }
      >
        {entry ? (
          <>
            {error && <div style={{ padding: '0 20px 6px' }}><Banner onDismiss={() => setError(null)}>{error}</Banner></div>}
            {aiReady && !bundle && (
              <div style={st('flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 20px 6px')}>
                <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={aiMatch.isPending || aiClassify.isPending} onClick={() => aiMatch.mutate()}>
                  {aiMatch.isPending ? <span style={st('display:inline-flex;align-items:center;gap:8px')}><Spinner />{aiProgress ? t('add.review.ai.progress', aiProgress) : t('add.review.ai.working')}</span> : t('add.review.ai.ask')}
                </Btn>
                <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={aiMatch.isPending || aiClassify.isPending} onClick={() => aiClassify.mutate()}>
                  {aiClassify.isPending ? <span style={st('display:inline-flex;align-items:center;gap:8px')}><Spinner />{aiProgress ? t('add.review.ai.progress', aiProgress) : t('add.review.ai.working')}</span> : t('add.review.cleanup.ask')}
                </Btn>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('add.review.ai.hint')}</span>
              </div>
            )}
            {skippable.length > 0 && !bundle && (
              <div style={st('flex-shrink:0;display:flex;align-items:center;gap:10px;margin:0 20px 6px;padding:10px 12px;border-radius:14px;background:var(--surf)')}>
                <AiBadge title={t('add.review.ai.badge')} />
                <span style={st('flex:1;min-width:0;font:500 13px/1.35 var(--font-ui)')}>{t('add.review.cleanup.banner', { n: skippable.length })}</span>
                <Btn kind="soft" height={34} padX={12} fontSize={13} disabled={skipAll.isPending} onClick={() => skipAll.mutate(skippable.map((p) => p.id))}>
                  {t('add.review.cleanup.skipAll', { n: skippable.length })}
                </Btn>
              </div>
            )}
            <div style={st('flex-shrink:0;min-height:92px;padding:0 20px;display:flex;flex-direction:column;justify-content:center;gap:4px')}>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('add.review.importedAs')}</span>
              <span style={st('font:700 26px/1.1 var(--font-display);letter-spacing:-0.02em;overflow:hidden;text-overflow:ellipsis')}>{t('add.review.quotedTitle', { title: entry.title })}</span>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {t('add.review.platformsVia', { platforms, source: entry.source.charAt(0).toUpperCase() + entry.source.slice(1) })}
              </span>
              {entryKind && (
                <span style={st('display:flex;align-items:center;gap:6px;font:500 13px var(--font-ui);color:var(--text2)')}>
                  <AiBadge title={t('add.review.ai.badge')} />
                  {t(`add.review.cleanup.kind.${entryKind.kind}` as MessageKey)}
                </span>
              )}
            </div>
            <Kicker style={{ padding: '14px 20px 8px', flexShrink: 0 }}>{bundle ? t('add.bundle.which') : t('add.review.whichGame')}</Kicker>
            <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 16px 12px;display:flex;flex-direction:column;gap:8px')}>
              {entry.candidates.map((c, i) => {
                const on = bundle ? bundle.has(c.igdbId) : selected === i;
                return (
                  <button
                    key={c.igdbId}
                    type="button"
                    onClick={() => (bundle ? toggleBundleGame(c) : setPick(i))}
                    style={st(`flex-shrink:0;min-height:76px;display:flex;align-items:center;gap:12px;padding:8px 14px 8px 10px;border-radius:18px;border:2px solid ${on ? 'var(--acc)' : 'transparent'};background:${on ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);text-align:left`)}
                  >
                    <Cover title={c.title} url={c.coverImageUrl} width={40} radius={7} />
                    <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                      <span style={st('display:flex;align-items:center;gap:6px;min-width:0')}>
                        <span style={st('font:600 15px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                          {c.title}
                          {c.releaseYear ? ` (${c.releaseYear})` : ''}
                        </span>
                        {i === aiIndex && <AiPickedBadge title={t('add.review.ai.badge')} />}
                      </span>
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                        {c.platform}
                        {c.suggestedBy ? t(c.suggestedBy === 1 ? 'add.review.matchedByOthers.one' : 'add.review.matchedByOthers.other', { n: c.suggestedBy }) : ''}
                      </span>
                    </span>
                    <span style={st(`width:24px;height:24px;flex-shrink:0;border-radius:50%;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'}`)} />
                  </button>
                );
              })}
              {bundle &&
                [...bundle.values()]
                  .filter((g) => !entry.candidates.some((c) => c.igdbId === g.igdbId))
                  .map((g) => (
                    <button
                      key={g.igdbId}
                      type="button"
                      onClick={() => toggleBundleGame(g)}
                      style={st('flex-shrink:0;min-height:76px;display:flex;align-items:center;gap:12px;padding:8px 14px 8px 10px;border-radius:18px;border:2px solid var(--acc);background:var(--accSoft);color:var(--text);text-align:left')}
                    >
                      <Cover title={g.title} url={g.coverImageUrl} width={40} radius={7} />
                      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                        <span style={st('font:600 15px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                          {g.title}
                          {g.releaseYear ? ` (${g.releaseYear})` : ''}
                        </span>
                        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{g.platform}</span>
                      </span>
                      <span style={st('width:24px;height:24px;flex-shrink:0;border-radius:50%;border:2px solid var(--acc);background:var(--acc)')} />
                    </button>
                  ))}
              {entry.candidates.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted);padding:4px 4px 8px')}>{t('add.review.noCloseMatches')}</span>}
              <button type="button" onClick={() => setManual(true)} style={st('flex-shrink:0;height:52px;border-radius:18px;border:1.5px dashed var(--line);background:transparent;color:var(--text2);font:600 14px var(--font-ui)')}>
                {bundle ? t('add.bundle.search') : t('add.review.searchManually')}
              </button>
              {!bundle && (
                <button type="button" onClick={() => setBundle(new Map())} style={st('flex-shrink:0;height:52px;border-radius:18px;border:1.5px dashed var(--line);background:transparent;color:var(--text2);font:600 14px var(--font-ui)')}>
                  {t('add.bundle.start')}
                </button>
              )}
              {!bundle && (
                <button type="button" onClick={markNotAGame} disabled={dismiss.isPending} style={st('flex-shrink:0;height:52px;border-radius:18px;border:1.5px dashed var(--line);background:transparent;color:var(--text2);font:600 14px var(--font-ui)')}>
                  {t('add.review.notAGame')}
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={st('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center')}>
            <span style={st('font:700 28px var(--font-display);letter-spacing:-0.02em')}>{t('add.review.allMatched')}</span>
            <span style={st('font:400 14.5px var(--font-ui);color:var(--muted)')}>{t('add.review.nothingToReview')}</span>
            <Btn kind="text" height={46} padX={22} weight={700} fontSize={14} onClick={() => ui.closeDialog('needsReview')}>
              {t('common.done')}
            </Btn>
          </div>
        )}
      </Dialog>
      {manual && entry && (
        <ManualMatchDialog
          entry={entry}
          onClose={() => setManual(false)}
          onResolved={() => {
            setManual(false);
            refresh();
            ui.notify(t('add.review.matched'));
          }}
          onPick={
            bundle
              ? (result) => {
                  setBundle((current) => new Map(current ?? []).set(result.igdbId, result));
                  setManual(false);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** "Sync trophies and achievements": every candidate is a suggestion; nothing changes until applied. */
export function CompletionsDialog() {
  const t = useT();
  const ui = useUi();
  const { ops } = useScope();
  const { completions } = useSteamImportContext();
  const result = completions.result;
  const [candidates, setCandidates] = useState<SteamCompletionCandidate[]>(result?.candidates ?? []);
  const [selected, setSelected] = useState<string[]>((result?.candidates ?? []).map((c) => c.id));
  const [applying, setApplying] = useState(false);

  const close = () => {
    completions.reset();
    ui.closeDialog('completions');
  };

  async function apply() {
    const ids = candidates.map((c) => c.id).filter((id) => selected.includes(id));
    if (!ids.length) return;
    setApplying(true);
    try {
      await ops.bulkUpdateStatus(ids, 'done');
      setCandidates((c) => c.filter((x) => !ids.includes(x.id)));
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      ui.notify(t('add.completions.marked', { n: ids.length }));
    } catch {
      /* the games hook surfaces the failure itself */
    } finally {
      setApplying(false);
    }
  }

  const n = candidates.length;
  // Everything reviewed (applied or dismissed): nothing left to show, so close rather than sit empty.
  useEffect(() => {
    if (n === 0) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return (
    <Dialog
      onClose={close}
      title={t('add.completions.title')}
      height="tall"
      footer={
        n > 0 && (
          <div style={st('flex-shrink:0;display:flex;align-items:center;gap:6px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
            <Btn kind="ghost" height={40} padX={10} fontSize={13} onClick={() => setSelected(candidates.map((c) => c.id))}>{t('add.completions.selectAll')}</Btn>
            <Btn kind="ghost" height={40} padX={10} fontSize={13} onClick={() => setSelected([])}>{t('add.completions.clear')}</Btn>
            <span style={{ flex: 1 }} />
            <Btn kind="accent" height={46} padX={20} fontSize={14} weight={700} disabled={applying || selected.length === 0} onClick={apply}>
              {applying ? t('add.completions.marking') : t('add.completions.markN', { n: selected.length })}
            </Btn>
          </div>
        )
      }
      gap={12}
    >
      {n === 0 ? null : (
        <>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
            {t(n === 1 ? 'add.completions.intro.one' : 'add.completions.intro.other', { n, checked: result?.consideredCount ?? '' })}
          </span>
          <div style={st('display:flex;flex-direction:column;gap:6px')}>
            {candidates.map((c) => {
              const on = selected.includes(c.id);
              return (
                <div key={c.id} style={st('display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:16px;background:var(--surf)')}>
                  <button
                    type="button"
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                    role="checkbox"
                    aria-checked={on}
                    style={st('flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:0;border:none;background:transparent;color:var(--text);text-align:left')}
                  >
                    <span style={st(`width:26px;height:26px;flex-shrink:0;border-radius:8px;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 13px var(--font-ui)`)}>{on ? '✓' : ''}</span>
                    <Cover title={c.title} url={c.coverImageUrl} width={36} radius={8} />
                    <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                      <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{c.title}</span>
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('add.completions.completedWhen', { when: formatRelativeTime(c.lastUnlockedAt) })}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidates((x) => x.filter((y) => y.id !== c.id));
                      setSelected((s) => s.filter((id) => id !== c.id));
                    }}
                    style={st('flex-shrink:0;height:34px;padding:0 10px;border:none;background:none;color:var(--muted);font:600 12.5px var(--font-ui)')}
                  >
                    {t('common.dismiss')}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Dialog>
  );
}
