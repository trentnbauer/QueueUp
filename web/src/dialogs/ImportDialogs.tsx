import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode, PLAYNITE_API_KEY_LABEL, ROOM_PLATFORM_LABELS, type GameSearchResult, type PendingLibraryImportDto, type SteamCompletionCandidate } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { gamesApi } from '../api/games';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, Cover, Group, Kicker, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';

const GAMES_QUERY_ROOT = ['games'];
const PLAYNITE_URL = 'https://playnite.link/';
// Redirects to the latest release's .pext file itself (see server/src/routes/playniteExtension.ts).
const EXTENSION_URL = `${getBasePath()}/api/playnite-extension`;
const LINK_POLL_MS = 3000;

function ImportRow({ title, sub, cta, onClick, disabled, accent }: { title: string; sub: string; cta: string; onClick: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 12px 10px 16px;background:var(--surf)')}>
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
  const ui = useUi();
  const confirm = useConfirm();
  const { steamLinked } = useAuth();
  const { busy, activeKind, progress, wishlistProgress, startLink, runSyncEverything, syncingEverything, completions, result, error } = useSteamImportContext();
  const running = busy || completions.busy || syncingEverything;

  async function steamImport() {
    if (!steamLinked) {
      startLink('library');
      return;
    }
    const ok = await confirm({
      title: 'Import from Steam?',
      message: 'Imports your library and wishlist, then scans for newly-completed achievements. Skips anything already here. This can take a little while.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    await runSyncEverything();
    ui.notify('Steam import done');
  }

  const status = busy && activeKind === 'library'
    ? progress
      ? `Library: ${progress.totalOwned} owned · checked ${progress.imported + progress.skipped} of ${progress.consideredCount} · ${progress.imported} imported so far`
      : 'Checking your Steam library…'
    : busy && activeKind === 'wishlist'
      ? wishlistProgress
        ? `Wishlist: ${wishlistProgress.totalWishlisted} wishlisted · checked ${wishlistProgress.imported + wishlistProgress.skipped} of ${wishlistProgress.consideredCount}`
        : 'Checking your Steam wishlist…'
      : completions.busy
        ? 'Checking Steam for newly-completed achievements…'
        : (error ?? completions.error ?? result);

  return (
    <Dialog onClose={() => ui.closeDialog('import')} title="Import your library" gap={16}>
      {status && <div style={st('padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px var(--font-ui);text-wrap:pretty')}>{status}</div>}
      <Group>
        <ImportRow
          title="Steam Import"
          sub={steamLinked ? 'Library + wishlist + achievement completions. Skips anything already here.' : 'Link your Steam account to import'}
          cta={running ? 'Importing…' : steamLinked ? 'Import' : 'Link Steam'}
          disabled={running}
          accent
          onClick={steamImport}
        />
        <ImportRow
          title="Playnite"
          sub="Pull in Epic, GOG, Xbox, PlayStation and Nintendo via the free Playnite desktop app"
          cta="Set up"
          onClick={() => {
            ui.closeDialog('import');
            ui.openDialog('playnite');
          }}
        />
      </Group>
    </Dialog>
  );
}

/** Playnite setup: install Playnite, install the extension, paste the setup code. Detects the first
 * call from Playnite itself (the key's lastUsedAt) and flips to a success state. */
export function PlayniteDialog() {
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
      ui.notify('Playnite connected');
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
      setError(err instanceof Error ? err.message : 'Could not generate a Playnite setup code');
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    ui.notify('Connection code copied');
  }

  const steps: { t: string; d: string; link?: [string, string] }[] = [
    { t: 'Install Playnite', d: 'The free, open-source launcher for Windows that gathers all your stores in one place.', link: ['Get Playnite', PLAYNITE_URL] },
    { t: 'Install the QueueUp extension', d: 'Download the .pext file and drag it into Playnite to install it. A QueueUp menu appears under Extensions.', link: ['Download the .pext', EXTENSION_URL] },
    { t: 'Connect to QueueUp', d: 'Generate a code below, then in Playnite choose Extensions → QueueUp → Connect to QueueUp and paste it in.' },
  ];

  return (
    <Dialog onClose={() => ui.closeDialog('playnite')} title="Import from Playnite" gap={16}>
      {error && <Banner>{error}</Banner>}
      {linked ? (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <span style={st('font:700 20px var(--font-display)')}>Successfully linked!</span>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
            Run Extensions → QueueUp → Push library to QueueUp in Playnite whenever your library changes. Download metadata for your whole library first (Library → Download Metadata) so QueueUp has full details for each game.
          </span>
          <Btn kind="text" height={46} weight={700} onClick={() => ui.closeDialog('playnite')}>
            Finish
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
                  Copy
                </Btn>
              </div>
              <span style={st('display:flex;align-items:center;gap:10px;font:400 13px var(--font-ui);color:var(--muted)')}>
                <span style={st('width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />
                Waiting for Playnite to connect. This continues on its own once it does.
              </span>
            </>
          ) : (
            <Btn kind="accent" height={48} weight={700} fontSize={14} disabled={generating} onClick={generate}>
              {generating ? 'Generating…' : 'Generate setup code'}
            </Btn>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Find the right game for a pending import by searching (including games already owned). */
function ManualMatchDialog({ entry, onClose, onResolved }: { entry: PendingLibraryImportDto; onClose: () => void; onResolved: () => void }) {
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
        .catch((err) => latest.current === id && setError(err instanceof Error ? err.message : 'Search failed'))
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
      setError(err instanceof Error ? err.message : 'Could not match this game');
      setResolving(null);
    }
  }

  function submitId() {
    const t = idQuery.trim();
    if (!/^\d+$/.test(t)) {
      setError('Enter a valid IGDB game ID (a positive whole number).');
      return;
    }
    void pick(Number(t));
  }

  return (
    <Dialog
      onClose={onClose}
      height="tall"
      padded={false}
      header={
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
          <span style={st('font:700 21px var(--font-display)')}>Find the right game</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            for “{entry.title}” · includes games you already own
          </span>
        </span>
      }
      top={
        <div style={st('flex-shrink:0;padding:6px 20px 10px')}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" aria-label="Search games" style={st(inputPill, { width: '100%', height: 48 })} />
        </div>
      }
    >
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 12px 20px')}>
        {error && <div style={{ padding: '0 8px 10px' }}><Banner>{error}</Banner></div>}
        {searching && <div style={st('padding:12px 10px;color:var(--muted);font-size:14px')}>Searching…</div>}
        {!searching && query.trim() && results.length === 0 && !error && <div style={st('padding:18px 10px;color:var(--muted);font-size:14px')}>No matches. Try a shorter title.</div>}
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
            <button type="button" disabled={resolving !== null} onClick={() => pick(r.igdbId)} style={st('height:34px;padding:0 14px;border-radius:999px;border:none;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui)')}>
              {resolving === r.igdbId ? 'Matching…' : 'This one'}
            </button>
          </div>
        ))}
        <div style={st('margin:10px 8px 0;padding-top:14px;border-top:1px solid var(--chip);display:flex;flex-direction:column;gap:8px')}>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Can't find it by title? Match by IGDB game ID instead.</span>
          <div style={st('display:flex;gap:8px')}>
            <input value={idQuery} onChange={(e) => setIdQuery(e.target.value)} inputMode="numeric" placeholder="IGDB ID, e.g. 1234" aria-label="IGDB game ID" style={st(inputPill, { flex: 1, minWidth: 0 })} />
            <Btn height={44} onClick={submitId} disabled={resolving !== null || !idQuery.trim()}>
              Match
            </Btn>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Needs Review: imported titles that didn't confidently match, one at a time. */
export function NeedsReviewDialog() {
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: PENDING_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.list });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skipped items go to the back of the line.
  const pending = data?.pending ?? [];
  const ordered = [...pending.filter((p) => !skipped.includes(p.id)), ...pending.filter((p) => skipped.includes(p.id))];
  const entry: PendingLibraryImportDto | undefined = ordered[0];
  // The top candidate (a match other people made, else IGDB's best guess) is selected until the
  // person taps another, so the usual case is a single tap on "Use this match".
  const selected = pick ?? (entry && entry.candidates.length > 0 ? 0 : null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
  };

  const resolve = useMutation({
    mutationFn: ({ id, igdbId }: { id: string; igdbId: number }) => pendingImportsApi.resolve(id, igdbId),
    onSuccess: () => refresh(),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not match this game'),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => pendingImportsApi.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not dismiss this game'),
  });

  const platforms = entry ? entry.platforms.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') || 'Unknown platform' : '';

  async function confirmPick() {
    if (!entry || selected === null) return;
    const c = entry.candidates[selected];
    setError(null);
    await resolve.mutateAsync({ id: entry.id, igdbId: c.igdbId });
    setPick(null);
    ui.notify(`Matched: ${c.title}`);
  }

  async function dismissEntry() {
    if (!entry) return;
    const ok = await confirm({
      title: `Dismiss ${entry.title}?`,
      message: "It won't be added to your shelf. It comes back if your library syncs it again.",
      confirmLabel: 'Dismiss',
      danger: true,
    });
    if (!ok) return;
    await dismiss.mutateAsync(entry.id);
    setPick(null);
    ui.notify(`Dismissed ${entry.title}`);
  }

  return (
    <>
      <Dialog
        onClose={() => ui.closeDialog('needsReview')}
        height="tall"
        padded={false}
        header={
          <Kicker size={12} style={{ flex: 1 }}>
            {entry ? `NEEDS REVIEW · ${pending.length} LEFT` : 'NEEDS REVIEW'}
          </Kicker>
        }
        footer={
          entry && (
            <div style={st('flex-shrink:0;display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;padding:12px 16px 26px;border-top:1px solid var(--chip)')}>
              <Btn kind="soft" height={50} style={{ background: 'var(--chip)', color: 'var(--text)' }} onClick={dismissEntry} disabled={dismiss.isPending}>
                Dismiss
              </Btn>
              <Btn
                height={50}
                style={{ background: 'var(--chip)', border: 'none' }}
                onClick={() => {
                  setSkipped((s) => [...s.filter((x) => x !== entry.id), entry.id]);
                  setPick(null);
                }}
              >
                Skip
              </Btn>
              <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={selected === null || resolve.isPending} onClick={confirmPick}>
                {resolve.isPending ? 'Matching…' : 'Use this match'}
              </Btn>
            </div>
          )
        }
      >
        {entry ? (
          <>
            {error && <div style={{ padding: '0 20px 6px' }}><Banner onDismiss={() => setError(null)}>{error}</Banner></div>}
            <div style={st('flex-shrink:0;min-height:92px;padding:0 20px;display:flex;flex-direction:column;justify-content:center;gap:4px')}>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>Imported as</span>
              <span style={st('font:700 26px/1.1 var(--font-display);letter-spacing:-0.02em;overflow:hidden;text-overflow:ellipsis')}>“{entry.title}”</span>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {platforms} · via {entry.source.charAt(0).toUpperCase() + entry.source.slice(1)}
              </span>
            </div>
            <Kicker style={{ padding: '14px 20px 8px', flexShrink: 0 }}>WHICH GAME IS IT?</Kicker>
            <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 16px 12px;display:flex;flex-direction:column;gap:8px')}>
              {entry.candidates.map((c, i) => {
                const on = selected === i;
                return (
                  <button
                    key={c.igdbId}
                    type="button"
                    onClick={() => setPick(i)}
                    style={st(`flex-shrink:0;min-height:76px;display:flex;align-items:center;gap:12px;padding:8px 14px 8px 10px;border-radius:18px;border:2px solid ${on ? 'var(--acc)' : 'transparent'};background:${on ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);text-align:left`)}
                  >
                    <Cover title={c.title} url={c.coverImageUrl} width={40} radius={7} />
                    <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                      <span style={st('font:600 15px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                        {c.title}
                        {c.releaseYear ? ` (${c.releaseYear})` : ''}
                      </span>
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                        {c.platform}
                        {c.suggestedBy ? ` · Matched by ${c.suggestedBy} other${c.suggestedBy === 1 ? '' : 's'}` : ''}
                      </span>
                    </span>
                    <span style={st(`width:24px;height:24px;flex-shrink:0;border-radius:50%;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'}`)} />
                  </button>
                );
              })}
              {entry.candidates.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted);padding:4px 4px 8px')}>No close matches found.</span>}
              <button type="button" onClick={() => setManual(true)} style={st('flex-shrink:0;height:52px;border-radius:18px;border:1.5px dashed var(--line);background:transparent;color:var(--text2);font:600 14px var(--font-ui)')}>
                None of these, search manually
              </button>
            </div>
          </>
        ) : (
          <div style={st('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center')}>
            <span style={st('font:700 28px var(--font-display);letter-spacing:-0.02em')}>All matched.</span>
            <span style={st('font:400 14.5px var(--font-ui);color:var(--muted)')}>Nothing needs review right now.</span>
            <Btn kind="text" height={46} padX={22} weight={700} fontSize={14} onClick={() => ui.closeDialog('needsReview')}>
              Done
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
            ui.notify('Matched');
          }}
        />
      )}
    </>
  );
}

/** "Sync trophies and achievements": every candidate is a suggestion; nothing changes until applied. */
export function CompletionsDialog() {
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
      ui.notify(`${ids.length} marked Beaten`);
    } catch {
      /* the games hook surfaces the failure itself */
    } finally {
      setApplying(false);
    }
  }

  const n = candidates.length;
  return (
    <Dialog
      onClose={close}
      title="Sync trophies and achievements"
      height="tall"
      footer={
        n > 0 && (
          <div style={st('flex-shrink:0;display:flex;align-items:center;gap:6px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
            <Btn kind="ghost" height={40} padX={10} fontSize={13} onClick={() => setSelected(candidates.map((c) => c.id))}>Select all</Btn>
            <Btn kind="ghost" height={40} padX={10} fontSize={13} onClick={() => setSelected([])}>Clear</Btn>
            <span style={{ flex: 1 }} />
            <Btn kind="accent" height={46} padX={20} fontSize={14} weight={700} disabled={applying || selected.length === 0} onClick={apply}>
              {applying ? 'Marking Beaten…' : `Mark Beaten (${selected.length})`}
            </Btn>
          </div>
        )
      }
      gap={12}
    >
      {n === 0 ? (
        <div style={st('padding:20px 4px 12px;font:500 14px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
          {result && result.candidates.length === 0
            ? `Checked ${result.consideredCount} not-yet-Beaten shelf game${result.consideredCount === 1 ? '' : 's'} with a linked Steam app. Nothing is 100%'d that isn't already marked Beaten.`
            : "That's everything reviewed."}
        </div>
      ) : (
        <>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
            Steam says you've 100%'d {n} game{n === 1 ? '' : 's'} that {n === 1 ? "isn't" : "aren't"} marked Beaten yet (checked {result?.consideredCount}). Pick which to update. Nothing changes until you apply.
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
                      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>100%'d {formatRelativeTime(c.lastUnlockedAt)}</span>
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
                    Dismiss
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
