import { ACCENT_COLOURS, isHexColour } from '@queueup/shared';
import { st } from './st';
import { useT } from '../i18n';

/** A row of preset colours plus a free colour field. `value` null means "no colour chosen" (the default
 * look); tapping the chosen preset again, or "Default" when `allowClear`, clears it. Calls `onChange` at
 * once with a valid #rrggbb (or null), so the caller decides when to save. */
export function ColourPicker({ value, onChange, allowClear = false, label }: { value: string | null; onChange: (colour: string | null) => void; allowClear?: boolean; label: string }) {
  const t = useT();
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;gap:10px;flex-wrap:wrap;align-items:center')}>
        {ACCENT_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={label}
            aria-pressed={value?.toLowerCase() === c}
            onClick={() => onChange(allowClear && value?.toLowerCase() === c ? null : c)}
            style={st(`width:36px;height:36px;border-radius:50%;border:none;background:${c};box-shadow:${value?.toLowerCase() === c ? '0 0 0 2px var(--surf), 0 0 0 4px var(--text)' : 'none'}`)}
          />
        ))}
        <input
          type="color"
          aria-label={t('settings.shelfColour.custom')}
          value={isHexColour(value) ? value : '#8b5cf6'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          style={st('width:42px;height:36px;padding:0;border:none;border-radius:10px;background:none')}
        />
        {allowClear && value && (
          <button type="button" onClick={() => onChange(null)} style={st('border:none;background:none;padding:0;color:var(--muted);font:500 13px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}>
            {t('settings.shelfColour.default')}
          </button>
        )}
      </div>
    </div>
  );
}

