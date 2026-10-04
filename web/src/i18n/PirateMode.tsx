import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { keepPattern, piratize } from './pirate';

/** Where text is left alone: what people type, code, and anything marked translate="no". */
const SKIP = 'input, textarea, select, script, style, code, pre, [contenteditable], [translate="no"]';
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;

/** Every game title and person's name in the loaded data: they're shown as they are, never
 * renamed (no "Ahoy-Fi Rush"). Games are the objects with a cover or an IGDB id; people have a
 * displayName. */
function namesIn(queryClient: QueryClient): Set<string> {
  const names = new Set<string>();
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.title === 'string' && ('coverImageUrl' in o || 'igdbId' in o || 'gameId' in o)) names.add(o.title);
    if (typeof o.displayName === 'string') names.add(o.displayName);
    for (const key in o) visit(o[key], depth + 1);
  };
  for (const query of queryClient.getQueryCache().getAll()) visit(query.state.data, 0);
  return names;
}

/** While the language is Pirate, rewrites the page's text as it renders (most of QueueUp's text
 * isn't in the translation catalog yet, so this is how the joke reaches every screen). It only
 * touches the DOM React already drew and remembers the originals, so switching back restores them. */
export function PirateMode({ on }: { on: boolean }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!on) return;
    // Rebuilt from the data cache when it changes (lazily: on the next text it rewrites).
    let keep = keepPattern(namesIn(queryClient));
    let keepDirty = false;
    // Each node's original text and what it was turned into, so a React re-render (which writes
    // fresh English) gets re-pirated, and switching off puts the English back.
    const texts = new Map<Text, { from: string; to: string }>();
    const attrs = new Map<Element, Map<string, { from: string; to: string }>>();

    const skip = (el: Element | null) => !!el?.closest(SKIP);

    const doText = (node: Text) => {
      const seen = texts.get(node);
      if (seen && node.data === seen.to) return;
      if (!node.data.trim() || skip(node.parentElement)) return;
      const to = piratize(node.data, keep);
      texts.set(node, { from: node.data, to });
      if (to !== node.data) node.data = to;
    };

    const doAttrs = (el: Element) => {
      if (el.closest('script, style')) return;
      for (const name of ATTRS) {
        const value = el.getAttribute(name);
        if (!value) continue;
        const map = attrs.get(el) ?? new Map<string, { from: string; to: string }>();
        const seen = map.get(name);
        if (seen && value === seen.to) continue;
        const to = piratize(value, keep);
        map.set(name, { from: value, to });
        attrs.set(el, map);
        if (to !== value) el.setAttribute(name, to);
      }
    };

    /** Brings the names up to date; when they changed, redoes the text already rewritten (a title
     * that arrived after its first render gets its real name back). */
    const refreshKeep = () => {
      if (!keepDirty) return;
      keepDirty = false;
      const next = keepPattern(namesIn(queryClient));
      if (String(next) === String(keep)) return;
      keep = next;
      for (const [node, entry] of texts) {
        if (!node.isConnected || node.data !== entry.to) continue;
        const to = piratize(entry.from, keep);
        texts.set(node, { from: entry.from, to });
        if (to !== node.data) node.data = to;
      }
    };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'added') keepDirty = true;
    });

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      doAttrs(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
        else doAttrs(n as Element);
      }
    };

    walk(document.body);
    const observer = new MutationObserver((records) => {
      // Forget nodes React has thrown away (a spin's per-frame text churns through plenty).
      if (texts.size > 4000) for (const node of texts.keys()) if (!node.isConnected) texts.delete(node);
      if (attrs.size > 4000) for (const el of attrs.keys()) if (!el.isConnected) attrs.delete(el);
      refreshKeep();
      for (const r of records) {
        if (r.type === 'characterData') doText(r.target as Text);
        else if (r.type === 'attributes') doAttrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    const title = document.title;
    document.title = piratize(title);

    return () => {
      observer.disconnect();
      unsubscribe();
      document.title = title;
      for (const [node, { from, to }] of texts) if (node.data === to) node.data = from;
      for (const [el, map] of attrs) for (const [name, { from, to }] of map) if (el.getAttribute(name) === to) el.setAttribute(name, from);
    };
  }, [on, queryClient]);
  return null;
}
