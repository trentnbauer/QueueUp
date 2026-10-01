import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRICE_REGION_LABELS, type PriceRegion } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { authApi } from '../api/auth';
import { badgesApi } from '../api/badges';
import { useAuth } from '../context/AuthContext';
import { useCardDensity } from '../context/CardDensityContext';
import { useConfirm } from '../context/ConfirmContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useScope } from '../context/ScopeContext';
import { useThemeMode } from '../context/ThemeModeContext';
import { useUi } from '../context/UiContext';
import { useViewMode } from '../context/ViewModeContext';
import { useFriends } from '../hooks/useFriends';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { useSyncSources } from '../hooks/useSyncSources';
import { useVersion } from '../hooks/useVersion';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, Group, Kicker, Segmented, Toggle, inputField } from '../ui/primitives';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';
import { PALETTE_LABELS, type Palette } from '../theme/applyThemeMode';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
const PROVIDER_LABELS: Record<string, string> = { oidc: 'Single sign-on', google: 'Google', discord: 'Discord', steam: 'Steam' };
const ROW_BASE = 'display:flex;align-items:center;gap:12px;min-height:54px;padding:0 16px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%';
const ISSUES_URL = 'https://github.com/trentnbauer/QueueUp/issues/new/choose';

function NavRow({ label, sub, badge, onClick }: { label: string; sub?: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={st(ROW_BASE)} className="hv-surf2">
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{label}</span>
        {sub && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{sub}</span>}
      </span>
      {!!badge && (
        <span style={st('min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 11.5px var(--font-ui);display:flex;align-items:center;justify-content:center')}>{badge}</span>
      )}
      <span style={st('color:var(--muted);font-size:20px')}>›</span>
    </button>
  );
}

function ActionCard({ title, sub, cta, onClick, accent, disabled }: { title: string; sub: string; cta: string; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={st('flex-shrink:0;display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 12px 10px 16px;border-radius:18px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%')}
    >
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{title}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);text-wrap:pretty')}>{sub}</span>
      </span>
      <span style={st(`height:34px;padding:0 14px;border-radius:999px;background:${accent ? 'var(--text)' : 'var(--accSoft2)'};color:${accent ? 'var(--onText)' : 'var(--accText)'};font:600 12.5px var(--font-ui);display:flex;align-items:center`)}>{cta}</span>
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
  );
}

/** Personal API keys: generate once (shown once), revoke. */
function ApiKeysDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const ui = useUi();
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: API_KEYS_QUERY_KEY, queryFn: apiKeysApi.list });
  const create = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: (c) => {
      setFresh(c.key);
      setLabel('');
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
  const revoke = useMutation({ mutationFn: apiKeysApi.revoke, onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY }) });
  const active = (data?.keys ?? []).filter((k) => !k.revokedAt);
  const err = create.error ?? revoke.error;

  return (
    <Dialog onClose={onClose} title="API keys" gap={14}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
        Pull your library into another system, or push a game in from one (a script, the Playnite extension, a home dashboard). A key acts as you, so treat it like a password. See <code>/api/v1</code>.
      </span>
      {err && <Banner>{err instanceof Error ? err.message : 'Something went wrong with your API keys'}</Banner>}
      {fresh && (
        <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;background:var(--surf)')}>
          <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--text2)')}>Copy this now. You won't be able to see it again.</span>
          <div style={st('display:flex;align-items:center;gap:10px')}>
            <code style={st('flex:1;min-width:0;font:500 12.5px var(--font-mono);word-break:break-all')}>{fresh}</code>
            <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={async () => { await navigator.clipboard.writeText(fresh); ui.notify('API key copied'); }}>
              Copy
            </Btn>
          </div>
          <Btn kind="ghost" height={32} style={{ alignSelf: 'flex-start' }} onClick={() => setFresh(null)}>Done</Btn>
        </div>
      )}
      <div style={st('display:flex;gap:8px')}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && label.trim() && create.mutate(label.trim())}
          placeholder="What's this key for? (e.g. Playnite sync)"
          aria-label="Key label"
          maxLength={100}
          style={st(inputField, { flex: 1, minWidth: 0 })}
        />
        <Btn kind="text" height={44} padX={16} weight={700} disabled={!label.trim() || create.isPending} onClick={() => create.mutate(label.trim())}>
          {create.isPending ? '…' : 'Generate'}
        </Btn>
      </div>
      {active.length > 0 ? (
        <Group>
          {active.map((k) => (
            <div key={k.id} style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 10px 8px 16px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{k.label}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                  Created {formatRelativeTime(k.createdAt)} · {k.lastUsedAt ? `Last used ${formatRelativeTime(k.lastUsedAt)}` : 'Never used'}
                </span>
              </span>
              <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={revoke.isPending && revoke.variables === k.id} onClick={() => revoke.mutate(k.id)}>
                Revoke
              </Btn>
            </div>
          ))}
        </Group>
      ) : (
        <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>No API keys yet.</span>
      )}
    </Dialog>
  );
}

