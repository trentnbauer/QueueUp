import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { friendsApi } from '../api/friends';
import { useAuth } from '../context/AuthContext';

export const FRIENDS_QUERY_KEY = ['friends'] as const;
const ACTIVITY_QUERY_KEY = ['friends', 'activity'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Friends, incoming/outgoing requests and the viewer's own friend code. Polled lightly so a new
 * request lights the bell dot without a refresh. */
export function useFriends() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: FRIENDS_QUERY_KEY,
    queryFn: friendsApi.list,
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
  };

  const sendRequest = useMutation({
    mutationFn: (code: string) => friendsApi.sendRequest({ code }),
    onSuccess: invalidate,
  });
  const accept = useMutation({ mutationFn: (id: string) => friendsApi.accept(id), onSuccess: invalidate });
  const removeRequest = useMutation({ mutationFn: (id: string) => friendsApi.removeRequest(id), onSuccess: invalidate });
  const unfriend = useMutation({ mutationFn: (userId: string) => friendsApi.unfriend(userId), onSuccess: invalidate });

  return {
    data: query.data,
    isLoading: query.isLoading,
    friends: query.data?.friends ?? [],
    incoming: query.data?.incoming ?? [],
    outgoing: query.data?.outgoing ?? [],
    myCode: query.data?.myCode ?? '',
    sendRequest: (code: string) => sendRequest.mutateAsync(code),
    accept: (id: string) => accept.mutateAsync(id),
    removeRequest: (id: string) => removeRequest.mutateAsync(id),
    unfriend: (userId: string) => unfriend.mutateAsync(userId),
    errorMessage,
  };
}

export function useFriendActivity() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => friendsApi.activity(),
    enabled: !!user,
  });
}

export function useFriendProfile(userId: string | null) {
  return useQuery({
    queryKey: ['friends', 'profile', userId],
    queryFn: () => friendsApi.profile(userId!),
    enabled: !!userId,
  });
}
