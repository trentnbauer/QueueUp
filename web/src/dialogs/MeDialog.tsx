import { XBOX_STATUS_QUERY_KEY, xboxApi } from '../api/xbox';
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
import { LANGUAGES, rich, t as tr, useI18n, useT, type Language, type MessageKey } from '../i18n';
import { emailAlertLabel, priceRegionLabel } from '../i18n/labels';
import { rerunOnboarding } from '../shell/Onboarding';
import { st } from '../ui/st';
import { ACCENT_LABELS, type Accent } from '../theme/applyThemeMode';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
const PROVIDER_LABELS: Record<string, string> = { google: 'Google', discord: 'Discord', steam: 'Steam' };
/** A sign-in provider's name: brands as they are, single sign-on translated. */
const providerLabel = (p: string) => (p === 'oidc' ? tr('settings.me.provider.oidc') : (PROVIDER_LABELS[p] ?? p));
const ROW_BASE = 'display:flex;align-items:center;gap:12px;min-height:54px;padding:0 16px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%';
const ISSUES_URL = 'https://github.com/trentnbauer/QueueUp/issues/new/choose';

/** The line under "Who can see my profile", and the toast after changing it. */
const PROFILE_VISIBILITY_TEXT: Record<ProfileVisibility, { sub: MessageKey; toast: MessageKey }> = {
  public: { sub: 'settings.me.visibility.public.sub', toast: 'settings.me.visibility.public.toast' },
  friends: { sub: 'settings.me.visibility.friends.sub', toast: 'settings.me.visibility.friends.toast' },
  private: { sub: 'settings.me.visibility.private.sub', toast: 'settings.me.visibility.private.toast' },
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
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('settings.systems.title')} gap={14}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.systems.hint')}</span>
      <SystemsPicker
        onSaved={() => {
          ui.notify(t('settings.systems.saved'));
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
  const t = useT();
  const { data } = useQuery({ queryKey: ['activity-visibility'], queryFn: authApi.activityVisibility });
  const set = useMutation({
    mutationFn: authApi.setActivityVisibility,
    onSuccess: (res) => {
      queryClient.setQueryData(['activity-visibility'], res);
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      ui.notify(res.hidden ? t('settings.activity.hidden') : t('settings.activity.shown'));
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : t('settings.error.change')),
  });
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{t('settings.activity.title')}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.activity.sub')}</span>
      </span>
      <Toggle on={data ? !data.hidden : true} disabled={!data || set.isPending} onChange={(on) => set.mutate(!on)} label={t('settings.activity.title')} />
    </div>
  );
}

/** Google Analytics opt-in for this browser. Only shown when the server has a measurement id set. */
function AnalyticsConsentRow() {
  const ui = useUi();
  const t = useT();
  const { available, consent, setConsent } = useAnalyticsConsent();
  if (!available) return null;
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px 10px 16px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{t('settings.analytics.title')}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
          {t('settings.analytics.sub')}{' '}
          <a href={`${getBasePath()}/privacy`} target="_blank" rel="noopener" style={st('color:var(--accText)')}>
            {t('settings.analytics.privacy')}
          </a>
        </span>
      </span>
      <Toggle
        on={consent === 'granted'}
        onChange={(on) => {
          setConsent(on);
          ui.notify(on ? t('settings.analytics.on') : t('settings.analytics.off'));
        }}
        label={t('settings.analytics.title')}
      />
    </div>
  );
}

