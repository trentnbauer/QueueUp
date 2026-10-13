import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, sortPlatforms } from '@queueup/shared';
import { authApi } from '../api/auth';
import { gamesApi } from '../api/games';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { AiSettingsForm } from '../dialogs/AiSettingsDialog';
import { AvatarPicker } from '../dialogs/AvatarPicker';
import { LibrarySources } from '../dialogs/ImportDialogs';
import {
  AccountHistoryDialog,
  ApiKeysDialog,
  AppearanceSettings,
  ComputerSpecsDialog,
  CurrencyRow,
  NavRow,
  NotificationSettings,
  ProfileSettings,
  Section,
  SignInMethods,
  SyncButton,
  SystemsDialog,
} from '../dialogs/SettingsParts';
import { MergedGamesList } from '../home/MergedGamesList';
import { PendingImportsList } from '../home/PendingImportsList';
import { useAiActivity } from '../hooks/useAiActivity';
import { useLibraryCleanupCount } from '../hooks/usePendingImports';
import { useSyncSources } from '../hooks/useSyncSources';
import { useVersion } from '../hooks/useVersion';
import { rerunOnboarding } from '../shell/Onboarding';
import { Dialog } from '../ui/Dialog';
import { Avatar, Btn, Group } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { getBasePath } from '../utils/basePath';
import { clearAppCache } from '../utils/clearAppCache';
import { PageShell } from './PageShell';

export const SETTINGS_SECTIONS = ['account', 'privacy', 'libraries', 'preferences', 'notifications', 'ai', 'data', 'help'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
const isSection = (v: string | undefined): v is SettingsSection => SETTINGS_SECTIONS.includes(v as SettingsSection);

const SECTION_LABELS: Record<SettingsSection, MessageKey> = {
  account: 'settings.page.section.account',
  privacy: 'settings.page.section.privacy',
  libraries: 'settings.page.section.libraries',
  preferences: 'settings.page.section.preferences',
  notifications: 'settings.page.section.notifications',
  ai: 'settings.page.section.ai',
  data: 'settings.page.section.data',
  help: 'settings.page.section.help',
};

const ISSUES_URL = 'https://github.com/trentnbauer/QueueUp/issues/new/choose';

/** Settings (`/settings/:section`): everything about the account, libraries and how QueueUp looks,
 * one section at a time beside a sub-nav. On phones the sub-nav is the page at `/settings`, and a
 * section opens on its own with a back button. */
export function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const { section: raw } = useParams();

  if (raw !== undefined && !isSection(raw)) return <Navigate to="/settings" replace />;
  // Desktop always shows a section; phones show the list until one is picked.
  if (raw === undefined && !mobile) return <Navigate to="/settings/account" replace />;

  if (mobile) {
    if (raw === undefined) {
      return (
        <PageShell title={t('settings.page.title')} hint={t('settings.page.hint')} back={false}>
          <SettingsNav onPick={(s) => navigate(`/settings/${s}`)} />
        </PageShell>
      );
    }
    return (
      <PageShell title={t(SECTION_LABELS[raw])} backLabel={t('settings.page.title')} to="/settings">
        <SectionBody section={raw} />
      </PageShell>
    );
  }

  const section = raw as SettingsSection;
  return (
    <PageShell title={t('settings.page.title')} hint={t('settings.page.hint')} back={false}>
      <div style={st('display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start')}>
        <div style={st('flex:0 0 220px;margin-left:-10px')}>
          <SettingsNav active={section} onPick={(s) => navigate(`/settings/${s}`, { replace: true })} />
        </div>
        <div style={st('flex:1 1 420px;max-width:640px;min-width:0;display:flex;flex-direction:column;gap:22px')}>
          <h2 style={st('margin:0;font:700 24px/1.1 var(--font-display);letter-spacing:-0.02em')}>{t(SECTION_LABELS[section])}</h2>
          <SectionBody section={section} />
        </div>
      </div>
    </PageShell>
  );
}

/** The section list, with the Libraries cleanup badge and, for administrators, a way to the
 * Administrator page. */
