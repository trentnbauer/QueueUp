import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAYNITE_API_KEY_LABEL, PRICE_REGION_LABELS, ROOM_PLATFORM_LABELS, sortPlatforms, type PriceRegion, type ProfileVisibility } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { authApi } from '../api/auth';
import { badgesApi } from '../api/badges';
import { ALERT_EMAIL_QUERY_KEY, NOTIFICATION_PREFERENCES_QUERY_KEY, alertEmailApi, notificationPreferencesApi } from '../api/notificationPreferences';
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
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';
import { LANGUAGES, useI18n, type Language } from '../i18n';
import { rerunOnboarding } from '../shell/Onboarding';
import { st } from '../ui/st';
import { ACCENT_LABELS, type Accent } from '../theme/applyThemeMode';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
const PROVIDER_LABELS: Record<string, string> = { oidc: 'Single sign-on', google: 'Google', discord: 'Discord', steam: 'Steam' };
const ROW_BASE = 'display:flex;align-items:center;gap:12px;min-height:54px;padding:0 16px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%';
const ISSUES_URL = 'https://github.com/trentnbauer/QueueUp/issues/new/choose';

/** The line under "Who can see my profile", and the toast after changing it. */
const PROFILE_VISIBILITY_TEXT: Record<ProfileVisibility, { sub: string; toast: string }> = {
  public: { sub: 'Anyone with the link: achievements, Beaten, Playing', toast: 'Your profile is public' },
  friends: { sub: 'Only your friends can open it', toast: 'Only friends can see your profile' },
  private: { sub: 'Only you can open it', toast: 'Your profile is private' },
};

export function NavRow({ label, sub, badge, onClick }: { label: string; sub?: string; badge?: number; onClick: () => void }) {
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

/** Systems owned, in its own dialog (one row in Settings and in Shelf settings). */
export function SystemsDialog({ onClose }: { onClose: () => void }) {
  const ui = useUi();
  return (
    <Dialog onClose={onClose} title="Systems owned" gap={14}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Add Game can limit its search to these systems with the "Owned systems only" button.</span>
      <SystemsPicker
        onSaved={() => {
          ui.notify('Systems owned saved');
          onClose();
        }}
      />
    </Dialog>
  );
}

/** "Share my activity with friends": off hides everything you do from your friends' feeds. */
function ActivitySharingRow() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const { data } = useQuery({ queryKey: ['activity-visibility'], queryFn: authApi.activityVisibility });
  const set = useMutation({
    mutationFn: authApi.setActivityVisibility,
    onSuccess: (res) => {
      queryClient.setQueryData(['activity-visibility'], res);
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      ui.notify(res.hidden ? 'Your activity is hidden from friends' : 'Friends can see your activity');
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : 'Could not change that'),
  });
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>Share my activity with friends</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Turn off to keep what you play and finish out of their feeds</span>
      </span>
      <Toggle on={data ? !data.hidden : true} disabled={!data || set.isPending} onChange={(on) => set.mutate(!on)} label="Share my activity with friends" />
    </div>
  );
}

/** Google Analytics opt-in for this browser. Only shown when the server has a measurement id set. */
function AnalyticsConsentRow() {
  const ui = useUi();
  const { available, consent, setConsent } = useAnalyticsConsent();
  if (!available) return null;
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px 10px 16px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>Share usage stats</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
          Google Analytics counts which pages are used, with ids and invite codes removed.{' '}
          <a href={`${getBasePath()}/privacy`} target="_blank" rel="noopener" style={st('color:var(--accText)')}>
            Privacy policy
          </a>
        </span>
      </span>
      <Toggle
        on={consent === 'granted'}
        onChange={(on) => {
          setConsent(on);
          ui.notify(on ? 'Thanks - usage stats are on' : 'Usage stats are off');
        }}
        label="Share usage stats"
      />
    </div>
  );
}

