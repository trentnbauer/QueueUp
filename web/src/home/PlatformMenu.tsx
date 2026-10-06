import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BACKWARDS_COMPATIBLE, ROOM_PLATFORM_LABELS, sortPlatforms, type RoomPlatform } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { st } from '../ui/st';
import { t as tr, useT } from '../i18n';
import { INSTALL_SIZE_PRESETS_GB } from './installSize';

const isPlatform = (v: string | null): v is RoomPlatform => !!v && v in ROOM_PLATFORM_LABELS;
const storageKey = (scopeId: string) => `sq-platform-filter:${scopeId}`;

/** Issue #799: the header's platform filter, remembered per shelf/room in this browser. */
export function usePlatformFilter(scopeId: string): [RoomPlatform | null, (p: RoomPlatform | null) => void] {
  const read = () => {
    try {
      const v = localStorage.getItem(storageKey(scopeId));
      return isPlatform(v) ? v : null;
    } catch {
      return null;
    }
  };
  const [state, setState] = useState<{ scopeId: string; platform: RoomPlatform | null }>(() => ({ scopeId, platform: read() }));
  // Re-read on a scope switch during render, so the new scope never renders with the old filter.
  const platform = state.scopeId === scopeId ? state.platform : read();
  if (state.scopeId !== scopeId) setState({ scopeId, platform });
  const set = (p: RoomPlatform | null) => {
    setState({ scopeId, platform: p });
    try {
      if (p) localStorage.setItem(storageKey(scopeId), p);
      else localStorage.removeItem(storageKey(scopeId));
    } catch {
      /* storage blocked - filter just won't persist */
    }
  };
  return [platform, set];
}

/** Whether a console's filter also shows the older consoles it plays (PS5 -> PS4 games), remembered
 * per shelf/room. On by default. */
export function useIncludeOlder(scopeId: string): [boolean, (on: boolean) => void] {
  const key = `sq-platform-filter-older:${scopeId}`;
  const read = () => {
    try {
      return localStorage.getItem(key) !== 'false';
    } catch {
      return true;
    }
  };
  const [state, setState] = useState(() => ({ scopeId, on: read() }));
  const on = state.scopeId === scopeId ? state.on : read();
  if (state.scopeId !== scopeId) setState({ scopeId, on });
  const set = (v: boolean) => {
    setState({ scopeId, on: v });
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* storage blocked - setting just won't persist */
    }
  };
  return [on, set];
}

/** The older consoles `p` plays, e.g. PS5 -> "PS4". */
export function olderLabel(p: RoomPlatform): string | null {
  const older = BACKWARDS_COMPATIBLE[p];
  return older?.length ? older.map((o) => ROOM_PLATFORM_LABELS[o]).reduce((a, b) => tr('home.platform.and', { a, b })) : null;
}

/** What the filter offers: the consoles you own (Systems owned) on the shelf; in a room, the
 * consoles its members own between them. */
export function usePlatformOptions(opts: { isShelf: boolean; roomId: string | null }): RoomPlatform[] {
  const { ownedPlatforms } = useAuth();
  const roomSystems = useQuery({
    queryKey: ['room-systems', opts.roomId],
    queryFn: () => apiGet<{ systems: RoomPlatform[] }>(`/api/rooms/${opts.roomId}/systems`),
    enabled: !opts.isShelf && !!opts.roomId,
    staleTime: 60_000,
  });
  const owned = opts.isShelf ? ownedPlatforms : (roomSystems.data?.systems ?? []);
  return useMemo(() => sortPlatforms(owned), [owned]);
}