function SettingsNav({ active, onPick }: { active?: SettingsSection; onPick: (s: SettingsSection) => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const cleanup = useLibraryCleanupCount();
  return (
    <nav aria-label={t('settings.page.title')} style={st('display:flex;flex-direction:column;gap:2px')}>
      {SETTINGS_SECTIONS.map((s) => {
        const on = s === active;
        const badge = s === 'libraries' ? cleanup.total : 0;
        return (
          <button
            key={s}
            type="button"
            className="hv-surf"
            aria-current={on ? 'page' : undefined}
            onClick={() => onPick(s)}
            style={st(
              `display:flex;align-items:center;gap:10px;min-height:42px;padding:0 12px;border:none;border-radius:12px;background:${on ? 'var(--surf)' : 'transparent'};color:var(--text);font:${on ? 700 : 600} 14.5px var(--font-ui);text-align:left`,
            )}
          >
            <span style={st('flex:1;min-width:0')}>{t(SECTION_LABELS[s])}</span>
            {badge > 0 && (
              <span style={st('min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 11px var(--font-ui);display:flex;align-items:center;justify-content:center')}>{badge}</span>
            )}
          </button>
        );
      })}
      {user?.isAdmin && (
        <>
          <div style={st('height:1px;background:var(--chip);margin:10px 12px')} />
          <button
            type="button"
            className="hv-surf"
            onClick={() => navigate('/admin')}
            style={st('display:flex;align-items:center;gap:6px;min-height:42px;padding:0 12px;border:none;border-radius:12px;background:transparent;color:var(--muted);font:500 14px var(--font-ui);text-align:left')}
          >
            {t('settings.page.admin')} <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
    </nav>
  );
}

function SectionBody({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'account':
      return <AccountSection />;
    case 'privacy':
      return <ProfileSettings />;
    case 'libraries':
      return <LibrariesSection />;
    case 'preferences':
      return <PreferencesSection />;
    case 'notifications':
      return <NotificationSettings />;
    case 'ai':
      return <AiSection />;
    case 'data':
      return <DataSection />;
    case 'help':
      return <HelpSection />;
  }
}

/** Name and picture, sign-in methods, sign out and delete. */
function AccountSection() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const { user, refetch } = useAuth();
  const { rooms } = useScope();
  // "N beaten" is about your own shelf, whichever room was last open behind this page. Same query
  // (and cache) as the shelf's own list.
  const { region } = useCurrencyRegion();
  const shelf = useQuery({ queryKey: ['games', 'shelf', region], queryFn: () => gamesApi.shelf(region) });
  const games = shelf.data?.games ?? [];
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    authApi.providers().then(({ providers }) => setProviders(providers)).catch(() => setProviders([]));
  }, []);

  if (!user) return null;
  const beaten = games.filter((g) => g.status === 'done' || g.status === 'replay').length;

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
      ui.showError(e instanceof Error ? e.message : t('settings.me.delete.failed'));
    }
  }

  return (
    <>
      <div style={st('display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px;border-radius:18px;background:var(--surf)')}>
        <Avatar name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={52} fontSize={20} />
        <div style={st('flex:1;min-width:160px;display:flex;flex-direction:column;gap:2px')}>
          {nameDraft === null ? (
            <span style={st('display:flex;align-items:center;gap:8px;min-width:0')}>
              <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{user.displayName}</span>
              <button
                type="button"
                aria-label={t('settings.me.name.change')}
                title={t('settings.me.name.change')}
                onClick={() => setNameDraft(user.displayName)}
                style={st('flex:none;width:28px;height:28px;border:none;border-radius:999px;background:var(--chip);color:var(--text2);font-size:14px;line-height:1')}
              >
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
              <input autoFocus value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} aria-label={t('settings.me.name.aria')} style={st('flex:1;min-width:0;height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:600 16px var(--font-ui)')} />
              <Btn kind="accent" height={34} padX={12} fontSize={13} onClick={() => void saveName()}>
                {t('common.save')}
              </Btn>
              <Btn height={34} padX={12} fontSize={13} onClick={() => setNameDraft(null)}>
                {t('common.cancel')}
              </Btn>
            </form>
          )}
          <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
            {t(rooms.length === 1 ? 'settings.me.header.rooms.one' : 'settings.me.header.rooms.other', { n: rooms.length, beaten })}
          </span>
        </div>
        <Btn kind="soft" height={36} padX={14} fontSize={13} onClick={() => setAvatarOpen(true)}>
          {t('settings.page.changePicture')}
        </Btn>
      </div>
      {providers && providers.length > 0 && (
        <Section label={t('settings.me.signIn')}>
          <SignInMethods providers={providers} />
        </Section>
      )}
      <Group>
        <NavRow label={t('settings.me.signOut')} onClick={signOut} />
      </Group>
      <button type="button" onClick={deleteAccount} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
        {t('settings.me.delete.confirm')}
      </button>
      {avatarOpen && <AvatarPicker onClose={() => setAvatarOpen(false)} />}
    </>
  );
}