/** The address alert emails go to, with an edit box. A new address is confirmed from a link emailed to it. */
function AlertEmailRow() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const t = useT();
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
      ui.notify(res.status === 'confirmation_sent' ? t('settings.alertEmail.confirmSent') : t('settings.alertEmail.saved'));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('settings.alertEmail.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:16px;background:var(--surf)')}>
      <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.alertEmail.title')}</span>
      {draft === null ? (
        <div style={st('display:flex;align-items:center;gap:10px')}>
          <span style={st('flex:1;min-width:0;font:400 14px var(--font-ui);overflow-wrap:anywhere')}>{data.effectiveEmail}</span>
          <Btn kind="soft" height={34} padX={14} fontSize={12.5} onClick={() => setDraft(data.alertEmail ?? '')}>
            {t('settings.alertEmail.change')}
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
            aria-label={t('settings.alertEmail.title')}
            style={st(inputField, { flex: 1, minWidth: 0, height: 38 })}
          />
          <Btn kind="accent" height={38} padX={12} fontSize={13} disabled={saving} onClick={() => void save()}>
            {t('common.save')}
          </Btn>
          <Btn height={38} padX={12} fontSize={13} onClick={() => setDraft(null)}>
            {t('common.cancel')}
          </Btn>
        </form>
      )}
      {data.pending && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.alertEmail.pending', { email: data.pending })}</span>}
      <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
        {data.alertEmail ? t('settings.alertEmail.custom', { email: data.accountEmail }) : t('settings.alertEmail.default')}
      </span>
    </div>
  );
}