/** The address alert emails go to, with an edit box. A new address is confirmed from a link emailed to it. */
function AlertEmailRow() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const { data } = useQuery({ queryKey: ALERT_EMAIL_QUERY_KEY, queryFn: alertEmailApi.get });
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    try {
      const res = await alertEmailApi.set({ email: draft.trim() || null });
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ALERT_EMAIL_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      ui.notify(res.status === 'confirmation_sent' ? 'Check your inbox to confirm the new address' : 'Email saved');
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : 'Could not save that email');
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:16px;background:var(--surf)')}>
      <span style={st('font:600 14.5px var(--font-ui)')}>Email address for alerts</span>
      {draft === null ? (
        <div style={st('display:flex;align-items:center;gap:10px')}>
          <span style={st('flex:1;min-width:0;font:400 14px var(--font-ui);overflow-wrap:anywhere')}>{data.effectiveEmail}</span>
          <Btn kind="soft" height={34} padX={14} fontSize={12.5} onClick={() => setDraft(data.alertEmail ?? '')}>
            Change
          </Btn>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          style={st('display:flex;align-items:center;gap:6px')}
        >
          <input
            autoFocus
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={data.accountEmail}
            aria-label="Email address for alerts"
            style={st(inputField, { flex: 1, minWidth: 0, height: 38 })}
          />
          <Btn kind="accent" height={38} padX={12} fontSize={13} disabled={saving} onClick={() => void save()}>
            Save
          </Btn>
          <Btn height={38} padX={12} fontSize={13} onClick={() => setDraft(null)}>
            Cancel
          </Btn>
        </form>
      )}
      {data.pending && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Waiting for you to confirm {data.pending} from the email we sent it.</span>}
      <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
        {data.alertEmail ? `Your sign-in email is ${data.accountEmail}. Leave this blank to use it again.` : 'This is your sign-in email. Enter a different address to use that instead; it changes nothing about how you sign in.'}
      </span>
    </div>
  );
}

