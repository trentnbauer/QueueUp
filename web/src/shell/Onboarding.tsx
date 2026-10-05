import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { EXOPHASE_STATUS_QUERY_KEY, exophaseApi } from '../api/exophase';
import { XBOX_STATUS_QUERY_KEY, xboxApi } from '../api/xbox';
import { PSN_STATUS_QUERY_KEY, psnApi } from '../api/psn';
import {
  ALERT_EMAIL_QUERY_KEY,
  NOTIFICATION_PREFERENCES_QUERY_KEY,
  alertEmailApi,
  notificationPreferencesApi,
} from '../api/notificationPreferences';
import { PRICE_REGION_LABELS, type EmailAlertType, type PriceRegion } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { LANGUAGES, useI18n, type MessageKey } from '../i18n';
import { priceRegionLabel } from '../i18n/labels';
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';
import { useCardDensity } from '../context/CardDensityContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useThemeMode } from '../context/ThemeModeContext';
import { useUi } from '../context/UiContext';
import { useViewMode } from '../context/ViewModeContext';
import { resolveThemeMode, type Accent, type ThemePreference } from '../theme/applyThemeMode';
import { getBasePath } from '../utils/basePath';
import { Toggle, inputPill } from '../ui/primitives';
import { LIBRARY_BRAND, LibraryLogo, type LibraryKind } from '../ui/LibraryLogo';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
type StepKind = 'language' | 'name' | 'theme' | 'layout' | 'currency' | 'systems' | 'library' | 'email' | 'analytics' | 'accent' | 'rooms';
/** Each step's title and sub, as `shell.onboarding.<kind>.title` / `.sub` keys. */
const stepText = (t: (key: MessageKey) => string, kind: Exclude<StepKind, 'language'>): [string, string] => [
  t(`shell.onboarding.${kind}.title` as MessageKey),
  t(`shell.onboarding.${kind}.sub` as MessageKey),
];

/** The alerts offered during sign-up, and which start switched on. Everything else stays in Settings. */
const EMAIL_CHOICES: { type: EmailAlertType; label: MessageKey; on: boolean }[] = [
  { type: 'price_drop', label: 'shell.onboarding.emailChoice.priceDrop', on: true },
  { type: 'good_time_to_buy', label: 'shell.onboarding.emailChoice.goodTimeToBuy', on: true },
  { type: 'play_together_request', label: 'shell.onboarding.emailChoice.playTogether', on: true },
  { type: 'friend_recommendation', label: 'shell.onboarding.emailChoice.friendRecommendation', on: false },
  { type: 'feed_reaction', label: 'shell.onboarding.emailChoice.feedReaction', on: false },
  { type: 'release_watch', label: 'shell.onboarding.emailChoice.releaseWatch', on: false },
];

// Sign-in providers that gave us no real email use one of these placeholder domains.
const isPlaceholderEmail = (email: string) => ['steamcommunity.unknown', 'discord.unknown'].includes(email.toLowerCase().split('@')[1] ?? '');
const STORES = ['Steam', 'Epic', 'GOG', 'Xbox', 'PlayStation', 'Nintendo'];

const RERUN_EVENT = 'queueup:rerun-onboarding';

/** Opens the first-run flow again (Settings > "Run setup again"); App listens for this. */
export function rerunOnboarding(): void {
  window.dispatchEvent(new Event(RERUN_EVENT));
}

/** Subscribes to rerunOnboarding() requests; returns the unsubscribe. */
export function onRerunOnboarding(listener: () => void): () => void {
  window.addEventListener(RERUN_EVENT, listener);
  return () => window.removeEventListener(RERUN_EVENT, listener);
}

/** A screenshot of the app, from web/public/onboarding (captured from a real shelf and room). */
const shot = (name: string) => `${getBasePath()}/onboarding/${name}.jpg`;

/** One option in a picture picker: a screenshot, a label, and a ring when it's the current choice. */
function ChoiceCard({ selected, label, sub, onClick, children }: { selected: boolean; label: string; sub?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={st(
        `min-width:0;display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:20px;border:none;background:var(--surf);color:var(--text);text-align:left;box-shadow:${selected ? '0 0 0 2px var(--acc)' : '0 0 0 1px var(--line)'}`,
      )}
    >
      <span style={st('position:relative;display:block;aspect-ratio:390/600;border-radius:13px;overflow:hidden;background:var(--chip)')}>{children}</span>
      <span style={st('display:flex;align-items:center;gap:8px;padding:0 4px 2px')}>
        <span
          aria-hidden
          style={st(`width:18px;height:18px;flex-shrink:0;border-radius:50%;border:2px solid ${selected ? 'var(--acc)' : 'var(--line)'};display:flex;align-items:center;justify-content:center`)}
        >
          {selected && <span style={st('width:8px;height:8px;border-radius:50%;background:var(--acc)')} />}
        </span>
        <span style={st('min-width:0;display:flex;flex-direction:column;gap:1px')}>
          <span style={st('font:600 14px var(--font-ui)')}>{label}</span>
          {sub && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{sub}</span>}
        </span>
      </span>
    </button>
  );
}

