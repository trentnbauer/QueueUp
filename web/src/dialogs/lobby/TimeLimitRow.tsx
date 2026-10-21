import { ChipToggle } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** The lobby's time limit, for everyone in it: every run capped at the waiting room's 30 seconds, or none (runs go on until they are beaten, and
 * the games that are a fixed length by design go on too, getting harder, until a player has lost their lives). While a spin waits it is always on. */
export function TimeLimitRow({ capSeconds, locked, onChange }: { capSeconds: number; locked: boolean; onChange: (on: boolean) => void }) {
  const t = useT();
  const on = capSeconds > 0;
  return (
    <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px')} role="group" aria-label={t('spin.lobby.limit.label')}>
      <span style={st('font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--faint)')}>{t('spin.lobby.limit.label')}</span>
      <ChipToggle on={!on} height={30} fontSize={12.5} padX={12} onClick={() => !locked && onChange(false)} style={locked ? { opacity: 0.5, cursor: 'default' } : undefined}>
        {t('spin.lobby.limit.off', { n: capSeconds || 30 })}
      </ChipToggle>
      <ChipToggle on={on} height={30} fontSize={12.5} padX={12} onClick={() => !locked && onChange(true)} style={locked ? { cursor: 'default' } : undefined}>
        {t('spin.lobby.limit.on', { n: capSeconds || 30 })}
      </ChipToggle>
      <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t(locked ? 'spin.lobby.limit.locked' : on ? 'spin.lobby.limit.onSub' : 'spin.lobby.limit.offSub', { n: capSeconds || 30 })}</span>
    </div>
  );
}
