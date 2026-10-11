import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moderationApi } from '../api/moderation';
import { useUi } from '../context/UiContext';
import { Avatar, Btn, Group } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Everyone the signed-in user has blocked, each with an Unblock button. Renders nothing when
 * there is no one, so the Friends dialog stays as it was for most people. */
export function BlockedPeople(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['blocks'], queryFn: moderationApi.blocks });
  const unblock = useMutation({
    mutationFn: (b: { userId: string; displayName: string }) => moderationApi.unblock(b.userId),
    onSuccess: (_r, b) => {
      void queryClient.invalidateQueries({ queryKey: ['blocks'] });
      ui.notify(t('social.blocked.unblocked', { name: b.displayName }));
    },
    onError: (e) => ui.notify(e instanceof Error ? e.message : t('social.blocked.failed')),
  });
  const blocks = data?.blocks ?? [];
  if (blocks.length === 0) return null;
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px;margin-top:8px')}>
      <span style={st('font:700 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('social.blocked.heading')}</span>
      <Group>
        {blocks.map((b) => (
          <div key={b.userId} style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surf)')}>
            <Avatar name={b.displayName} color={b.avatarColor} avatarUrl={b.avatarUrl} size={36} fontSize={14} />
            <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui);overflow-wrap:anywhere')}>{b.displayName}</span>
            <Btn kind="ghost" height={34} padX={12} fontSize={12.5} disabled={unblock.isPending} onClick={() => unblock.mutate(b)}>
              {t('social.blocked.unblock')}
            </Btn>
          </div>
        ))}
      </Group>
    </div>
  );
}
