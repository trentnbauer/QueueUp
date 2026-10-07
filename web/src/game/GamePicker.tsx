import { useEffect, useMemo, useRef, useState } from 'react';
import { st } from '../ui/st';
import { useT } from '../i18n';

export interface PickerOption {
  id: string;
  title: string;
  /** Small extra line, e.g. the year or status. */
  sub?: string;
}

/** Most options listed at once: a library can have thousands of games, and a list that long only slows the page. The
 * rest are one search away. */
export const PICKER_MAX_SHOWN = 60;

/** The options whose title contains the search text (case and accent-insensitive), alphabetically, capped. */
export function filterPickerOptions(options: PickerOption[], query: string, max = PICKER_MAX_SHOWN): { shown: PickerOption[]; total: number } {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  const matches = q ? options.filter((o) => norm(o.title).includes(q)) : options;
  return { shown: matches.slice(0, max), total: matches.length };
}

/** A searchable replacement for a long native <select>: shows the current choice, and opens a panel with a search box
 * and a short list. "None" is always first. `suggestedId` is marked "Suggested". */
export function GamePicker({
  value,
  options,
  onChange,
  noneLabel,
  label,
  suggestedId,
}: {
  value: string;
  options: PickerOption[];
  onChange: (id: string | null) => void;
  noneLabel: string;
  label: string;
  suggestedId?: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.id === value);
  const { shown, total } = useMemo(() => filterPickerOptions(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const row = (key: string, text: string, sub: string | undefined, on: boolean, onClick: () => void, tag?: string) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={on}
      onClick={onClick}
      style={st(`display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 12px;border:none;border-radius:10px;background:${on ? 'var(--chip)' : 'transparent'};color:var(--text);text-align:left;font:${on ? 600 : 500} 14.5px var(--font-ui)`)}
    >
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{text}</span>
        {sub && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{sub}</span>}
      </span>
      {tag && <span style={st('flex-shrink:0;font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--accText)')}>{tag}</span>}
      {on && <span aria-hidden="true" style={st('color:var(--accText);font-size:13px')}>✓</span>}
    </button>
  );

  return (
    <div ref={rootRef} style={st('position:relative;display:flex;flex-direction:column;gap:6px')}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={st('display:flex;align-items:center;justify-content:space-between;gap:10px;height:46px;padding:0 14px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font:500 15px var(--font-ui);text-align:left')}
      >
        <span style={st(`min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${current ? '' : 'color:var(--muted)'}`)}>{current ? current.title : noneLabel}</span>
        <span aria-hidden="true" style={st('flex-shrink:0;font-size:10px;color:var(--muted)')}>▾</span>
      </button>
      {open && (
        <div style={st('display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:14px;border:1px solid var(--line);background:var(--surf)')}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('game.picker.search')}
            aria-label={t('game.picker.search')}
            style={st('height:42px;padding:0 14px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:15px;outline:none')}
          />
          <div role="listbox" aria-label={label} style={st('display:flex;flex-direction:column;gap:2px;max-height:min(46vh,320px);overflow-y:auto')}>
            {!query.trim() && row('none', noneLabel, undefined, value === '', () => pick(null))}
            {shown.map((o) => row(o.id, o.title, o.sub, o.id === value, () => pick(o.id), o.id === suggestedId ? t('game.picker.suggested') : undefined))}
            {total === 0 && <span style={st('padding:10px 12px;font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('game.picker.noMatches')}</span>}
            {total > shown.length && <span style={st('padding:8px 12px;font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('game.picker.more', { n: shown.length })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
