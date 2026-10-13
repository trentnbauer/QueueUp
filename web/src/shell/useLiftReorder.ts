import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { useRooms } from '../hooks/useRooms';
import type { TileModel } from './useShell';

const HOLD_MS = 380;
/** Moving further than this before the hold completes means it's a scroll or a click-drag, not a lift. */
const HOLD_SLOP = 10;
const EDGE = 44;
const SCROLL_STEP = 9;

interface Gesture {
  id: string;
  axis: 'x' | 'y';
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout> | null;
  lifted: boolean;
  /** Pointer offset inside the tile along the axis, taken at lift. */
  grab: number;
  /** Pointer position along the axis. */
  pointer: number;
  /** The translate currently applied to the lifted element. */
  shift: number;
  scroller: HTMLElement | null;
  scrollDir: -1 | 0 | 1;
  raf: number | null;
  cleanup: (() => void) | null;
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/(auto|scroll)/.test(o.overflowX + o.overflowY)) return p;
  }
  return null;
}

/** Press and hold a room tile to lift it, then drag it along `axis` to a new place; letting go saves the
 * order (per person, like the Reorder rooms dialog). Returns the tiles in their live order plus `bind`,
 * which gives each tile the props that make it liftable. Only room tiles go through this - the shelf stays put. */
export function useLiftReorder(tiles: TileModel[], axis: 'x' | 'y') {
  const { reorderRooms } = useRooms();
  // The order on screen while a tile is lifted, and from letting go until the save settles (so the tile
  // doesn't snap back for a moment before the cache catches up).
  const [order, setOrder] = useState<string[] | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const idsRef = useRef<string[]>([]);
  idsRef.current = tiles.map((t) => t.id);

  const applyOrder = (next: string[] | null) => {
    orderRef.current = next;
    setOrder(next);
  };

  /** Re-derive the lifted tile's translate and the drop position from the pointer. */
  const update = useCallback(() => {
    const g = gesture.current;
    const el = g && els.current.get(g.id);
    if (!g || !g.lifted || !el) return;
    const rect = el.getBoundingClientRect();
    const start = (g.axis === 'x' ? rect.left : rect.top) - g.shift;
    g.shift = g.pointer - g.grab - start;
    el.style.transform = `translate${g.axis === 'x' ? 'X' : 'Y'}(${g.shift}px) scale(1.08)`;

    const current = orderRef.current ?? idsRef.current;
    const others = current.filter((id) => id !== g.id);
    const before = others.filter((id) => {
      const r = els.current.get(id)?.getBoundingClientRect();
      return r ? (g.axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2) < g.pointer : false;
    }).length;
    const next = [...others.slice(0, before), g.id, ...others.slice(before)];
    if (next.some((id, i) => id !== current[i])) applyOrder(next);
  }, []);

  // A reorder moves the tile's layout slot; keep it under the pointer.
  useLayoutEffect(() => {
    update();
  }, [order, update]);

  const finish = useCallback(
    (cancelled: boolean) => {
      const g = gesture.current;
      if (!g) return;
      if (g.timer) clearTimeout(g.timer);
      if (g.raf !== null) cancelAnimationFrame(g.raf);
      g.cleanup?.();
      gesture.current = null;
      const el = els.current.get(g.id);
      if (el) el.style.transform = '';
      if (!g.lifted) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
      setLiftedId(null);
      const final = orderRef.current;
      if (cancelled || !final || final.every((id, i) => id === idsRef.current[i])) {
        applyOrder(null);
        return;
      }
      reorderRooms.mutate(final, { onSettled: () => applyOrder(null) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const lift = useCallback(() => {
    const g = gesture.current;
    const el = g && els.current.get(g.id);
    if (!g || !el) return;
    const rect = el.getBoundingClientRect();
    g.lifted = true;
    g.timer = null;
    g.grab = g.pointer - (g.axis === 'x' ? rect.left : rect.top);
    g.shift = 0;
    g.scroller = scrollParent(el);
    setLiftedId(g.id);
    applyOrder(idsRef.current);
    navigator.vibrate?.(14);

    const loop = () => {
      const cur = gesture.current;
      if (!cur || !cur.lifted) return;
      if (cur.scrollDir && cur.scroller) {
        if (cur.axis === 'x') cur.scroller.scrollLeft += cur.scrollDir * SCROLL_STEP;
        else cur.scroller.scrollTop += cur.scrollDir * SCROLL_STEP;
        update();
      }
      cur.raf = requestAnimationFrame(loop);
    };
    g.raf = requestAnimationFrame(loop);
  }, [update]);

  const onPointerDown = (id: string) => (e: PointerEvent<HTMLElement>) => {
    if (gesture.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const g: Gesture = {
      id,
      axis,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
      lifted: false,
      grab: 0,
      pointer: axis === 'x' ? e.clientX : e.clientY,
      shift: 0,
      scroller: null,
      scrollDir: 0,
      raf: null,
      cleanup: null,
    };
    g.timer = setTimeout(lift, HOLD_MS);
    gesture.current = g;

    const move = (ev: globalThis.PointerEvent) => {
      const cur = gesture.current;
      if (!cur) return;
      cur.pointer = cur.axis === 'x' ? ev.clientX : ev.clientY;
      if (!cur.lifted) {
        if (Math.hypot(ev.clientX - cur.startX, ev.clientY - cur.startY) > HOLD_SLOP) finish(true);
        return;
      }
      const box = cur.scroller?.getBoundingClientRect();
      if (box) {
        const lo = cur.axis === 'x' ? box.left : box.top;
        const hi = cur.axis === 'x' ? box.right : box.bottom;
        cur.scrollDir = cur.pointer < lo + EDGE ? -1 : cur.pointer > hi - EDGE ? 1 : 0;
      }
      update();
    };
    const up = () => finish(false);
    // Once lifted, the page must not scroll under the finger.
    const block = (ev: TouchEvent) => gesture.current?.lifted && ev.cancelable && ev.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block, { passive: false });
    g.cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', block);
    };
  };

  // Drop any gesture if the component goes away mid-drag.
  useEffect(() => () => finish(true), [finish]);

  const ordered = order
    ? [...tiles].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tiles;

  /** Props to spread onto a tile's button; `style` is merged over the tile's own. */
  function bind(tile: TileModel, onClick: () => void) {
    const lifted = liftedId === tile.id;
    const style: CSSProperties = {
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      ...(lifted ? { position: 'relative', zIndex: 5, boxShadow: '0 10px 26px rgba(0,0,0,0.4)', cursor: 'grabbing', transition: 'none' } : {}),
    };
    return {
      ref: (el: HTMLElement | null) => {
        if (el) els.current.set(tile.id, el);
        else els.current.delete(tile.id);
      },
      onPointerDown: onPointerDown(tile.id),
      onClick: (e: MouseEvent) => {
        if (suppressClick.current) {
          e.preventDefault();
          return;
        }
        onClick();
      },
      onContextMenu: (e: MouseEvent) => {
        if (gesture.current) e.preventDefault();
      },
      style,
    };
  }

  return { ordered, bind };
}
