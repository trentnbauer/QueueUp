import { useInfiniteQuery } from '@tanstack/react-query';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

type Page = { entries: { id: string; message: string; createdAt: string }[]; nextBefore?: string | null };

/** A plain log of what happened, newest first, with Load more: a room's activity (Recap tab) or the
 * shelf's (History tab). */
export function ActivityLog({ queryKey, fetchPage, emptyText }: { queryKey: readonly unknown[]; fetchPage: (before: string | undefined) => Promise<Page>; emptyText: string }) {
  const t = useT();
  const activity = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const entries = activity.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <div style={st('display:flex;flex-direction:column')}>
      {activity.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
      {!activity.isLoading && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{emptyText}</span>}
      {entries.map((a) => (
        <div key={a.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
          <span>{a.message}</span>
          <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(a.createdAt)}</span>
        </div>
      ))}
      {activity.hasNextPage && (
        <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start', marginTop: 10 }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
          {activity.isFetchingNextPage ? t('common.loading') : t('settings.loadMore')}
        </Btn>
      )}
    </div>
  );
}
