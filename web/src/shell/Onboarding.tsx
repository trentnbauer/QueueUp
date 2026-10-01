import { useState } from 'react';
import { PRICE_REGION_LABELS, type PriceRegion } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';

const REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
const TITLES: [string, string][] = [
  ['Welcome to QueueUp', 'Pick a currency for prices. You can change it anytime from your profile.'],
  ['Which systems do you own?', 'We use this to limit game search to what you can actually play. Skip it to see every platform.'],
  ['Bring in your library', 'Import what you already own so your shelf starts full.'],
  ['Play with friends', 'Rooms are where your group votes on what to play next.'],
];
const STORES = ['Steam', 'Epic', 'GOG', 'Xbox', 'PlayStation', 'Nintendo'];

/** First-run flow: currency, systems, library import, rooms. Full screen; dialogs it opens (Playnite,
 * rooms) stack above it. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const ui = useUi();
  const { steamLinked } = useAuth();
  const { region, setRegion } = useCurrencyRegion();
  const steam = useSteamImportContext();
  const [step, setStep] = useState(0);
  const last = step === TITLES.length - 1;
  const [title, sub] = TITLES[step];

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
          {TITLES.map((_, i) => (
            <span key={i} style={st(`flex:1;height:4px;border-radius:999px;background:${i <= step ? 'var(--acc)' : 'var(--chip)'}`)} />
          ))}
        </div>
        <button type="button" onClick={onDone} style={st('height:38px;padding:0 6px;border:none;background:none;color:var(--muted);font:600 13.5px var(--font-ui)')}>
          Skip
        </button>
      </div>
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:28px 22px 20px;display:flex;flex-direction:column;gap:16px;width:100%;max-width:560px;margin:0 auto')}>
        <span style={st('flex-shrink:0;font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>STEP {step + 1} OF {TITLES.length}</span>
        <span style={st('flex-shrink:0;font:700 30px/1.08 var(--font-display);letter-spacing:-0.025em;text-wrap:balance')}>{title}</span>
        <span style={st('flex-shrink:0;font:400 15px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{sub}</span>

        {step === 0 && (
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

        {step === 1 && <SystemsPicker saveLabel="Save systems" onSaved={() => ui.notify('Systems saved')} />}

        {step === 2 && (
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

        {step === 3 && (
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
          onClick={() => (last ? onDone() : setStep(step + 1))}
          style={st('width:100%;height:54px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 15.5px var(--font-ui)')}
        >
          {last ? 'Start queueing' : step === 2 ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