/** Profile & settings: pages, syncs, appearance, currency, systems, sign-in methods, sharing, account. */
export function MeDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user, publicProfileEnabled, profileSlug, primaryProvider, linkedProviders, refetch } = useAuth();
  const { rooms, games } = useScope();
  const { version } = useVersion();
  const friends = useFriends();
  const pending = usePendingImportsCount();
  const { region, setRegion } = useCurrencyRegion();
  const { preference, setPreference, palette, setPalette } = useThemeMode();
  const { viewMode, setViewMode } = useViewMode();
  const { density, setDensity } = useCardDensity();
  const sync = useSyncSources();
  const { data: badges } = useQuery({ queryKey: ['me', 'badges'], queryFn: badgesApi.list });
  const [providers, setProviders] = useState<string[] | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [slugDraft, setSlugDraft] = useState<string | null>(null);

  useEffect(() => {
    authApi.providers().then(({ providers }) => setProviders(providers)).catch(() => setProviders([]));
  }, []);

  if (!user) return null;
  const close = () => ui.closeDialog('me');
  const go = (path: string) => () => {
    close();
    ui.selectGame(null);
    navigate(path);
  };
  const open = (key: Parameters<typeof ui.openDialog>[0]) => () => {
    close();
    ui.openDialog(key as never);
  };

  const beaten = games.filter((g) => g.status === 'done' || g.status === 'replay').length;
  const earned = badges ? badges.badges.filter((b) => b.unlockedAt).length : null;
  const total = badges ? badges.badges.length : null;
  const profileUrl = `${window.location.origin}${getBasePath()}/u/${profileSlug ?? user.id}`;

  async function syncLibraries() {
    if (sync.busy) return;
    if (!sync.hasLinked) {
      sync.linkFirst();
      return;
    }
    const ok = await confirm({
      title: 'Sync your libraries?',
      message: `Pulls new games and wishlist items from ${sync.linkedLabels.join(', ')}. Skips anything already here.`,
      confirmLabel: 'Sync',
    });
    if (!ok) return;
    close();
    ui.notify('Syncing libraries…');
    await sync.syncLibraries();
    ui.notify('Library sync done');
  }

  async function syncAchievements() {
    if (sync.busy) return;
    if (!sync.hasLinked) {
      sync.linkFirst();
      return;
    }
    close();
    ui.notify('Checking trophies and achievements…');
    await sync.syncAchievements();
  }

  async function unlink(provider: string) {
    const label = PROVIDER_LABELS[provider] ?? provider;
    const ok = await confirm({
      title: `Unlink ${label}?`,
      message: provider === 'steam' ? 'Library sync, playtime nudges and completion checks stop until you link Steam again.' : `You won't be able to sign in with ${label} any more.`,
      confirmLabel: 'Unlink',
      danger: true,
    });
    if (!ok) return;
    setUnlinking(provider);
    try {
      await authApi.unlink(provider);
      await refetch();
      ui.notify(`${label} unlinked`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not unlink ${label}`);
    } finally {
      setUnlinking(null);
    }
  }

  async function togglePublic(on: boolean) {
    try {
      await authApi.updatePublicProfile(on);
      await refetch();
      ui.notify(on ? 'Public profile on' : 'Public profile off');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your public profile setting');
    }
  }

  async function saveSlug() {
    if (slugDraft === null) return;
    try {
      await authApi.setProfileSlug(slugDraft.trim() === '' ? null : slugDraft);
      await refetch();
      setSlugDraft(null);
      ui.notify(slugDraft.trim() === '' ? 'Profile link reset' : 'Profile link saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that profile name');
    }
  }

  async function signOut() {
    const ok = await confirm({ title: 'Sign out?', message: 'You can sign back in any time with the same account.', confirmLabel: 'Sign out' });
    if (ok) window.location.href = authApi.logoutUrl;
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: 'Delete your account?',
      message: "Permanently deletes your Personal Shelf, votes, room memberships and every game you've added to a room. This can't be undone. If you still own a room, delete it or hand it off first.",
      confirmLabel: 'Delete my account',
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    try {
      await authApi.deleteAccount();
      window.location.href = `${getBasePath()}/`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account');
    }
  }

  const pendingFriends = friends.incoming.length;

  return (
    <>
      <Dialog
        onClose={close}
        height="tall"
        gap={24}
        header={
          <>
            <Avatar name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={52} fontSize={20} />
            <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{user.displayName}</span>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'} · {beaten} beaten
              </span>
            </div>
          </>
        }
      >
        {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

        <Group>
          <NavRow label="Friends" sub={`${friends.friends.length} friend${friends.friends.length === 1 ? '' : 's'}${pendingFriends ? ` · ${pendingFriends} new request${pendingFriends > 1 ? 's' : ''}` : ''}`} badge={pendingFriends} onClick={open('friends')} />
          {pending > 0 && <NavRow label="Needs review" sub="Imported games waiting for a match" badge={pending} onClick={open('needsReview')} />}
          <NavRow label="Achievements" sub={earned !== null ? `${earned} of ${total} earned` : 'Your badge catalogue'} onClick={go('/achievements')} />
          <NavRow label="Backlog insights" sub="Time to beat, neglected games, backlog age" onClick={go('/insights')} />
          <NavRow label="Year in games" sub="Your last 12 months" onClick={go('/year')} />
          {user.isAdmin && <NavRow label="Administrator settings" sub="Integrations, rooms and users on this server" onClick={go('/admin')} />}
        </Group>

        <ActionCard
          title="Sync libraries"
          sub={!sync.hasLinked ? 'Link Steam to import your library' : sync.busy ? 'Syncing…' : `New games and wishlist from ${sync.linkedLabels.join(', ')}`}
          cta={!sync.hasLinked ? 'Link' : sync.busy ? '…' : 'Sync'}
          accent={sync.hasLinked}
          disabled={sync.busy}
          onClick={syncLibraries}
        />
        <ActionCard
          title="Sync trophies and achievements"
          sub="Find 100%'d games not yet marked Beaten"
          cta="Check"
          disabled={sync.busy}
          onClick={syncAchievements}
        />
        <ActionCard title="Sync Playnite" sub="Epic, GOG, Xbox, PlayStation, Nintendo via the desktop app" cta="Set up" onClick={open('playnite')} />

        <Section label="APPEARANCE">
          <Segmented
            columns={3}
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
          <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>Colours</span>
          <Segmented
            columns={3}
            value={palette}
            onChange={setPalette}
            options={(Object.keys(PALETTE_LABELS) as Palette[]).map((k) => ({ value: k, label: PALETTE_LABELS[k] }))}
          />
          <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>Shelf &amp; room layout</span>
          <Segmented
            columns={2}
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'list', label: 'List' },
              { value: 'artwork', label: 'Covers' },
            ]}
          />
          {viewMode === 'artwork' && (
            <>
              <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>Covers per row</span>
              <Segmented
                columns={2}
                value={density === 'small' ? 'small' : 'medium'}
                onChange={(v) => setDensity(v === 'small' ? 'small' : 'medium')}
                options={[
                  { value: 'medium', label: '2 per row' },
                  { value: 'small', label: '3 per row' },
                ]}
              />
            </>
          )}
        </Section>

        <Section label="PRICE CURRENCY">
          <select
            value={region ?? ''}
            aria-label="Price currency"
            onChange={(e) => setRegion((e.target.value || undefined) as PriceRegion | undefined)}
            style={st('height:48px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none')}
          >
            <option value="">Server default</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {PRICE_REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </Section>

        <Section label="SYSTEMS OWNED">
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Limits the Personal Shelf's add-game search to these systems. Leave all off to search every platform.</span>
          <SystemsPicker onSaved={() => ui.notify('Systems owned saved')} />
        </Section>

        {providers && providers.length > 0 && (
          <Section label="SIGN-IN METHODS">
            <Group>
              {providers.map((p) => {
                const linked = linkedProviders.includes(p);
                const primary = p === primaryProvider;
                return (
                  <div key={p} style={st('display:flex;align-items:center;gap:12px;min-height:54px;padding:0 10px 0 16px;background:var(--surf)')}>
                    <span style={st('flex:1;font:600 15px var(--font-ui)')}>{PROVIDER_LABELS[p] ?? p}</span>
                    {primary ? (
                      <span style={st('font:500 12.5px var(--font-ui);color:var(--muted);padding-right:6px')}>Primary</span>
                    ) : linked ? (
                      <Btn kind="soft" height={34} padX={14} fontSize={12.5} style={{ background: 'var(--chip)', color: 'var(--muted)' }} disabled={unlinking === p} onClick={() => unlink(p)}>
                        Unlink
                      </Btn>
                    ) : (
                      <a href={authApi.linkUrl(p)} style={st('height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
                        Link
                      </a>
                    )}
                  </div>
                );
              })}
            </Group>
          </Section>
        )}

        <Section label="SHARING">
          <Group>
            <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;background:var(--surf)')}>
              <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 15px var(--font-ui)')}>Public profile</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Read-only link: achievements, Beaten, Playing</span>
              </span>
              <Toggle on={publicProfileEnabled} onChange={togglePublic} label="Public profile" />
            </div>
            {publicProfileEnabled && (
              <>
                <NavRow label="Preview public page" onClick={() => window.open(profileUrl, '_blank', 'noopener')} />
                <div style={st('display:flex;align-items:center;gap:10px;min-height:52px;padding:0 10px 0 16px;background:var(--surf)')}>
                  <span style={st('flex:1;min-width:0;font:500 12.5px var(--font-mono);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{profileUrl.replace(/^https?:\/\//, '')}</span>
                  <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={async () => { await navigator.clipboard.writeText(profileUrl); ui.notify('Profile link copied'); }}>
                    Copy link
                  </Btn>
                </div>
                <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 10px 12px 16px;background:var(--surf)')}>
                  <span style={st('display:flex;flex-direction:column;gap:1px')}>
                    <span style={st('font:600 15px var(--font-ui)')}>Custom link</span>
                    <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Use a name instead of your id: letters, numbers and hyphens, 3 to 30 characters</span>
                  </span>
                  <div style={st('display:flex;align-items:center;gap:8px')}>
                    <span style={st('font:500 12.5px var(--font-mono);color:var(--muted)')}>/u/</span>
                    <input
                      value={slugDraft ?? profileSlug ?? ''}
                      onChange={(e) => setSlugDraft(e.target.value)}
                      placeholder="your-name"
                      aria-label="Custom profile link"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      style={st(inputField, { flex: 1, minWidth: 0, height: 38, fontFamily: 'var(--font-mono)', fontSize: 13.5 })}
                    />
                    {slugDraft !== null && slugDraft !== (profileSlug ?? '') && (
                      <Btn kind="text" height={38} padX={14} fontSize={12.5} weight={700} onClick={saveSlug}>
                        Save
                      </Btn>
                    )}
                  </div>
                </div>
              </>
            )}
            <NavRow label="API keys" onClick={() => setKeysOpen(true)} />
          </Group>
        </Section>

        <Group>
          <NavRow label="What's new" onClick={open('changelog')} />
          <NavRow label="Report an issue" onClick={() => window.open(ISSUES_URL, '_blank', 'noopener')} />
          <NavRow label="Download my data" onClick={() => { window.location.href = `${getBasePath()}/api/me/export`; }} />
          <NavRow label="Sign out" onClick={signOut} />
        </Group>
        <button type="button" onClick={deleteAccount} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
          Delete my account
        </button>
        <span style={st('font:500 11.5px var(--font-mono);color:var(--faint)')}>QueueUp{version ? ` ${version}` : ''}</span>
      </Dialog>
      {keysOpen && <ApiKeysDialog onClose={() => setKeysOpen(false)} />}
    </>
  );
}
