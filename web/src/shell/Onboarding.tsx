import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import {
  ALERT_EMAIL_QUERY_KEY,
  NOTIFICATION_PREFERENCES_QUERY_KEY,
  alertEmailApi,
  notificationPreferencesApi,
} from '../api/notificationPreferences';
import { PRICE_REGION_LABELS, type EmailAlertType, type PriceRegion } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { LANGUAGES, useI18n } from '../i18n';
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
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
type StepKind = 'language' | 'name' | 'theme' | 'layout' | 'currency' | 'systems' | 'library' | 'email' | 'analytics' | 'accent' | 'rooms';
const STEP_TEXT: Record<Exclude<StepKind, 'language'>, [string, string]> = {
  name: ['What should we call you?', 'This is the name friends and room members see. We filled in the one from your sign-in - change it if you like.'],
  theme: ['Light or dark?', 'Pick how QueueUp looks. Auto follows your device. You can change this anytime in your profile.'],
  layout: ['List or covers?', 'How games show on your shelf and in every room. You can switch anytime in your profile.'],
  accent: ['Room colours', "Every room has its own colour. Let it tint the room you're in, or keep everything neutral."],
  currency: ['Which currency?', 'Pick a currency for prices. You can change it anytime from your profile.'],
  systems: ['Which systems do you own?', 'We use this to limit game search to what you can actually play. Skip it to see every platform.'],
  library: ['Bring in your library', 'Import what you already own so your shelf starts full.'],
  email: ['Get alerts by email?', 'Hear about price drops, friend activity and play requests without opening QueueUp. You can change this anytime in Settings.'],
  analytics: ['Help improve QueueUp?', 'This server can use Google Analytics to see which parts of the app get used. Nothing is sent unless you turn it on, and you can change this anytime in Settings.'],
  rooms: ['Play with friends', 'Rooms are where your group votes on what to play next.'],
};

