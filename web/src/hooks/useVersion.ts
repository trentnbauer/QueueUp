import { useQuery } from '@tanstack/react-query';
import { versionApi } from '../api/version';

/** What build of the app is actually running - baked into the Docker image at build time (see
 * docker/Dockerfile.server), 'dev' outside of it. Static for the life of the server process, so
 * this never needs to refetch/poll. */
export function useVersion() {
  const query = useQuery({
    queryKey: ['version'],
    queryFn: versionApi.get,
    staleTime: Infinity,
  });

  return { version: query.data?.version ?? null, sha: query.data?.sha ?? null };
}
