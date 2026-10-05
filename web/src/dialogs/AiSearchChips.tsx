import type { ReactNode } from 'react';
import { ROOM_PLATFORM_LABELS, type AiSearchFilters } from '@queueup/shared';
import { st } from '../ui/st';
import { useT } from '../i18n';

const CHIP = 'display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 12px;border-radius:999px;background:var(--accSoft);color:var(--accText);font:600 12.5px var(--font-ui)';
const X = 'width:22px;height:22px;border-radius:50%;border:none;background:var(--accA20);color:var(--accText);font-size:14px;line-height:1;padding:0';

/** The filters a plain-language search understood, as chips the person can remove (issue #823), so it
 * is clear what was understood. Removing one calls `onChange` with the new filters. */
export function AiSearchChips({ filters, onChange, disabled }: { filters: AiSearchFilters; onChange: (f: AiSearchFilters) => void; disabled?: boolean }): ReactNode {
  const t = useT();
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.query) chips.push({ key: 'q', label: t('add.game.aiSearch.chip.query', { text: filters.query }), remove: () => onChange({ ...filters, query: null }) });
  for (const p of filters.platforms) chips.push({ key: `p-${p}`, label: ROOM_PLATFORM_LABELS[p], remove: () => onChange({ ...filters, platforms: filters.platforms.filter((x) => x !== p) }) });
  if (filters.coop) chips.push({ key: 'coop', label: t('add.game.aiSearch.chip.coop'), remove: () => onChange({ ...filters, coop: false }) });
  for (const g of filters.genres) chips.push({ key: `g-${g}`, label: g, remove: () => onChange({ ...filters, genres: filters.genres.filter((x) => x !== g) }) });
  if (filters.maxHours !== null) chips.push({ key: 'h', label: t('add.game.aiSearch.chip.hours', { n: filters.maxHours }), remove: () => onChange({ ...filters, maxHours: null }) });
  if (filters.releasedFrom !== null || filters.releasedTo !== null) {
    const label =
      filters.releasedFrom !== null && filters.releasedTo !== null
        ? filters.releasedFrom === filters.releasedTo
          ? String(filters.releasedFrom)
          : `${filters.releasedFrom}–${filters.releasedTo}`
        : filters.releasedFrom !== null
          ? t('add.game.aiSearch.chip.since', { year: filters.releasedFrom })
          : t('add.game.aiSearch.chip.until', { year: filters.releasedTo! });
    chips.push({ key: 'y', label, remove: () => onChange({ ...filters, releasedFrom: null, releasedTo: null }) });
  }

  if (chips.length === 0) return null;
  return (
    <div style={st('display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 8px')}>
      {chips.map((c) => (
        <span key={c.key} style={st(CHIP)}>
          {c.label}
          <button type="button" disabled={disabled} onClick={c.remove} aria-label={t('add.game.aiSearch.removeFilter', { filter: c.label })} style={st(X)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