/** Sync everything, every source, and the cleanup lists (needs matching, duplicates, dismissed, merged). */
function LibrariesSection() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const sync = useSyncSources();
  const cleanup = useLibraryCleanupCount();
  const scanningDuplicates = useAiActivity('duplicates');
  const [list, setList] = useState<'dismissed' | 'merged' | null>(null);

  // One button for both: new games and wishlist items from every linked library, then trophies and
  // achievements (when a linked source has them) - the same order the automatic sync uses.
  async function syncAll() {
    if (sync.busy || !sync.hasLinked) return;
    const ok = await confirm({
      title: t('settings.me.syncAll.confirmTitle'),
      message: t(sync.hasAchievementSource ? 'settings.me.syncAll.confirmMessage' : 'settings.me.syncLibraries.confirmMessage', { sources: sync.linkedLabels.join(', ') }),
      confirmLabel: t('settings.me.sync'),
    });
    if (!ok) return;
    ui.notify(t('settings.me.syncAll.syncing'));
    const { failed, skipped } = await sync.syncLibraries();
    // Each failure is also in the person's notifications, with the reason.
    const parts = [
      failed.length > 0 ? t('settings.me.syncLibraries.someFailed', { sources: failed.join(', ') }) : t('settings.me.syncLibraries.done'),
      skipped.length > 0 ? t('settings.me.syncLibraries.skipped', { sources: skipped.join(', ') }) : '',
    ];
    ui.notify(parts.filter(Boolean).join(' '));
    if (sync.hasAchievementSource) {
      ui.notify(t('settings.me.syncAchievements.checking'));
      await sync.syncAchievements();
    }
  }

  return (
    <>
      {sync.hasLinked && (
        <div style={st('display:flex')}>
          <SyncButton label={t('settings.me.syncAll')} accent disabled={sync.busy} onClick={() => void syncAll()} />
        </div>
      )}
      <Section label={t('settings.page.libraries.sources')}>
        <LibrarySources />
      </Section>
      <Section label={t('settings.page.libraries.cleanup')}>
        <Group>
          <NavRow label={t('settings.page.libraries.matching')} sub={t('settings.page.libraries.matching.sub')} badge={cleanup.pending} onClick={() => ui.openDialog('needsReview')} />
          <NavRow
            label={t('settings.page.libraries.duplicates')}
            sub={scanningDuplicates ? t('settings.me.duplicates.scanning') : t('settings.page.libraries.duplicates.sub')}
            badge={cleanup.duplicates}
            onClick={() => ui.openDialog('duplicates')}
          />
          <NavRow label={t('settings.page.libraries.dismissed')} sub={t('settings.page.libraries.dismissed.sub')} onClick={() => setList('dismissed')} />
          <NavRow label={t('settings.page.libraries.merged')} sub={t('settings.page.libraries.merged.sub')} onClick={() => setList('merged')} />
        </Group>
      </Section>
      {list && (
        <Dialog onClose={() => setList(null)} title={t(list === 'dismissed' ? 'settings.page.libraries.dismissed' : 'settings.page.libraries.merged')} height="tall" gap={14}>
          {list === 'dismissed' ? <PendingImportsList kind="dismissed" /> : <MergedGamesList />}
        </Dialog>
      )}
    </>
  );
}