/** Which alerts you get: email (needs SMTP set up on the server) and, for the newer alert types, the bell. */
function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY, queryFn: notificationPreferencesApi.get });
  const [error, setError] = useState<string | null>(null);
  const set = useMutation({
    mutationFn: notificationPreferencesApi.set,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save that'),
  });
  // Only these can be hidden from the bell; the older types always show there.
  const canHideInApp = new Set(['feed_reaction', 'friend_recommendation', 'good_time_to_buy']);
  return (
    <Dialog onClose={onClose} title="Notifications" gap={14}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      <AlertEmailRow />
      {data && !data.emailAvailable && (
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Email alerts aren't set up on this server, so the email switches are off.</span>
      )}
      {data && data.emailAvailable && (
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>
          Email alerts go to {data.email}. You only get an email for an alert you haven't already read in the app.
        </span>
      )}
      {isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Loading…</span>}
      <Group>
        {data?.preferences.map((p) => (
          <div key={p.type} style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>{p.label}</span>
            <div style={st('display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
              <span style={st('display:flex;align-items:center;gap:8px;font:500 13px var(--font-ui);color:var(--text2)')}>
                Email
                <Toggle
                  on={p.email}
                  disabled={!data.emailAvailable || set.isPending}
                  label={`Email me: ${p.label}`}
                  onChange={(v) => set.mutate({ type: p.type, email: v })}
                />
              </span>
              {canHideInApp.has(p.type) && (
                <span style={st('display:flex;align-items:center;gap:8px;font:500 13px var(--font-ui);color:var(--text2)')}>
                  In the app
                  <Toggle on={p.inApp} disabled={set.isPending} label={`Show in the app: ${p.label}`} onChange={(v) => set.mutate({ type: p.type, inApp: v })} />
                </span>
              )}
            </div>
          </div>
        ))}
      </Group>
    </Dialog>
  );
}

/** Account history: a log of changes to this account and its settings. */
function AccountHistoryDialog({ onClose }: { onClose: () => void }) {
  const history = useInfiniteQuery({
    queryKey: ['account-events'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => authApi.accountEvents(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <Dialog onClose={onClose} title="Account history" gap={4}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);padding-bottom:8px')}>Changes to your account and settings, newest first.</span>
      {history.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Loading…</span>}
      {history.isError && <span style={st('font:400 13.5px var(--font-ui);color:var(--danger)')}>Could not load your history.</span>}
      {!history.isLoading && !history.isError && entries.length === 0 && (
        <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Nothing yet. Changes you make from now on show up here.</span>
      )}
      {entries.map((e) => (
        <div key={e.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
          <span>{e.message}</span>
          <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(e.createdAt)}</span>
        </div>
      ))}
      {history.hasNextPage && (
        <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
          {history.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Btn>
      )}
    </Dialog>
  );
}

function ApiKeysDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const ui = useUi();
  const confirm = useConfirm();
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
  async function confirmRevoke(id: string, keyLabel: string) {
    const ok = await confirm({ title: `Revoke "${keyLabel}"?`, message: 'Anything using this key stops working straight away.', confirmLabel: 'Revoke', danger: true });
    if (ok) revoke.mutate(id);
  }
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
              <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={revoke.isPending && revoke.variables === k.id} onClick={() => void confirmRevoke(k.id, k.label)}>
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
  const { language, setLanguage, t } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user, profileVisibility, profileSlug, primaryProvider, linkedProviders, ownedPlatforms, refetch } = useAuth();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const { rooms, games } = useScope();
  const { version } = useVersion();
  const friends = useFriends();
  const pending = usePendingImportsCount();
  const { region, setRegion } = useCurrencyRegion();
  const { preference, setPreference, accent, setAccent } = useThemeMode();
  const { viewMode, setViewMode } = useViewMode();
  const { density, setDensity } = useCardDensity();
  const sync = useSyncSources();
  // The Playnite card reflects whether its connection code has been used (#793).
  const { data: apiKeys } = useQuery({ queryKey: API_KEYS_QUERY_KEY, queryFn: apiKeysApi.list });
  const playniteKey = apiKeys?.keys
    .filter((k) => k.label === PLAYNITE_API_KEY_LABEL && !k.revokedAt)
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))[0];
  const { data: badges } = useQuery({ queryKey: ['me', 'badges'], queryFn: badgesApi.list });
  const [providers, setProviders] = useState<string[] | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
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

  async function changeVisibility(visibility: ProfileVisibility) {
    try {
      await authApi.setProfileVisibility(visibility);
      await refetch();
      ui.notify(PROFILE_VISIBILITY_TEXT[visibility].toast);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change who can see your profile');
    }
  }

  async function saveName() {
    if (nameDraft === null) return;
    try {
      await authApi.setDisplayName(nameDraft);
      await refetch();
      setNameDraft(null);
      ui.notify('Name updated');
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : 'Could not change your name');
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
    if (!ok) return;
    try {
      await authApi.logout();
    } finally {
      window.location.href = `${getBasePath()}/`;
    }
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
              {nameDraft === null ? (
                <span style={st('display:flex;align-items:center;gap:8px;min-width:0')}>
                  <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{user.displayName}</span>
                  <button type="button" aria-label="Change display name" title="Change display name" onClick={() => setNameDraft(user.displayName)} style={st('flex:none;width:28px;height:28px;border:none;border-radius:999px;background:var(--chip);color:var(--text2);font-size:14px;line-height:1')}>
                    ✎
                  </button>
                </span>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveName();
                  }}
                  style={st('display:flex;align-items:center;gap:6px')}
                >
                  <input autoFocus value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} aria-label="Display name" style={st('flex:1;min-width:0;height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:600 16px var(--font-ui)')} />
                  <Btn kind="accent" height={34} padX={12} fontSize={13} onClick={() => void saveName()}>Save</Btn>
                  <Btn height={34} padX={12} fontSize={13} onClick={() => setNameDraft(null)}>Cancel</Btn>
                </form>
              )}
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'} · {beaten} beaten
              </span>
            </div>
          </>
        }
      >
        {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

        <Group>
          {/* The whole row opens the profile. */}
          <button type="button" onClick={() => window.open(profileUrl, '_blank', 'noopener')} style={st(ROW_BASE)} className="hv-surf2">
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 15px var(--font-ui)')}>My profile</span>
              <span style={st('font:500 12.5px var(--font-mono);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{profileUrl.replace(/^https?:\/\//, '')}</span>
            </span>
            <span style={st('color:var(--muted);font-size:20px')}>›</span>
          </button>
        </Group>

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
        <ActionCard
          title="Sync Playnite"
          sub={
            playniteKey?.lastUsedAt
              ? `Last synced ${formatRelativeTime(playniteKey.lastUsedAt)}`
              : playniteKey
                ? 'Paste your connection code into Playnite to finish'
                : 'Epic, GOG, Xbox, PlayStation, Nintendo via the desktop app'
          }
          cta={playniteKey?.lastUsedAt ? 'Manage' : playniteKey ? 'Finish setup' : 'Set up'}
          accent={!!playniteKey?.lastUsedAt}
          onClick={open('playnite')}
        />

        <Section label="APPEARANCE">
          <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;border-radius:16px;background:var(--surf)')}>
            <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 15px var(--font-ui)')}>{t('core.settings.language')}</span>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('core.settings.language.sub')}</span>
            </span>
            <select
              value={language}
              aria-label={t('core.settings.language')}
              onChange={(e) => setLanguage(e.target.value as Language)}
              style={st('height:38px;padding:0 10px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font:500 14px var(--font-ui);outline:none')}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </div>
          <Segmented
            columns={3}
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'Auto' },
            ]}
          />
          <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>Accent</span>
          <Segmented
            columns={2}
            value={accent}
            onChange={setAccent}
            options={(Object.keys(ACCENT_LABELS) as Accent[]).map((k) => ({ value: k, label: ACCENT_LABELS[k] }))}
          />
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {accent === 'room' ? "A room's colour tints its background, buttons and logo. Settings and dialogs stay neutral." : 'Neutral buttons and highlights, whatever room you are in.'}
          </span>
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

        <Group>
          <NavRow
            label="Systems owned"
            sub={ownedPlatforms.length === 0 ? 'Every platform' : sortPlatforms(ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]).join(', ')}
            onClick={() => setSystemsOpen(true)}
          />
        </Group>

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
            <ActivitySharingRow />
            <AnalyticsConsentRow />
            <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 14px 14px 16px;background:var(--surf)')}>
              <span style={st('display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 15px var(--font-ui)')}>Who can see my profile</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{PROFILE_VISIBILITY_TEXT[profileVisibility].sub}</span>
              </span>
              <Segmented
                columns={3}
                value={profileVisibility}
                onChange={(v) => void changeVisibility(v)}
                options={[
                  { value: 'public', label: 'Public' },
                  { value: 'friends', label: 'Friends' },
                  { value: 'private', label: 'Private' },
                ]}
              />
            </div>
            {profileVisibility !== 'private' && (
              <>
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
            <NavRow label="Notifications" onClick={() => setNotifOpen(true)} />
            <NavRow label="API keys" onClick={() => setKeysOpen(true)} />
            <NavRow label="Play journal" onClick={() => { close(); ui.openDialog('journal', {}); }} />
            <NavRow label="Account history" onClick={() => setHistoryOpen(true)} />
          </Group>
        </Section>

        <Group>
          <NavRow label="What's new" onClick={open('changelog')} />
          <NavRow label="Report an issue" onClick={() => window.open(ISSUES_URL, '_blank', 'noopener')} />
          <NavRow label="Download my data" onClick={() => { window.location.href = `${getBasePath()}/api/me/export`; }} />
          <NavRow
            label="Run setup again"
            onClick={() => {
              close();
              rerunOnboarding();
            }}
          />
          <NavRow label="Sign out" onClick={signOut} />
        </Group>
        <button type="button" onClick={deleteAccount} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
          Delete my account
        </button>
        <button
          type="button"
          onClick={() => {
            ui.closeDialog('me');
            navigate('/privacy');
          }}
          style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 13px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
        >
          Privacy policy
        </button>
        <span style={st('font:500 11.5px var(--font-mono);color:var(--faint)')}>QueueUp{version ? ` ${version}` : ''}</span>
      </Dialog>
      {keysOpen && <ApiKeysDialog onClose={() => setKeysOpen(false)} />}
      {historyOpen && <AccountHistoryDialog onClose={() => setHistoryOpen(false)} />}
      {notifOpen && <NotificationsDialog onClose={() => setNotifOpen(false)} />}
      {systemsOpen && <SystemsDialog onClose={() => setSystemsOpen(false)} />}
    </>
  );
}