/** The alerts offered during sign-up, and which start switched on. Everything else stays in Settings. */
const EMAIL_CHOICES: { type: EmailAlertType; label: string; on: boolean }[] = [
  { type: 'price_drop', label: 'Price drops on your wishlist', on: true },
  { type: 'good_time_to_buy', label: 'Good time to buy', on: true },
  { type: 'play_together_request', label: 'Ask to play together requests', on: true },
  { type: 'friend_recommendation', label: 'Games your friends rate highly', on: false },
  { type: 'feed_reaction', label: 'Reactions to your activity', on: false },
  { type: 'release_watch', label: 'New releases and DLC', on: false },
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
  const { language, setLanguage, t } = useI18n();
  const kinds: StepKind[] = [
    // Language comes first (#776), so everything after it is in the language they picked.
    'language',
    'name',
    'theme',
    'layout',
    'currency',
    'systems',
    'library',
    ...(prefs.data?.emailAvailable ? (['email'] as const) : []),
    'accent',
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
  const [title, sub] = kind === 'language' ? [t('core.onboarding.language.title'), t('core.onboarding.language.sub')] : STEP_TEXT[kind];
  const effectiveEmail = alertEmail.data?.effectiveEmail ?? '';
  const shownEmail = emailDraft ?? (isPlaceholderEmail(effectiveEmail) ? '' : effectiveEmail);

  /** Saves the name (only if it changed) and moves on; stays put with an inline error if it's rejected. */
  async function next() {
    if (savingName) return;
    if (kind === 'email' && wantEmail) {
      const address = shownEmail.trim().toLowerCase();
      if (!address) {
        setEmailError('Enter the email address to send alerts to.');
        return;
      }
      setSavingName(true);
      try {
        if (address !== effectiveEmail.toLowerCase()) {
          const res = await alertEmailApi.set({ email: address });
          if (res.status === 'confirmation_sent') ui.notify('Check your inbox to confirm the address');
        }
        await Promise.all([...emailTypes].map((type) => notificationPreferencesApi.set({ type, email: true })));
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ALERT_EMAIL_QUERY_KEY });
        setEmailError(null);
      } catch (e) {
        setEmailError(e instanceof Error ? e.message : 'Could not save your email settings');
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
        setNameError('Pick a name between 1 and 40 characters.');
        return;
      }
      if (trimmed !== user?.displayName) {
        setSavingName(true);
        try {
          await authApi.setDisplayName(trimmed);
          await refetch();
        } catch (e) {
          setNameError(e instanceof Error ? e.message : 'Could not save your name');
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
      aria-label="Welcome to QueueUp"
      style={st('position:fixed;inset:0;z-index:50;background:var(--bg);color:var(--text);display:flex;flex-direction:column')}
    >
      <div style={st('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:18px 20px 8px')}>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} aria-label="Back" style={st('width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:20px;line-height:1;padding:0 0 2px')}>
            ‹
          </button>
        )}
        <div style={st('flex:1;display:flex;gap:6px')}>
          {kinds.map((_, i) => (
            <span key={i} style={st(`flex:1;height:4px;border-radius:999px;background:${i <= step ? 'var(--acc)' : 'var(--chip)'}`)} />
          ))}
        </div>
        <button type="button" onClick={onDone} style={st('height:38px;padding:0 6px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
          Skip
        </button>
      </div>
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:28px 22px 20px;display:flex;flex-direction:column;gap:16px;width:100%;max-width:560px;margin:0 auto')}>
        <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>STEP {step + 1} OF {kinds.length}</span>
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
              aria-label="Display name"
              style={st(inputPill, { height: 52, flexShrink: 0, border: '1px solid var(--line)', fontSize: 16 })}
            />
            {nameError && <span style={st('flex-shrink:0;font:500 13px var(--font-ui);color:var(--danger)')}>{nameError}</span>}
          </>
        )}

        {kind === 'theme' && (
          <ChoiceGrid columns={3} label="Theme">
            {(
              [
                ['dark', 'Dark'],
                ['light', 'Light'],
                ['system', 'Auto'],
              ] as [ThemePreference, string][]
            ).map(([value, label]) => (
              <ChoiceCard key={value} selected={preference === value} label={label} onClick={() => setPreference(value)}>
                {value === 'system' ? (
                  <>
                    <Shot name="layout-list-dark" alt="QueueUp in dark mode" />
                    <span style={st('position:absolute;inset:0;clip-path:inset(0 0 0 50%)')}>
                      <Shot name="layout-list-light" alt="" />
                    </span>
                  </>
                ) : (
                  <Shot name={`layout-list-${value}`} alt={`QueueUp in ${label.toLowerCase()} mode`} />
                )}
              </ChoiceCard>
            ))}
          </ChoiceGrid>
        )}

        {kind === 'layout' && (
          <>
            <ChoiceGrid columns={2} label="Game layout">
              <ChoiceCard selected={viewMode === 'list'} label="List" sub="Details at a glance" onClick={() => setViewMode('list')}>
                <Shot name={`layout-list-${tone}`} alt="Games shown as a list" />
              </ChoiceCard>
              <ChoiceCard selected={viewMode === 'artwork'} label="Covers" sub="Box art front and centre" onClick={() => setViewMode('artwork')}>
                <Shot name={`layout-covers2-${tone}`} alt="Games shown as cover art" />
              </ChoiceCard>
            </ChoiceGrid>
            {viewMode === 'artwork' && (
              <>
                <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted);margin-top:6px')}>COVERS PER ROW ON PHONES</span>
                <ChoiceGrid columns={2} label="Covers per row">
                  <ChoiceCard selected={density !== 'small'} label="2 per row" sub="Bigger art, vote buttons on each" onClick={() => setDensity('medium')}>
                    <Shot name={`density-covers2-${tone}`} alt="Two covers per row" />
                  </ChoiceCard>
                  <ChoiceCard selected={density === 'small'} label="3 per row" sub="More games on screen" onClick={() => setDensity('small')}>
                    <Shot name={`density-covers3-${tone}`} alt="Three covers per row" />
                  </ChoiceCard>
                </ChoiceGrid>
              </>
            )}
          </>
        )}

        {kind === 'accent' && (
          <ChoiceGrid columns={2} label="Room colours">
            {(
              [
                ['room', 'Room colours', "Each room's colour tints its buttons"],
                ['mono', 'Monochrome', 'Neutral everywhere'],
              ] as [Accent, string, string][]
            ).map(([value, label, sub]) => (
              <ChoiceCard key={value} selected={accent === value} label={label} sub={sub} onClick={() => setAccent(value)}>
                <Shot name={`accent-${value}-${tone}`} alt={`A room with ${label.toLowerCase()}`} />
              </ChoiceCard>
            ))}
          </ChoiceGrid>
        )}

        {kind === 'currency' && (
          <select
            value={region ?? ''}
            aria-label="Price currency"
            onChange={(e) => setRegion((e.target.value || undefined) as PriceRegion | undefined)}
            style={st('flex-shrink:0;height:52px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--line);color:var(--text);font-size:16px;outline:none')}
          >
            <option value="">Server default</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {PRICE_REGION_LABELS[r]}
              </option>
            ))}
          </select>
        )}

        {kind === 'systems' && <SystemsPicker saveLabel="Save systems" onSaved={() => ui.notify('Systems saved')} />}

        {kind === 'library' && (
          <>
            <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:linear-gradient(150deg, oklch(0.55 0.2 300 / 0.28), var(--surf) 70%);border:1px solid oklch(0.55 0.2 300 / 0.35)')}>
              <div style={st('display:flex;align-items:center;gap:14px')}>
                <span style={st('width:56px;height:56px;flex-shrink:0;border-radius:16px;background:oklch(0.55 0.2 300);color:#fff;display:flex;align-items:center;justify-content:center;font:800 22px var(--font-display)')}>P</span>
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
                  <span style={st('font:700 19px var(--font-display)')}>Playnite</span>
                  <span style={st('font:500 12.5px var(--font-ui);color:var(--text2)')}>Recommended · every launcher at once</span>
                </span>
              </div>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>Free desktop app that gathers Epic, GOG, Xbox, PlayStation, Nintendo and more, then sends the lot to QueueUp.</span>
              <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
                {STORES.map((s) => (
                  <span key={s} style={st('height:26px;padding:0 10px;border-radius:999px;background:oklch(1 0 0 / 0.08);font:600 11.5px var(--font-ui);color:var(--text2);display:flex;align-items:center')}>{s}</span>
                ))}
              </div>
              <button type="button" onClick={() => ui.openDialog('playnite')} style={st('height:50px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}>
                Set up Playnite
              </button>
            </div>
            <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted);margin-top:6px')}>OR CONNECT DIRECTLY</span>
            <div style={st('flex-shrink:0;display:flex;flex-wrap:wrap;gap:14px')}>
              <button
                type="button"
                disabled={steam.busy || steam.syncingEverything}
                onClick={() => (steamLinked ? void steam.runSyncEverything() : steam.startLink('library'))}
                style={st('width:84px;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;border:none;background:none;color:var(--text)')}
              >
                <span style={st('position:relative;width:64px;height:64px;border-radius:18px;background:#1b2838;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>
                  Steam
                  {steamLinked && (
                    <span style={st('position:absolute;right:-4px;bottom:-4px;width:22px;height:22px;border-radius:50%;background:var(--mint);color:#fff;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;font:800 11px var(--font-ui)')}>✓</span>
                  )}
                </span>
                <span style={st('font:600 12px/1.25 var(--font-ui);text-align:center')}>{steam.busy || steam.syncingEverything ? 'Importing…' : steamLinked ? 'Import now' : 'Link Steam'}</span>
              </button>
            </div>
          </>
        )}

        {kind === 'analytics' && (
          <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:14px')}>
            <div style={st('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--surf)')}>
              <span style={st('flex:1;font:600 15px var(--font-ui)')}>Share usage stats</span>
              <Toggle on={shareStats} onChange={setShareStats} label="Share usage stats" />
            </div>
            <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:16px;border:1px solid var(--line);font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>
              <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>WHAT GOOGLE GETS</span>
              <span>• The pages you open, with room, profile and invite ids removed</span>
              <span>• Your browser, device type and rough location</span>
              <span>• A cookie to count return visits</span>
              <span style={st('color:var(--muted)')}>
                Never your games, rooms, name or email.{' '}
                <a href={`${getBasePath()}/privacy`} target="_blank" rel="noopener" style={st('color:var(--accText)')}>
                  Privacy policy
                </a>
              </span>
            </div>
          </div>
        )}

        {kind === 'email' && (
          <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:14px')}>
            <div style={st('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:var(--surf)')}>
              <span style={st('flex:1;font:600 15px var(--font-ui)')}>Email me alerts</span>
              <Toggle on={wantEmail} onChange={setWantEmail} label="Email me alerts" />
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
                  placeholder="you@example.com"
                  aria-label="Email address for alerts"
                  style={st(inputPill, { height: 52, flexShrink: 0, border: '1px solid var(--line)', fontSize: 16 })}
                />
                {emailError && <span style={st('flex-shrink:0;font:500 13px var(--font-ui);color:var(--danger)')}>{emailError}</span>}
                <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>WHICH ALERTS?</span>
                <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
                  {EMAIL_CHOICES.map((c) => (
                    <div key={c.type} style={st('display:flex;align-items:center;gap:12px;min-height:54px;padding:8px 16px;background:var(--surf)')}>
                      <span style={st('flex:1;min-width:0;font:500 14.5px var(--font-ui)')}>{c.label}</span>
                      <Toggle
                        on={emailTypes.has(c.type)}
                        label={c.label}
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
                ['🏠', 'Create a room', 'Pick a name and a platform', 'create'],
                ['🔗', 'Join with an invite code', 'Paste a code or link from a friend', 'join'],
                ['🌐', 'Browse public rooms', 'Open rooms on this server', 'browse'],
              ] as const
            ).map(([e, t, d, k]) => (
              <button
                key={k}
                type="button"
                onClick={() => ui.openDialog('addRoom', { step: k })}
                style={st('display:flex;align-items:center;gap:14px;min-height:68px;padding:12px 16px;border:none;background:var(--surf);color:var(--text);text-align:left')}
              >
                <span style={st('width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--chip);display:flex;align-items:center;justify-content:center;font-size:18px')}>{e}</span>
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 15px var(--font-ui)')}>{t}</span>
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
          {last ? 'Start queueing' : kind === 'library' ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
