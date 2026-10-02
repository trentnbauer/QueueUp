import { useState } from 'react';
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
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { Toggle, inputPill } from '../ui/primitives';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
type StepKind = 'name' | 'currency' | 'systems' | 'library' | 'email' | 'rooms';
const STEP_TEXT: Record<StepKind, [string, string]> = {
  name: ['What should we call you?', 'This is the name friends and room members see. We filled in the one from your sign-in - change it if you like.'],
  currency: ['Welcome to QueueUp', 'Pick a currency for prices. You can change it anytime from your profile.'],
  systems: ['Which systems do you own?', 'We use this to limit game search to what you can actually play. Skip it to see every platform.'],
  library: ['Bring in your library', 'Import what you already own so your shelf starts full.'],
  email: ['Get alerts by email?', 'Hear about price drops, friend activity and play requests without opening QueueUp. You can change this anytime in Settings.'],
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

/** First-run flow: currency, systems, library import, rooms. Full screen; dialogs it opens (Playnite,
 * rooms) stack above it. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const ui = useUi();
  const { user, steamLinked, refetch } = useAuth();
  const { region, setRegion } = useCurrencyRegion();
  const steam = useSteamImportContext();
  const queryClient = useQueryClient();
  // The email step only appears when this server can send email.
  const prefs = useQuery({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY, queryFn: notificationPreferencesApi.get });
  const alertEmail = useQuery({ queryKey: ALERT_EMAIL_QUERY_KEY, queryFn: alertEmailApi.get });
  const kinds: StepKind[] = ['name', 'currency', 'systems', 'library', ...(prefs.data?.emailAvailable ? (['email'] as const) : []), 'rooms'];
  const [step, setStep] = useState(0);
  const [wantEmail, setWantEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [emailTypes, setEmailTypes] = useState<Set<EmailAlertType>>(new Set(EMAIL_CHOICES.filter((c) => c.on).map((c) => c.type)));
  const [emailError, setEmailError] = useState<string | null>(null);
  // Prefilled from the sign-in provider's profile (or whatever the account already has).
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const kind = kinds[Math.min(step, kinds.length - 1)];
  const last = step >= kinds.length - 1;
  const [title, sub] = STEP_TEXT[kind];
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