/** Appearance, then currency, systems owned and the computer you play on. */
function PreferencesSection() {
  const t = useT();
  const { ownedPlatforms } = useAuth();
  const specs = useQuery({ queryKey: ['computer-specs'], queryFn: authApi.computerSpecs });
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  return (
    <>
      <Section label={t('settings.me.appearance')}>
        <AppearanceSettings />
      </Section>
      <Section label={t('settings.me.section.regional')}>
        <Group>
          <CurrencyRow />
          <NavRow
            label={t('settings.systems.title')}
            sub={ownedPlatforms.length === 0 ? t('settings.systems.everyPlatform') : sortPlatforms(ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]).join(', ')}
            onClick={() => setSystemsOpen(true)}
          />
          <NavRow
            label={t('settings.specs.title')}
            sub={[specs.data?.gpu, specs.data?.cpu, specs.data?.ramGb ? `${specs.data.ramGb} GB` : null].filter(Boolean).join(' · ') || t('settings.specs.sub')}
            onClick={() => setSpecsOpen(true)}
          />
        </Group>
      </Section>
      {systemsOpen && <SystemsDialog onClose={() => setSystemsOpen(false)} />}
      {specsOpen && <ComputerSpecsDialog onClose={() => setSpecsOpen(false)} />}
    </>
  );
}

/** Your AI providers, edited right here: the first one plus backups tried in order. */
function AiSection() {
  return <AiSettingsForm />;
}

function DataSection() {
  const t = useT();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  /** Forgets everything this device has stored for the app, then reloads so the latest version loads fresh. Nothing on your account changes. */
  async function wipeCache() {
    const ok = await confirm({ title: t('settings.page.data.clearCache.title'), message: t('settings.page.data.clearCache.message'), confirmLabel: t('settings.page.data.clearCache.confirm') });
    if (!ok) return;
    queryClient.clear();
    await clearAppCache();
    window.location.reload();
  }

  return (
    <>
      <Group>
        <NavRow label={t('settings.apiKeys.title')} sub={t('settings.page.data.apiKeys.sub')} onClick={() => setKeysOpen(true)} />
        <NavRow
          label={t('settings.me.download')}
          sub={t('settings.page.data.download.sub')}
          onClick={() => {
            window.location.href = `${getBasePath()}/api/me/export`;
          }}
        />
        <NavRow label={t('settings.history.title')} sub={t('settings.page.data.history.sub')} onClick={() => setHistoryOpen(true)} />
        <NavRow label={t('settings.page.data.clearCache')} sub={t('settings.page.data.clearCache.sub')} onClick={() => void wipeCache()} />
      </Group>
      {keysOpen && <ApiKeysDialog onClose={() => setKeysOpen(false)} />}
      {historyOpen && <AccountHistoryDialog onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

function HelpSection() {
  const t = useT();
  const ui = useUi();
  const navigate = useNavigate();
  const { version } = useVersion();
  const rows: { label: string; onClick: () => void }[] = [
    { label: t('settings.me.whatsNew'), onClick: () => ui.openDialog('changelog') },
    { label: t('settings.me.reportIssue'), onClick: () => window.open(ISSUES_URL, '_blank', 'noopener') },
    { label: t('settings.me.rerunSetup'), onClick: () => rerunOnboarding() },
    { label: t('settings.me.privacy'), onClick: () => navigate('/privacy') },
    { label: t('settings.page.help.terms'), onClick: () => navigate('/terms') },
  ];
  return (
    <>
      <Group>
        {rows.map((r) => (
          <NavRow key={r.label} label={r.label} onClick={r.onClick} />
        ))}
      </Group>
      <span style={st('font:500 11.5px var(--font-mono);color:var(--faint)')}>QueueUp{version ? ` ${version}` : ''}</span>
    </>
  );
}
