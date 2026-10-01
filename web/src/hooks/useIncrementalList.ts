import { useEffect, useRef, useState } from 'react';

/** Renders a long list a page at a time: the first `pageSize` items, then another page whenever the
 * returned sentinel scrolls near the viewport. A shelf of 1000+ games would otherwise mount every
 * row (vote buttons and all) at once, which is slow on phones. `resetKey` changing (a new tab,
 * search or scope) starts again from the first page. */
export function useIncrementalList<T>(items: T[], resetKey: string, pageSize = 120) {
  const [shown, setShown] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setShown(pageSize), [resetKey, pageSize]);

  const hasMore = shown < items.length;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + pageSize);
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pageSize, shown]);

  return { visible: hasMore ? items.slice(0, shown) : items, hasMore, sentinelRef };
}
