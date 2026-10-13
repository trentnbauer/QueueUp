import type { ComputerSpecs } from '@queueup/shared';
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

/** The person's own My computer specs (#1045), shown under a game's requirements so the two can be compared. */
export function YourPc({ specs }: { specs: ComputerSpecs | undefined }) {
  const t = useT();
  const lines = specs
    ? ([
        [t('settings.specs.cpu'), specs.cpu],
        [t('settings.specs.gpu'), specs.gpu],
        [t('settings.specs.ram'), specs.ramGb !== null ? `${specs.ramGb} GB` : null],
        [t('settings.specs.display'), specs.display],
      ] as [string, string | null][]).filter(([, v]) => v)
    : [];
  return (
    <div style={st('display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;border:1px dashed var(--line)')}>
      <span style={st(LABEL)}>{t('game.reqs.yourPc')}</span>
      {lines.length > 0 ? (
        lines.map(([label, value]) => (
          <div key={label} style={st('display:flex;flex-direction:column;gap:1px')}>
            <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{label}</span>
            <span style={st('font:500 14px/1.35 var(--font-ui);overflow-wrap:anywhere')}>{value}</span>
          </div>
        ))
      ) : (
        <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.reqs.noSpecs')}</span>
      )}
    </div>
  );
}
