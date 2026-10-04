import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, platformFamilyOf, sortPlatforms, type Game, type RoomPlatform } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { st } from '../ui/st';

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

/** What the filter offers: on the shelf, your Systems owned; in a room, what its members own between
 * them. With none set, the systems the games themselves are on. */
export function usePlatformOptions(opts: { isShelf: boolean; roomId: string | null; games: Game[] }): RoomPlatform[] {
  const { ownedPlatforms } = useAuth();
  const roomSystems = useQuery({
    queryKey: ['room-systems', opts.roomId],
    queryFn: () => apiGet<{ systems: RoomPlatform[] }>(`/api/rooms/${opts.roomId}/systems`),
    enabled: !opts.isShelf && !!opts.roomId,
    staleTime: 5 * 60_000,
  });
  const owned = opts.isShelf ? ownedPlatforms : (roomSystems.data?.systems ?? []);
  return useMemo(() => {
    if (owned.length) return sortPlatforms(owned);
    const found = new Set<RoomPlatform>();
    for (const g of opts.games) {
      for (const name of g.platform.split(',')) {
        const f = platformFamilyOf(name.trim());
        if (f) found.add(f);
      }
    }
    return sortPlatforms(Array.from(found));
  }, [owned, opts.games]);
}

/** Plain-text dropdown trigger (no pill) for the header kicker, with a small menu of systems. */
export function PlatformMenu({ value, options, allLabel, onChange }: {
  value: RoomPlatform | null;
  options: RoomPlatform[];
  /** "Every platform" (shelf) / "Any platform" (room). */
  allLabel: string;
  onChange: (p: RoomPlatform | null) => void;
}) {
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
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    const current = Array.from(items ?? []).find((b) => b.getAttribute('aria-checked') === 'true');
    (current ?? items?.[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
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
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
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
        aria-label={`Platform filter: ${value ? ROOM_PLATFORM_LABELS[value] : allLabel}`}
        onClick={() => setOpen((o) => !o)}
        style={st(
          `display:inline-flex;align-items:center;gap:4px;border:none;background:none;padding:0;color:${value ? 'var(--text)' : 'inherit'};font:inherit;letter-spacing:inherit;text-transform:uppercase;cursor:pointer`,
        )}
      >
        {value ? ROOM_PLATFORM_LABELS[value] : allLabel}
        <span aria-hidden="true" style={st('font-size:10px;line-height:1')}>▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Filter by platform"
          onKeyDown={onMenuKey}
          style={st(
            'position:absolute;left:-6px;top:calc(100% + 8px);z-index:41;min-width:200px;max-height:min(60vh,420px);overflow-y:auto;display:flex;flex-direction:column;padding:6px;border-radius:16px;border:1px solid var(--line);background:var(--surf);box-shadow:0 12px 32px rgba(0,0,0,0.28)',
          )}
        >
          {item(null, allLabel)}
          {list.map((p) => item(p, ROOM_PLATFORM_LABELS[p]))}
        </div>
      )}
    </span>
  );
}
