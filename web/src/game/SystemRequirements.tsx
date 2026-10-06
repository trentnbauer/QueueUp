import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComputerSpecs, SteamRequirementSet } from '@queueup/shared';
import { authApi } from '../api/auth';
import { gamesApi } from '../api/games';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** What the person's own memory says about a block's Memory line: a tick when it has enough, a cross when
 * it has less, nothing when either side is unknown. The other lines (processor, graphics) are shown side by
 * side, not judged. */
export function memoryVerdict(ownGb: number | null, neededGb: number | null): 'ok' | 'low' | null {
  if (ownGb === null || neededGb === null) return null;
  return ownGb >= neededGb ? 'ok' : 'low';
}

const LABEL = 'font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--muted);text-transform:uppercase';

function SetView({ title, set, specs }: { title: string; set: SteamRequirementSet | null; specs: ComputerSpecs | undefined }) {
  const t = useT();
  if (!set) return null;
  const verdict = memoryVerdict(specs?.ramGb ?? null, set.memoryGb);
  return (
    <div style={st('display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;background:var(--surf)')}>
      <span style={st(LABEL)}>{title}</span>
      {set.lines.length > 0 ? (
        set.lines.map((l) => (
          <div key={l.label} style={st('display:flex;flex-direction:column;gap:1px')}>
            <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{l.label}</span>
            <span style={st('font:500 14px/1.35 var(--font-ui);overflow-wrap:anywhere')}>
              {l.value}
              {verdict && /^(memory|ram|system memory)$/i.test(l.label) && (
                <span style={st(`margin-left:8px;font-weight:700;color:${verdict === 'ok' ? 'var(--accText)' : 'var(--danger, #d4533b)'}`)}>
                  {verdict === 'ok' ? t('game.reqs.memoryOk') : t('game.reqs.memoryLow')}
                </span>
              )}
            </span>
          </div>
        ))
      ) : (
        <span style={st('font:500 14px/1.4 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{set.text}</span>
      )}
    </div>
  );
}

/** "System requirements": Steam's minimum and recommended PC requirements beside the person's own My
 * computer specs (#1045). Only asked for when opened, so viewing a game never calls Steam by itself. */
export function SystemRequirements({ gameId }: { gameId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const reqs = useQuery({ queryKey: ['game-requirements', gameId], queryFn: () => gamesApi.requirements(gameId), enabled: open, staleTime: 10 * 60_000 });
  const specs = useQuery({ queryKey: ['computer-specs'], queryFn: authApi.computerSpecs, enabled: open });
  const own = specs.data;
  const ownLines = own
    ? ([
        [t('settings.specs.cpu'), own.cpu],
        [t('settings.specs.gpu'), own.gpu],
        [t('settings.specs.ram'), own.ramGb !== null ? `${own.ramGb} GB` : null],
        [t('settings.specs.display'), own.display],
      ] as [string, string | null][]).filter(([, v]) => v)
    : [];
  const requirements = reqs.data?.requirements ?? null;

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;justify-content:space-between;align-items:center')}>
        <span style={st('font:600 15px var(--font-display)')}>{t('game.reqs.title')}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--chip);color:var(--text2);font:600 12.5px var(--font-ui)')}
        >
          {open ? t('game.reqs.hide') : t('game.reqs.show')}
        </button>
      </div>
      {open && (
        <>
          {reqs.isPending && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
          {reqs.isError && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{reqs.error instanceof Error ? reqs.error.message : t('game.reqs.failed')}</span>}
          {reqs.data && !requirements && <span style={st('font:400 14px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.reqs.none')}</span>}
          {requirements && (
            <>
              <SetView title={t('game.reqs.minimum')} set={requirements.minimum} specs={own} />
              <SetView title={t('game.reqs.recommended')} set={requirements.recommended} specs={own} />
              <div style={st('display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;border:1px dashed var(--line)')}>
                <span style={st(LABEL)}>{t('game.reqs.yourPc')}</span>
                {ownLines.length > 0 ? (
                  ownLines.map(([label, value]) => (
                    <div key={label} style={st('display:flex;flex-direction:column;gap:1px')}>
                      <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{label}</span>
                      <span style={st('font:500 14px/1.35 var(--font-ui);overflow-wrap:anywhere')}>{value}</span>
                    </div>
                  ))
                ) : (
                  <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.reqs.noSpecs')}</span>
                )}
              </div>
              <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.reqs.source')}</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