function Shot({ name, alt }: { name: string; alt: string }) {
  return <img src={shot(name)} alt={alt} loading="lazy" style={st('position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top')} />;
}

function ChoiceGrid({ columns, label, children }: { columns: number; label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} style={st(`flex-shrink:0;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:12px`)}>
      {children}
    </div>
  );
}

const EXOPHASE_STORES = ['PlayStation', 'Xbox', 'Steam', 'Epic', 'GOG', 'Switch'];

/** A large "recommended" option on the library step: an icon, what it is, the stores it covers and a button. */
function HeroCard({ hue, iconBackground, icon, name, tag, blurb, chips, cta, linked, onClick }: { hue: number; iconBackground?: string; icon: ReactNode; name: string; tag: string; blurb: string; chips: string[]; cta: string; linked?: boolean; onClick: () => void }) {
  return (
    <div style={st(`flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:linear-gradient(150deg, oklch(0.55 0.2 ${hue} / 0.28), var(--surf) 70%);border:1px solid oklch(0.55 0.2 ${hue} / 0.35)`)}>
      <div style={st('display:flex;align-items:center;gap:14px')}>
        <span style={st(`position:relative;width:56px;height:56px;flex-shrink:0;border-radius:16px;background:${iconBackground ?? `oklch(0.55 0.2 ${hue})`};color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;font:800 22px var(--font-display)`)}>
          {icon}
          {linked && (
            <span style={st('position:absolute;right:-4px;bottom:-4px;width:22px;height:22px;border-radius:50%;background:var(--mint);color:#fff;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;font:800 11px var(--font-ui)')}>✓</span>
          )}
        </span>
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
          <span style={st('font:700 19px var(--font-display)')}>{name}</span>
          <span style={st('font:500 12.5px var(--font-ui);color:var(--text2)')}>{tag}</span>
        </span>
      </div>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{blurb}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
        {chips.map((c) => (
          <span key={c} style={st('height:26px;padding:0 10px;border-radius:999px;background:oklch(1 0 0 / 0.08);font:600 11.5px var(--font-ui);color:var(--text2);display:flex;align-items:center')}>{c}</span>
        ))}
      </div>
      <button type="button" onClick={onClick} style={st('margin-top:auto;height:50px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}>
        {cta}
      </button>
    </div>
  );
}

/** A small "connect directly" tile (Steam, Xbox) on the library step. */
function DirectTile({ kind, linked, caption, disabled, onClick }: { kind: LibraryKind; linked: boolean; caption: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={`${LIBRARY_BRAND[kind].name}: ${caption}`} style={st('width:84px;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;border:none;background:none;color:var(--text)')}>
      <span style={st(`position:relative;width:64px;height:64px;border-radius:18px;background:${LIBRARY_BRAND[kind].background};color:#fff;display:flex;align-items:center;justify-content:center`)}>
        <LibraryLogo kind={kind} size={34} />
        {linked && (
          <span style={st('position:absolute;right:-4px;bottom:-4px;width:22px;height:22px;border-radius:50%;background:var(--mint);color:#fff;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;font:800 11px var(--font-ui)')}>✓</span>
        )}
      </span>
      <span style={st('font:600 12px/1.25 var(--font-ui);text-align:center')}>{caption}</span>
    </button>
  );
}

/** First-run flow: language, name, look, currency, systems, library import, email, room colours, rooms, then
 * the usage-stats question. Full screen; dialogs it opens (Playnite,
 * rooms) stack above it. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const ui = useUi();
  const { user, steamLinked, refetch } = useAuth();
  const { region, setRegion } = useCurrencyRegion();
  const { preference, setPreference, accent, setAccent } = useThemeMode();
  const { viewMode, setViewMode } = useViewMode();
  const { density, setDensity } = useCardDensity();
  // Screenshots match the theme in use, so the layout and colour pictures look like what you'll get.
  const tone = resolveThemeMode(preference);
  const steam = useSteamImportContext();
  const queryClient = useQueryClient();
  // The email step only appears when this server can send email.
  const prefs = useQuery({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY, queryFn: notificationPreferencesApi.get });
  const alertEmail = useQuery({ queryKey: ALERT_EMAIL_QUERY_KEY, queryFn: alertEmailApi.get });
  const analytics = useAnalyticsConsent();
  const exophase = useQuery({ queryKey: EXOPHASE_STATUS_QUERY_KEY, queryFn: exophaseApi.status });
  const psn = useQuery({ queryKey: PSN_STATUS_QUERY_KEY, queryFn: psnApi.status });
  // The Xbox tile only shows when the server has an Xbox app set up.
  const xbox = useQuery({ queryKey: XBOX_STATUS_QUERY_KEY, queryFn: xboxApi.status });
  const { language, setLanguage, t } = useI18n();
  const kinds: StepKind[] = [
    // Language comes first (#776), so everything after it is in the language they picked.
    'language',
    'name',
    'theme',
    // Room colours belong with the look of the app, so they follow the theme (#867).
    'accent',
    'layout',
    'currency',
    'systems',
    'library',
    ...(prefs.data?.emailAvailable ? (['email'] as const) : []),
    'rooms',
    // Always the very last step (#795), and only when the operator has set a Google Analytics id.
    ...(analytics.available ? (['analytics'] as const) : []),
  ];
  const [step, setStep] = useState(0);
  const [wantEmail, setWantEmail] = useState(false);
  const [shareStats, setShareStats] = useState(analytics.consent === 'granted');
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [emailTypes, setEmailTypes] = useState<Set<EmailAlertType>>(new Set(EMAIL_CHOICES.filter((c) => c.on).map((c) => c.type)));
  const [emailError, setEmailError] = useState<string | null>(null);
  // Prefilled from the sign-in provider's profile (or whatever the account already has).
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const kind = kinds[Math.min(step, kinds.length - 1)];
  const last = step >= kinds.length - 1;
  const [title, sub] = kind === 'language' ? [t('core.onboarding.language.title'), t('core.onboarding.language.sub')] : stepText(t, kind);
  const effectiveEmail = alertEmail.data?.effectiveEmail ?? '';
  const shownEmail = emailDraft ?? (isPlaceholderEmail(effectiveEmail) ? '' : effectiveEmail);

  /** Saves the name (only if it changed) and moves on; stays put with an inline error if it's rejected. */
  async function next() {
    if (savingName) return;
    if (kind === 'email' && wantEmail) {
      const address = shownEmail.trim().toLowerCase();
      if (!address) {
        setEmailError(t('shell.onboarding.email.enterAddress'));
        return;
      }
      setSavingName(true);
      try {
        if (address !== effectiveEmail.toLowerCase()) {
          const res = await alertEmailApi.set({ email: address });
          if (res.status === 'confirmation_sent') ui.notify(t('shell.onboarding.email.checkInbox'));
        }
        await Promise.all([...emailTypes].map((type) => notificationPreferencesApi.set({ type, email: true })));
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ALERT_EMAIL_QUERY_KEY });
        setEmailError(null);
      } catch (e) {
        setEmailError(e instanceof Error ? e.message : t('shell.onboarding.email.saveFailed'));
        return;
      } finally {
        setSavingName(false);
      }
    }
    // Recorded either way on Next, so the answer is "no" unless they turned it on.
    if (kind === 'analytics') analytics.setConsent(shareStats);
    if (kind === 'name') {
      const trimmed = name.trim().replace(/\s+/g, ' ');
      if (trimmed.length < 1 || trimmed.length > 40) {
        setNameError(t('shell.onboarding.name.length'));
        return;
      }
      if (trimmed !== user?.displayName) {
        setSavingName(true);
        try {
          await authApi.setDisplayName(trimmed);
          await refetch();
        } catch (e) {
          setNameError(e instanceof Error ? e.message : t('shell.onboarding.name.saveFailed'));
          return;
        } finally {
          setSavingName(false);
        }
      }
      setNameError(null);
    }
    if (last) onDone();
    else setStep(step + 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.onboarding.welcome')}
      style={st('position:fixed;inset:0;z-index:50;background:var(--bg);color:var(--text);display:flex;flex-direction:column')}
    >
      <div style={st('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:18px 20px 8px')}>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} aria-label={t('common.back')} style={st('width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:20px;line-height:1;padding:0 0 2px')}>
            ‹
          </button>
        )}
        <div style={st('flex:1;display:flex;gap:6px')}>
          {kinds.map((_, i) => (
            <span key={i} style={st(`flex:1;height:4px;border-radius:999px;background:${i <= step ? 'var(--acc)' : 'var(--chip)'}`)} />
          ))}
        </div>
        <button type="button" onClick={onDone} style={st('height:38px;padding:0 6px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
          {t('common.skip')}
        </button>
      </div>
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:28px 22px 20px;display:flex;flex-direction:column;gap:16px;width:100%;max-width:560px;margin:0 auto')}>
        <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('shell.onboarding.stepOf', { n: step + 1, total: kinds.length })}</span>
        <span style={st('flex-shrink:0;font:700 30px/1.08 var(--font-display);letter-spacing:-0.025em;text-wrap:balance')}>{title}</span>
        <span style={st('flex-shrink:0;font:400 15px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{sub}</span>

        {kind === 'language' && (
          <div role="radiogroup" aria-label={t('core.settings.language')} style={st('flex-shrink:0;display:flex;flex-direction:column;gap:1px;border-radius:20px;overflow:hidden;background:var(--chip)')}>
            {LANGUAGES.map((l) => {
              const on = language === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  lang={l.code}
                  onClick={() => setLanguage(l.code)}
                  style={st('display:flex;align-items:center;gap:14px;min-height:62px;padding:0 18px;border:none;background:var(--surf);color:var(--text);text-align:left')}
                >
                  <span style={st('flex:1;display:flex;flex-direction:column;gap:2px')}>
                    <span style={st('font:600 16px var(--font-ui)')}>{l.nativeName}</span>
                    {l.nativeName !== l.name && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{l.name}</span>}
                  </span>
                  <span
                    aria-hidden
                    style={st(`width:20px;height:20px;flex-shrink:0;border-radius:50%;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};display:flex;align-items:center;justify-content:center`)}
                  >
                    {on && <span style={st('width:9px;height:9px;border-radius:50%;background:var(--acc)')} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {kind === 'name' && (
          <>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void next()}
              maxLength={40}
              autoFocus
              aria-label={t('shell.onboarding.name.aria')}
              style={st(inputPill, { height: 52, flexShrink: 0, border: '1px solid var(--line)', fontSize: 16 })}
            />
            {nameError && <span style={st('flex-shrink:0;font:500 13px var(--font-ui);color:var(--danger)')}>{nameError}</span>}
          </>
        )}

        {kind === 'theme' && (
          <ChoiceGrid columns={3} label={t('shell.onboarding.theme.aria')}>
            {(
              [
                ['dark', t('shell.onboarding.theme.dark')],
                ['light', t('shell.onboarding.theme.light')],
                ['system', t('shell.onboarding.theme.auto')],
              ] as [ThemePreference, string][]
            ).map(([value, label]) => (
              <ChoiceCard key={value} selected={preference === value} label={label} onClick={() => setPreference(value)}>
                {value === 'system' ? (
                  <>
                    <Shot name="layout-list-dark" alt={t('shell.onboarding.theme.altDark')} />
                    <span style={st('position:absolute;inset:0;clip-path:inset(0 0 0 50%)')}>
                      <Shot name="layout-list-light" alt="" />
                    </span>
                  </>
                ) : (
                  <Shot name={`layout-list-${value}`} alt={t(value === 'dark' ? 'shell.onboarding.theme.altDark' : 'shell.onboarding.theme.altLight')} />
                )}
              </ChoiceCard>
            ))}
          </ChoiceGrid>
        )}

        {kind === 'layout' && (
          <>
            <ChoiceGrid columns={2} label={t('shell.onboarding.layout.aria')}>
              <ChoiceCard selected={viewMode === 'list'} label={t('shell.onboarding.layout.list')} sub={t('shell.onboarding.layout.listSub')} onClick={() => setViewMode('list')}>
                <Shot name={`layout-list-${tone}`} alt={t('shell.onboarding.layout.listAlt')} />
              </ChoiceCard>
              <ChoiceCard selected={viewMode === 'artwork'} label={t('shell.onboarding.layout.covers')} sub={t('shell.onboarding.layout.coversSub')} onClick={() => setViewMode('artwork')}>
                <Shot name={`layout-covers2-${tone}`} alt={t('shell.onboarding.layout.coversAlt')} />
              </ChoiceCard>
            </ChoiceGrid>
            {viewMode === 'artwork' && (
              <>
                <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted);margin-top:6px')}>{t('shell.onboarding.density.heading')}</span>
                <ChoiceGrid columns={2} label={t('shell.onboarding.density.aria')}>
                  <ChoiceCard selected={density !== 'small'} label={t('shell.onboarding.density.two')} sub={t('shell.onboarding.density.twoSub')} onClick={() => setDensity('medium')}>
                    <Shot name={`density-covers2-${tone}`} alt={t('shell.onboarding.density.twoAlt')} />
                  </ChoiceCard>
                  <ChoiceCard selected={density === 'small'} label={t('shell.onboarding.density.three')} sub={t('shell.onboarding.density.threeSub')} onClick={() => setDensity('small')}>
                    <Shot name={`density-covers3-${tone}`} alt={t('shell.onboarding.density.threeAlt')} />
                  </ChoiceCard>
                </ChoiceGrid>
              </>
            )}
          </>
        )}

        {kind === 'accent' && (
          <ChoiceGrid columns={2} label={t('shell.onboarding.accent.title')}>
            {(
              [
                ['room', t('shell.onboarding.accent.title'), t('shell.onboarding.accent.roomSub')],
                ['mono', t('shell.onboarding.accent.mono'), t('shell.onboarding.accent.monoSub')],
              ] as [Accent, string, string][]
            ).map(([value, label, sub]) => (
              <ChoiceCard key={value} selected={accent === value} label={label} sub={sub} onClick={() => setAccent(value)}>
                <Shot name={`accent-${value}-${tone}`} alt={t(value === 'room' ? 'shell.onboarding.accent.roomAlt' : 'shell.onboarding.accent.monoAlt')} />
              </ChoiceCard>
            ))}
          </ChoiceGrid>
        )}

        {kind === 'currency' && (
          <select
            value={region ?? ''}
            aria-label={t('shell.onboarding.currency.aria')}
            onChange={(e) => setRegion((e.target.value || undefined) as PriceRegion | undefined)}
            style={st('flex-shrink:0;height:52px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--line);color:var(--text);font-size:16px;outline:none')}
          >
            <option value="">{t('shell.onboarding.currency.serverDefault')}</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {priceRegionLabel(r)}
              </option>
            ))}
          </select>
        )}

        {kind === 'systems' && <SystemsPicker saveLabel={t('shell.onboarding.systems.save')} onSaved={() => ui.notify(t('shell.onboarding.systems.saved'))} />}

        {kind === 'library' && (
          <>
            <div style={st('flex-shrink:0;display:flex;flex-wrap:wrap;gap:14px')}>
              <HeroCard
                hue={300}
                icon={<LibraryLogo kind="playnite" size={34} />}
                name="Playnite"
                tag={t('shell.onboarding.library.playniteTag')}
                blurb={t('shell.onboarding.library.playniteBlurb')}
                chips={STORES}
                cta={t('shell.onboarding.library.setUpPlaynite')}
                onClick={() => ui.openDialog('playnite')}
              />
              <HeroCard
                hue={235}
                iconBackground={LIBRARY_BRAND.exophase.background}
                icon={<LibraryLogo kind="exophase" size={56} />}
                name="Exophase"
                tag={t('shell.onboarding.library.exophaseTag')}
                blurb={t('shell.onboarding.library.exophaseBlurb')}
                chips={EXOPHASE_STORES}
                cta={exophase.data?.connected ? t('shell.onboarding.library.manageExophase') : t('shell.onboarding.library.setUpExophase')}
                linked={!!exophase.data?.connected}
                onClick={() => ui.openDialog('exophase')}
              />
            </div>
            <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:6px;margin-top:6px')}>
              <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('shell.onboarding.library.orConnect')}</span>
              <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{t('shell.onboarding.library.directNote')}</span>
            </div>
            <div style={st('flex-shrink:0;display:flex;flex-wrap:wrap;gap:14px')}>
              <DirectTile
                kind="steam"
                linked={steamLinked}
                disabled={steam.busy || steam.syncingEverything}
                caption={steam.busy || steam.syncingEverything ? t('shell.onboarding.library.importing') : steamLinked ? t('shell.onboarding.library.importNow') : t('shell.onboarding.library.linkSteam')}
                onClick={() => (steamLinked ? void steam.runSyncEverything() : steam.startLink('library'))}
              />
              <DirectTile
                kind="playstation"
                linked={!!psn.data?.connected}
                caption={psn.data?.connected ? t('shell.onboarding.library.managePsn') : t('shell.onboarding.library.linkPsn')}
                onClick={() => ui.openDialog('psn')}
              />
              {xbox.data?.configured && (
                <DirectTile
                  kind="xbox"
                  linked={xbox.data.connected}
                  caption={xbox.data.connected ? t('shell.onboarding.library.manageXbox') : t('shell.onboarding.library.linkXbox')}
                  onClick={() => ui.openDialog('xbox')}
                />
              )}
            </div>
          </>
        )}

        {kind === 'analytics' && (
          <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:14px')}>
            <div style={st('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--surf)')}>
              <span style={st('flex:1;font:600 15px var(--font-ui)')}>{t('shell.onboarding.analytics.share')}</span>
              <Toggle on={shareStats} onChange={setShareStats} label={t('shell.onboarding.analytics.share')} />
            </div>
            <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:16px;border:1px solid var(--line);font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>
              <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('shell.onboarding.analytics.whatGoogleGets')}</span>
              <span>{t('shell.onboarding.analytics.pages')}</span>
              <span>{t('shell.onboarding.analytics.device')}</span>
              <span>{t('shell.onboarding.analytics.cookie')}</span>
              <span style={st('color:var(--muted)')}>
                {t('shell.onboarding.analytics.never')}{' '}
                <a href={`${getBasePath()}/privacy`} target="_blank" rel="noopener" style={st('color:var(--accText)')}>
                  {t('shell.onboarding.analytics.privacy')}
                </a>
              </span>
            </div>
          </div>
        )}

        {kind === 'email' && (
          <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:14px')}>
            <div style={st('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--surf)')}>
              <span style={st('flex:1;font:600 15px var(--font-ui)')}>{t('shell.onboarding.email.toggle')}</span>
              <Toggle on={wantEmail} onChange={setWantEmail} label={t('shell.onboarding.email.toggle')} />
            </div>
            {wantEmail && (
              <>
                <input
                  type="email"
                  value={shownEmail}
                  onChange={(e) => {
                    setEmailDraft(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder={t('shell.onboarding.email.placeholder')}
                  aria-label={t('shell.onboarding.email.aria')}
                  style={st(inputPill, { height: 52, flexShrink: 0, border: '1px solid var(--line)', fontSize: 16 })}
                />
                {emailError && <span style={st('flex-shrink:0;font:500 13px var(--font-ui);color:var(--danger)')}>{emailError}</span>}
                <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('shell.onboarding.email.which')}</span>
                <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
                  {EMAIL_CHOICES.map((c) => (
                    <div key={c.type} style={st('display:flex;align-items:center;gap:12px;min-height:54px;padding:8px 16px;background:var(--surf)')}>
                      <span style={st('flex:1;min-width:0;font:500 14.5px var(--font-ui)')}>{t(c.label)}</span>
                      <Toggle
                        on={emailTypes.has(c.type)}
                        label={t(c.label)}
                        onChange={(v) =>
                          setEmailTypes((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(c.type);
                            else next.delete(c.type);
                            return next;
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {kind === 'rooms' && (
          <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:1px;border-radius:20px;overflow:hidden;background:var(--chip)')}>
            {(
              [
                ['🏠', t('shell.onboarding.rooms.create'), t('shell.onboarding.rooms.createSub'), 'create'],
                ['🔗', t('shell.onboarding.rooms.join'), t('shell.onboarding.rooms.joinSub'), 'join'],
                ['🌐', t('shell.onboarding.rooms.browse'), t('shell.onboarding.rooms.browseSub'), 'browse'],
              ] as const
            ).map(([e, label, d, k]) => (
              <button
                key={k}
                type="button"
                onClick={() => ui.openDialog('addRoom', { step: k })}
                style={st('display:flex;align-items:center;gap:14px;min-height:68px;padding:12px 16px;border:none;background:var(--surf);color:var(--text);text-align:left')}
              >
                <span style={st('width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--chip);display:flex;align-items:center;justify-content:center;font-size:18px')}>{e}</span>
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 15px var(--font-ui)')}>{label}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{d}</span>
                </span>
                <span style={st('color:var(--muted);font-size:20px')}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={st('flex-shrink:0;padding:12px 22px 26px;width:100%;max-width:560px;margin:0 auto')}>
        <button
          type="button"
          disabled={savingName}
          onClick={() => void next()}
          style={st('width:100%;height:54px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 15.5px var(--font-ui)')}
        >
          {last ? t('shell.onboarding.start') : kind === 'library' ? t('shell.onboarding.continue') : t('common.next')}
        </button>
      </div>
    </div>
  );
}