/** Which alerts you get: email (needs SMTP set up on the server) and, for the newer alert types, the bell. */
function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY, queryFn: notificationPreferencesApi.get });
  const [error, setError] = useState<string | null>(null);
  const set = useMutation({
    mutationFn: notificationPreferencesApi.set,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.notifications.saveFailed')),
  });
  // Only these can be hidden from the bell; the older types always show there.
  const canHideInApp = new Set(['feed_reaction', 'friend_recommendation', 'good_time_to_buy']);
  return (
    <Dialog onClose={onClose} title={t('settings.notifications.title')} gap={14}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      <AlertEmailRow />
      {data && !data.emailAvailable && (
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.notifications.noEmail')}</span>
      )}
      {data && data.emailAvailable && (
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>
          {t('settings.notifications.emailTo', { email: data.email })}
        </span>
      )}
      {isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
      <Group>
        {data?.preferences.map((p) => (
          <div key={p.type} style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>{emailAlertLabel(p.type)}</span>
            <div style={st('display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
              <span style={st('display:flex;align-items:center;gap:8px;font:500 13px var(--font-ui);color:var(--text2)')}>
                {t('settings.notifications.email')}
                <Toggle
                  on={p.email}
                  disabled={!data.emailAvailable || set.isPending}
                  label={t('settings.notifications.emailMe', { label: emailAlertLabel(p.type) })}
                  onChange={(v) => set.mutate({ type: p.type, email: v })}
                />
              </span>
              {canHideInApp.has(p.type) && (
                <span style={st('display:flex;align-items:center;gap:8px;font:500 13px var(--font-ui);color:var(--text2)')}>
                  {t('settings.notifications.inApp')}
                  <Toggle on={p.inApp} disabled={set.isPending} label={t('settings.notifications.showInApp', { label: emailAlertLabel(p.type) })} onChange={(v) => set.mutate({ type: p.type, inApp: v })} />
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
  const t = useT();
  const history = useInfiniteQuery({
    queryKey: ['account-events'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => authApi.accountEvents(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <Dialog onClose={onClose} title={t('settings.history.title')} gap={4}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);padding-bottom:8px')}>{t('settings.history.intro')}</span>
      {history.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
      {history.isError && <span style={st('font:400 13.5px var(--font-ui);color:var(--danger)')}>{t('settings.history.error')}</span>}
      {!history.isLoading && !history.isError && entries.length === 0 && (
        <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('settings.history.empty')}</span>
      )}
      {entries.map((e) => (
        <div key={e.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
          <span>{e.message}</span>
          <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(e.createdAt)}</span>
        </div>
      ))}
      {history.hasNextPage && (
        <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
          {history.isFetchingNextPage ? t('common.loading') : t('settings.loadMore')}
        </Btn>
      )}
    </Dialog>
  );
}

function ApiKeysDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const ui = useUi();
  const confirm = useConfirm();
  const t = useT();
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
    const ok = await confirm({ title: t('settings.apiKeys.revokeTitle', { label: keyLabel }), message: t('settings.apiKeys.revokeMessage'), confirmLabel: t('settings.apiKeys.revoke'), danger: true });
    if (ok) revoke.mutate(id);
  }
  const active = (data?.keys ?? []).filter((k) => !k.revokedAt);
  const err = create.error ?? revoke.error;

  return (
    <Dialog onClose={onClose} title={t('settings.apiKeys.title')} gap={14}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
        {rich(t('settings.apiKeys.intro'), { path: <code>/api/v1</code> })}
      </span>
      {err && <Banner>{err instanceof Error ? err.message : t('settings.apiKeys.error')}</Banner>}
      {fresh && (
        <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;background:var(--surf)')}>
          <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--text2)')}>{t('settings.apiKeys.copyNow')}</span>
          <div style={st('display:flex;align-items:center;gap:10px')}>
            <code style={st('flex:1;min-width:0;font:500 12.5px var(--font-mono);word-break:break-all')}>{fresh}</code>
            <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={async () => { await navigator.clipboard.writeText(fresh); ui.notify(t('settings.apiKeys.copied')); }}>
              {t('settings.apiKeys.copy')}
            </Btn>
          </div>
          <Btn kind="ghost" height={32} style={{ alignSelf: 'flex-start' }} onClick={() => setFresh(null)}>{t('common.done')}</Btn>
        </div>
      )}
      <div style={st('display:flex;gap:8px')}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && label.trim() && create.mutate(label.trim())}
          placeholder={t('settings.apiKeys.labelPlaceholder')}
          aria-label={t('settings.apiKeys.labelAria')}
          maxLength={100}
          style={st(inputField, { flex: 1, minWidth: 0 })}
        />
        <Btn kind="text" height={44} padX={16} weight={700} disabled={!label.trim() || create.isPending} onClick={() => create.mutate(label.trim())}>
          {create.isPending ? '…' : t('settings.apiKeys.generate')}
        </Btn>
      </div>
      {active.length > 0 ? (
        <Group>
          {active.map((k) => (
            <div key={k.id} style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 10px 8px 16px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{k.label}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                  {t('settings.apiKeys.created', { when: formatRelativeTime(k.createdAt) })} · {k.lastUsedAt ? t('settings.apiKeys.lastUsed', { when: formatRelativeTime(k.lastUsedAt) }) : t('settings.apiKeys.neverUsed')}
                </span>
              </span>
              <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={revoke.isPending && revoke.variables === k.id} onClick={() => void confirmRevoke(k.id, k.label)}>
                {t('settings.apiKeys.revoke')}
              </Btn>
            </div>
          ))}
        </Group>
      ) : (
        <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('settings.apiKeys.empty')}</span>
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
  // The Xbox card only shows when the server has an Xbox app set up.
  const { data: xboxStatus } = useQuery({ queryKey: XBOX_STATUS_QUERY_KEY, queryFn: xboxApi.status });
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
      title: t('settings.me.syncLibraries.confirmTitle'),
      message: t('settings.me.syncLibraries.confirmMessage', { sources: sync.linkedLabels.join(', ') }),
      confirmLabel: t('settings.me.sync'),
    });
    if (!ok) return;
    close();
    ui.notify(t('settings.me.syncLibraries.syncing'));
    await sync.syncLibraries();
    ui.notify(t('settings.me.syncLibraries.done'));
  }

  async function syncAchievements() {
    if (sync.busy) return;
    if (!sync.hasLinked) {
      sync.linkFirst();
      return;
    }
    close();
    ui.notify(t('settings.me.syncAchievements.checking'));
    await sync.syncAchievements();
  }

  async function unlink(provider: string) {
    const label = providerLabel(provider);
    const ok = await confirm({
      title: t('settings.me.unlink.title', { provider: label }),
      message: provider === 'steam' ? t('settings.me.unlink.steamMessage') : t('settings.me.unlink.message', { provider: label }),
      confirmLabel: t('settings.me.unlink'),
      danger: true,
    });
    if (!ok) return;
    setUnlinking(provider);
    try {
      await authApi.unlink(provider);
      await refetch();
      ui.notify(t('settings.me.unlink.done', { provider: label }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.me.unlink.failed', { provider: label }));
    } finally {
      setUnlinking(null);
    }
  }

  async function changeVisibility(visibility: ProfileVisibility) {
    try {
      await authApi.setProfileVisibility(visibility);
      await refetch();
      ui.notify(t(PROFILE_VISIBILITY_TEXT[visibility].toast));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.me.visibility.failed'));
    }
  }

  async function saveName() {
    if (nameDraft === null) return;
    try {
      await authApi.setDisplayName(nameDraft);
      await refetch();
      setNameDraft(null);
      ui.notify(t('settings.me.name.updated'));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('settings.me.name.failed'));
    }
  }

  async function saveSlug() {
    if (slugDraft === null) return;
    try {
      await authApi.setProfileSlug(slugDraft.trim() === '' ? null : slugDraft);
      await refetch();
      setSlugDraft(null);
      ui.notify(slugDraft.trim() === '' ? t('settings.me.slug.reset') : t('settings.me.slug.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.me.slug.failed'));
    }
  }

  async function signOut() {
    const ok = await confirm({ title: t('settings.me.signOut.title'), message: t('settings.me.signOut.message'), confirmLabel: t('settings.me.signOut') });
    if (!ok) return;
    try {
      await authApi.logout();
    } finally {
      window.location.href = `${getBasePath()}/`;
    }
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: t('settings.me.delete.title'),
      message: t('settings.me.delete.message'),
      confirmLabel: t('settings.me.delete.confirm'),
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    try {
      await authApi.deleteAccount();
      window.location.href = `${getBasePath()}/`;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.me.delete.failed'));
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
                  <button type="button" aria-label={t('settings.me.name.change')} title={t('settings.me.name.change')} onClick={() => setNameDraft(user.displayName)} style={st('flex:none;width:28px;height:28px;border:none;border-radius:999px;background:var(--chip);color:var(--text2);font-size:14px;line-height:1')}>
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
                  <input autoFocus value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} aria-label={t('settings.me.name.aria')} style={st('flex:1;min-width:0;height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:600 16px var(--font-ui)')} />
                  <Btn kind="accent" height={34} padX={12} fontSize={13} onClick={() => void saveName()}>{t('common.save')}</Btn>
                  <Btn height={34} padX={12} fontSize={13} onClick={() => setNameDraft(null)}>{t('common.cancel')}</Btn>
                </form>
              )}
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {t(rooms.length === 1 ? 'settings.me.header.rooms.one' : 'settings.me.header.rooms.other', { n: rooms.length, beaten })}
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
              <span style={st('font:600 15px var(--font-ui)')}>{t('settings.me.profile')}</span>
              <span style={st('font:500 12.5px var(--font-mono);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{profileUrl.replace(/^https?:\/\//, '')}</span>
            </span>
            <span style={st('color:var(--muted);font-size:20px')}>›</span>
          </button>
        </Group>

        <Group>
          <NavRow
            label={t('settings.me.friends')}
            sub={[
              t(friends.friends.length === 1 ? 'settings.me.friends.count.one' : 'settings.me.friends.count.other', { n: friends.friends.length }),
              pendingFriends ? t(pendingFriends === 1 ? 'settings.me.friends.requests.one' : 'settings.me.friends.requests.other', { n: pendingFriends }) : '',
            ].filter(Boolean).join(' · ')}
            badge={pendingFriends} onClick={open('friends')} />
          {pending > 0 && <NavRow label={t('settings.me.needsReview')} sub={t('settings.me.needsReview.sub')} badge={pending} onClick={open('needsReview')} />}
          <NavRow label={t('settings.me.achievements')} sub={earned !== null ? t('settings.me.achievements.earned', { earned, total: total ?? 0 }) : t('settings.me.achievements.sub')} onClick={go('/achievements')} />
          <NavRow label={t('settings.me.insights')} sub={t('settings.me.insights.sub')} onClick={go('/insights')} />
          <NavRow label={t('settings.me.year')} sub={t('settings.me.year.sub')} onClick={go('/year')} />
          {user.isAdmin && <NavRow label={t('settings.me.admin')} sub={t('settings.me.admin.sub')} onClick={go('/admin')} />}
        </Group>

        <ActionCard
          title={t('settings.me.syncLibraries')}
          sub={!sync.hasLinked ? t('settings.me.syncLibraries.linkSteam') : sync.busy ? t('settings.me.syncLibraries.busy') : t('settings.me.syncLibraries.sub', { sources: sync.linkedLabels.join(', ') })}
          cta={!sync.hasLinked ? t('settings.me.link') : sync.busy ? '…' : t('settings.me.sync')}
          accent={sync.hasLinked}
          disabled={sync.busy}
          onClick={syncLibraries}
        />
        <ActionCard
          title={t('settings.me.syncAchievements')}
          sub={t('settings.me.syncAchievements.sub')}
          cta={t('settings.me.syncAchievements.check')}
          disabled={sync.busy}
          onClick={syncAchievements}
        />
        <ActionCard
          title={t('settings.me.playnite')}
          sub={
            playniteKey?.lastUsedAt
              ? t('settings.me.playnite.lastSynced', { when: formatRelativeTime(playniteKey.lastUsedAt) })
              : playniteKey
                ? t('settings.me.playnite.finishSub')
                : t('settings.me.playnite.sub')
          }
          cta={playniteKey?.lastUsedAt ? t('settings.me.playnite.manage') : playniteKey ? t('settings.me.playnite.finish') : t('settings.me.playnite.setUp')}
          accent={!!playniteKey?.lastUsedAt}
          onClick={open('playnite')}
        />
        {xboxStatus?.configured && (
          <ActionCard
            title={t('settings.me.xbox')}
            sub={
              xboxStatus.connected
                ? xboxStatus.lastSyncedAt
                  ? t('settings.xbox.lastSynced', { when: formatRelativeTime(xboxStatus.lastSyncedAt) })
                  : t('settings.xbox.neverSynced')
                : t('settings.me.xbox.sub')
            }
            cta={xboxStatus.connected ? t('settings.me.xbox.manage') : t('settings.me.xbox.link')}
            accent={xboxStatus.connected}
            onClick={open('xbox')}
          />
        )}

        <Section label={t('settings.me.appearance')}>
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
              { value: 'dark', label: t('settings.me.theme.dark') },
              { value: 'light', label: t('settings.me.theme.light') },
              { value: 'system', label: t('settings.me.theme.auto') },
            ]}
          />
          <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>{t('settings.me.accent')}</span>
          <Segmented
            columns={2}
            value={accent}
            onChange={setAccent}
            options={(Object.keys(ACCENT_LABELS) as Accent[]).map((k) => ({ value: k, label: t(`settings.me.accent.${k}`) }))}
          />
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {accent === 'room' ? t('settings.me.accent.roomHint') : t('settings.me.accent.monoHint')}
          </span>
          <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>{t('settings.me.layout')}</span>
          <Segmented
            columns={2}
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'list', label: t('settings.me.layout.list') },
              { value: 'artwork', label: t('settings.me.layout.covers') },
            ]}
          />
          {viewMode === 'artwork' && (
            <>
              <span style={st('font:500 13px var(--font-ui);color:var(--text2);margin-top:4px')}>{t('settings.me.density')}</span>
              <Segmented
                columns={2}
                value={density === 'small' ? 'small' : 'medium'}
                onChange={(v) => setDensity(v === 'small' ? 'small' : 'medium')}
                options={[
                  { value: 'medium', label: t('settings.me.density.two') },
                  { value: 'small', label: t('settings.me.density.three') },
                ]}
              />
            </>
          )}
        </Section>

        <Section label={t('settings.me.currency')}>
          <select
            value={region ?? ''}
            aria-label={t('settings.me.currency.aria')}
            onChange={(e) => setRegion((e.target.value || undefined) as PriceRegion | undefined)}
            style={st('height:48px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none')}
          >
            <option value="">{t('settings.me.currency.default')}</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {priceRegionLabel(r)}
              </option>
            ))}
          </select>
        </Section>

        <Group>
          <NavRow
            label={t('settings.systems.title')}
            sub={ownedPlatforms.length === 0 ? t('settings.systems.everyPlatform') : sortPlatforms(ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]).join(', ')}
            onClick={() => setSystemsOpen(true)}
          />
        </Group>

        {providers && providers.length > 0 && (
          <Section label={t('settings.me.signIn')}>
            <Group>
              {providers.map((p) => {
                const linked = linkedProviders.includes(p);
                const primary = p === primaryProvider;
                return (
                  <div key={p} style={st('display:flex;align-items:center;gap:12px;min-height:54px;padding:0 10px 0 16px;background:var(--surf)')}>
                    <span style={st('flex:1;font:600 15px var(--font-ui)')}>{providerLabel(p)}</span>
                    {primary ? (
                      <span style={st('font:500 12.5px var(--font-ui);color:var(--muted);padding-right:6px')}>{t('settings.me.signIn.primary')}</span>
                    ) : linked ? (
                      <Btn kind="soft" height={34} padX={14} fontSize={12.5} style={{ background: 'var(--chip)', color: 'var(--muted)' }} disabled={unlinking === p} onClick={() => unlink(p)}>
                        {t('settings.me.unlink')}
                      </Btn>
                    ) : (
                      <a href={authApi.linkUrl(p)} style={st('height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
                        {t('settings.me.link')}
                      </a>
                    )}
                  </div>
                );
              })}
            </Group>
          </Section>
        )}

        <Section label={t('settings.me.sharing')}>
          <Group>
            <ActivitySharingRow />
            <AnalyticsConsentRow />
            <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 14px 14px 16px;background:var(--surf)')}>
              <span style={st('display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{t('settings.me.visibility')}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t(PROFILE_VISIBILITY_TEXT[profileVisibility].sub)}</span>
              </span>
              <Segmented
                columns={3}
                value={profileVisibility}
                onChange={(v) => void changeVisibility(v)}
                options={[
                  { value: 'public', label: t('settings.me.visibility.public') },
                  { value: 'friends', label: t('settings.me.visibility.friends') },
                  { value: 'private', label: t('settings.me.visibility.private') },
                ]}
              />
            </div>
            {profileVisibility !== 'private' && (
              <>
                <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 10px 12px 16px;background:var(--surf)')}>
                  <span style={st('display:flex;flex-direction:column;gap:1px')}>
                    <span style={st('font:600 15px var(--font-ui)')}>{t('settings.me.slug')}</span>
                    <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.me.slug.sub')}</span>
                  </span>
                  <div style={st('display:flex;align-items:center;gap:8px')}>
                    <span style={st('font:500 12.5px var(--font-mono);color:var(--muted)')}>/u/</span>
                    <input
                      value={slugDraft ?? profileSlug ?? ''}
                      onChange={(e) => setSlugDraft(e.target.value)}
                      placeholder={t('settings.me.slug.placeholder')}
                      aria-label={t('settings.me.slug.aria')}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      style={st(inputField, { flex: 1, minWidth: 0, height: 38, fontFamily: 'var(--font-mono)', fontSize: 13.5 })}
                    />
                    {slugDraft !== null && slugDraft !== (profileSlug ?? '') && (
                      <Btn kind="text" height={38} padX={14} fontSize={12.5} weight={700} onClick={saveSlug}>
                        {t('common.save')}
                      </Btn>
                    )}
                  </div>
                </div>
              </>
            )}
            <NavRow label={t('settings.notifications.title')} onClick={() => setNotifOpen(true)} />
            <NavRow label={t('settings.apiKeys.title')} onClick={() => setKeysOpen(true)} />
            <NavRow label={t('settings.me.journal')} onClick={() => { close(); ui.openDialog('journal', {}); }} />
            <NavRow label={t('settings.history.title')} onClick={() => setHistoryOpen(true)} />
          </Group>
        </Section>

        <Group>
          <NavRow label={t('settings.me.whatsNew')} onClick={open('changelog')} />
          <NavRow label={t('settings.me.reportIssue')} onClick={() => window.open(ISSUES_URL, '_blank', 'noopener')} />
          <NavRow label={t('settings.me.download')} onClick={() => { window.location.href = `${getBasePath()}/api/me/export`; }} />
          <NavRow
            label={t('settings.me.rerunSetup')}
            onClick={() => {
              close();
              rerunOnboarding();
            }}
          />
          <NavRow label={t('settings.me.signOut')} onClick={signOut} />
        </Group>
        <button type="button" onClick={deleteAccount} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
          {t('settings.me.delete.confirm')}
        </button>
        <button
          type="button"
          onClick={() => {
            ui.closeDialog('me');
            navigate('/privacy');
          }}
          style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 13px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
        >
          {t('settings.me.privacy')}
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