/** Plain-text dropdown trigger (no pill) for the header kicker, with a small menu of systems. */
export function PlatformMenu({ value, options, allLabel, onChange, includeOlder, onIncludeOlder, emptyHint, maxInstallGb, onMaxInstallGb, lockedLabel }: {
  value: RoomPlatform | null;
  options: RoomPlatform[];
  /** "Every platform" (shelf) / "Any platform" (room). */
  allLabel: string;
  onChange: (p: RoomPlatform | null) => void;
  /** Whether the picked console also shows the older consoles it plays (see useIncludeOlder). */
  includeOlder: boolean;
  onIncludeOlder: (on: boolean) => void;
  /** Shown when there are no owned consoles to pick from. */
  emptyHint: string;
  /** "Fits on my disk" (#1046): the install size limit in GB, 0 for none. */
  maxInstallGb: number;
  onMaxInstallGb: (gb: number) => void;
  /** A room locked to one platform: its name is shown in place of the platform choices. */
  lockedLabel?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Keep a stale pick visible (e.g. a system since removed from Systems owned) so it can be cleared.
  const list = value && !options.includes(value) ? sortPlatforms([...options, value]) : options;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the current pick when the menu opens.
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    const current = Array.from(items ?? []).find((b) => b.getAttribute('aria-checked') === 'true');
    (current ?? items?.[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // Up/Down/Home/End move between items, like a native menu.
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') close(false);
    if (next >= 0) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  const pick = (p: RoomPlatform | null) => {
    onChange(p);
    close(true);
  };

  const sizeItem = (gb: number, label: string) => {
    const on = maxInstallGb === gb;
    return (
      <button
        key={`size-${gb}`}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        onClick={() => {
          onMaxInstallGb(gb);
          close(true);
        }}
        style={st(
          `display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:38px;padding:0 12px;border:none;border-radius:10px;background:${on ? 'var(--chip)' : 'transparent'};color:var(--text);font:${on ? 600 : 500} 14px var(--font-ui);letter-spacing:0;text-transform:none;text-align:left;white-space:nowrap`,
        )}
      >
        {label}
        {on && <span aria-hidden="true" style={st('color:var(--accText);font-size:13px')}>✓</span>}
      </button>
    );
  };

  const item = (p: RoomPlatform | null, label: string) => {
    const on = value === p;
    return (
      <button
        key={p ?? 'all'}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        onClick={() => pick(p)}
        style={st(
          `display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:38px;padding:0 12px;border:none;border-radius:10px;background:${on ? 'var(--chip)' : 'transparent'};color:var(--text);font:${on ? 600 : 500} 14px var(--font-ui);letter-spacing:0;text-transform:none;text-align:left;white-space:nowrap`,
        )}
      >
        {label}
        {on && <span aria-hidden="true" style={st('color:var(--accText);font-size:13px')}>✓</span>}
      </button>
    );
  };

  return (
    <span style={st('position:relative;display:inline-flex')}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('home.platform.filterAria', {
          label: value
            ? includeOlder && olderLabel(value)
              ? t('home.platform.and', { a: ROOM_PLATFORM_LABELS[value], b: olderLabel(value) ?? '' })
              : ROOM_PLATFORM_LABELS[value]
            : allLabel,
        })}
        onClick={() => setOpen((o) => !o)}
        style={st(
          `display:inline-flex;align-items:center;gap:4px;border:none;background:none;padding:0;color:${value ? 'var(--text)' : 'inherit'};font:inherit;letter-spacing:inherit;text-transform:uppercase;cursor:pointer`,
        )}
      >
        {lockedLabel ?? (value ? ROOM_PLATFORM_LABELS[value] : allLabel)}
        {!lockedLabel && value && includeOlder && olderLabel(value) ? ` + ${olderLabel(value)}` : ''}
        {maxInstallGb > 0 ? ` · ${t('home.size.suffix', { gb: maxInstallGb })}` : ''}
        <span aria-hidden="true" style={st('font-size:10px;line-height:1')}>▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('home.platform.menuAria')}
          onKeyDown={onMenuKey}
          style={st(
            'position:absolute;left:-6px;top:calc(100% + 8px);z-index:41;min-width:200px;max-height:min(60vh,420px);overflow-y:auto;display:flex;flex-direction:column;padding:6px;border-radius:16px;border:1px solid var(--line);background:var(--surf);box-shadow:0 12px 32px rgba(0,0,0,0.28)',
          )}
        >
          {!lockedLabel && item(null, allLabel)}
          {!lockedLabel && list.map((p) => item(p, ROOM_PLATFORM_LABELS[p]))}
          {!lockedLabel && list.length === 0 && <span style={st('padding:8px 12px;font:400 12.5px/1.4 var(--font-ui);color:var(--muted);letter-spacing:0;text-transform:none;white-space:normal')}>{emptyHint}</span>}
          {!lockedLabel && value && olderLabel(value) && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={includeOlder}
              onClick={() => onIncludeOlder(!includeOlder)}
              style={st(
                'display:flex;align-items:center;gap:10px;min-height:38px;margin-top:4px;padding:0 12px;border:none;border-top:1px solid var(--line);border-radius:0 0 10px 10px;background:transparent;color:var(--text);font:500 13.5px var(--font-ui);letter-spacing:0;text-transform:none;text-align:left;white-space:nowrap',
              )}
            >
              <span aria-hidden="true" style={st(`width:16px;height:16px;flex-shrink:0;border-radius:5px;border:1.5px solid ${includeOlder ? 'var(--acc)' : 'var(--line)'};background:${includeOlder ? 'var(--acc)' : 'transparent'};color:var(--ink);font-size:11px;line-height:13px;text-align:center`)}>
                {includeOlder ? '✓' : ''}
              </span>
              {t('home.platform.includeOlder', { older: olderLabel(value) ?? '' })}
            </button>
          )}
          <span style={st('margin-top:6px;padding:8px 12px 2px;border-top:1px solid var(--line);font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--muted);text-transform:uppercase')}>{t('home.size.heading')}</span>
          {sizeItem(0, t('home.size.any'))}
          {INSTALL_SIZE_PRESETS_GB.map((gb) => sizeItem(gb, t('home.size.upTo', { gb })))}
          {maxInstallGb > 0 && !(INSTALL_SIZE_PRESETS_GB as readonly number[]).includes(maxInstallGb) && sizeItem(maxInstallGb, t('home.size.upTo', { gb: maxInstallGb }))}
          <span style={st('padding:2px 12px 6px;font:400 12px/1.4 var(--font-ui);color:var(--muted);letter-spacing:0;text-transform:none;white-space:normal')}>{t('home.size.hint')}</span>
        </div>
      )}
    </span>
  );
}
