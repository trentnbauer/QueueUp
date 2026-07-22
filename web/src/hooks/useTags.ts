import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '../api/tags';

const TAGS_QUERY_KEY = ['tags'] as const;
// Same root useGames() mutations invalidate after a move - every shelf/room games query, any
// region - so a tag rename/delete (which can change what's embedded in already-cached Game rows)
// doesn't leave a stale tag name/id sitting in the grid until the next unrelated refetch.
const GAMES_QUERY_ROOT = ['games'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The caller's full tag list (issue #247) - account-wide, not scoped to the active shelf/room
 * view, since a tag applies "across your Personal Shelf and any room games you added." Backs the
 * "apply an existing tag" picker in GameDetailModal. Renaming/deleting a tag is account-level, so
 * both invalidate every games query too - a tag embedded in an already-cached Game row would
 * otherwise show a stale name (rename) or keep showing a tag that no longer exists (delete) until
 * some unrelated refetch happened to occur. */
export function useTags() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({ queryKey: TAGS_QUERY_KEY, queryFn: tagsApi.list });

  const create = useMutation({
    mutationFn: (name: string) => tagsApi.create({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }),
    onError: (err) => setActionError(errorMessage(err, 'Could not create that tag.')),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => tagsApi.rename(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    },
    onError: (err) => setActionError(errorMessage(err, 'Could not rename that tag.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => tagsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    },
    onError: (err) => setActionError(errorMessage(err, 'Could not delete that tag.')),
  });

  return {
    tags: query.data?.tags ?? [],
    isLoading: query.isLoading,
    actionError,
    clearActionError: () => setActionError(null),
    create: (name: string) => create.mutateAsync(name),
    isCreating: create.isPending,
    rename: (id: string, name: string) => rename.mutateAsync({ id, name }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
