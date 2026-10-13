import { useEffect, useRef } from 'react';

/** Layers inside a card that Escape closes before the dialog around it does (an open sheet, a stacked DLC card). The most
 * recently opened handles the key, then the next. Listens on the window's capture phase so it runs ahead of the dialog's own
 * Escape handling, which then never sees the key. */
const handlers: (() => void)[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || handlers.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  handlers[handlers.length - 1]();
}

export function useSheetEscape(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const handler = () => ref.current();
    handlers.push(handler);
    if (!listening) {
      window.addEventListener('keydown', onKeyDown, true);
      listening = true;
    }
    return () => {
      const i = handlers.indexOf(handler);
      if (i >= 0) handlers.splice(i, 1);
      if (handlers.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown, true);
        listening = false;
      }
    };
  }, [active]);
}
