import { useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '../api/games';

/** After a game is added to the Personal Shelf, quietly asks the server to have the person's own AI judge whether
 * it is an erotic game IGDB did not tag. When it says yes the game joins the "hide these from your public
 * library?" prompt, which is refetched here. Nothing is shown otherwise, and a failure is ignored: this is a
 * background nicety (the server skips it when the person has no AI of their own). */
export function useSensitiveCheck() {
  const queryClient = useQueryClient();
  return (gameId: string) => {
    gamesApi
      .sensitiveCheck(gameId)
      .then((res) => {
        if (res.flagged) void queryClient.invalidateQueries({ queryKey: ['games', 'sensitive'] });
      })
      .catch(() => undefined);
  };
}
