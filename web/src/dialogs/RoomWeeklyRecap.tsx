import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomRecapApi, roomRecapKey } from '../api/roomRecap';
import { roomsApi } from '../api/rooms';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { AiBadge, Banner, Btn, Toggle } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** The AI weekly recap in a room's settings (issue #830): the latest "this week in the room" summary
 * for everyone, and for the Room Master or a Moderator the switches to turn it on, also post it to
 * Discord, or write one now. */
export function RoomWeeklyRecap({ roomId }: { roomId: string }): ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const key = roomRecapKey(roomId);
  const recap = useQuery({ queryKey: key, queryFn: () => roomRecapApi.get(roomId) });
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const roomAi = useQuery({ queryKey: ['room-ai', roomId], queryFn: () => roomsApi.ai(roomId) });
  const [error, setError] = useState<string | null>(null);

  const set = (res: unknown) => queryClient.setQueryData(key, res);
  const update = useMutation({
    mutationFn: (body: { enabled?: boolean; postToDiscord?: boolean }) => roomRecapApi.update(roomId, body),
    onSuccess: (res) => {
      setError(null);
      set(res);
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('room.settings.recap.failed')),
  });
  const generate = useMutation({
    mutationFn: () => roomRecapApi.generate(roomId),
    onSuccess: (res) => {
      setError(null);
      set(res);
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('room.settings.recap.failed')),
  });

  const data = recap.data;
  if (!data) return null;
  // Written with the room's AI: the person's own, the room's sponsor, or the server's.
  const aiReady = (!!ai.data && ai.data.effectiveSource !== 'none') || !!roomAi.data?.sponsor;
  const busy = update.isPending || generate.isPending;
  const row = 'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--surf)';

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {data.recap ? (
        <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:16px;background:var(--surf)')}>
          <span style={st('display:flex;align-items:center;gap:8px')}>
            <AiBadge title={t('room.settings.recap.badge')} />
            <span style={st('font:600 12px var(--font-mono);letter-spacing:0.05em;color:var(--muted)')}>
              {t('room.settings.recap.week', { date: new Date(data.recap.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })}
            </span>
          </span>
          <p style={st('margin:0;font:400 14px/1.55 var(--font-ui);white-space:pre-wrap')}>{data.recap.text}</p>
        </div>
      ) : (
        <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>{data.enabled ? t('room.settings.recap.waiting') : t('room.settings.recap.none')}</span>
      )}
      {data.canManage && (
        <>
          <div style={st(row)}>
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:600 14px var(--font-ui)')}>{t('room.settings.recap.enable')}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{aiReady ? t('room.settings.recap.enableSub') : t('room.settings.recap.needsAi')}</span>
            </span>
            <Toggle on={data.enabled} label={t('room.settings.recap.enable')} onChange={(v) => update.mutate({ enabled: v })} />
          </div>
          {data.enabled && data.hasDiscordWebhook && (
            <div style={st(row)}>
              <span style={st('flex:1;font:600 14px var(--font-ui)')}>{t('room.settings.recap.discord')}</span>
              <Toggle on={data.postToDiscord} label={t('room.settings.recap.discord')} onChange={(v) => update.mutate({ postToDiscord: v })} />
            </div>
          )}
          <div>
            <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={busy || !aiReady} onClick={() => generate.mutate()}>
              {generate.isPending ? t('room.settings.recap.writing') : t('room.settings.recap.writeNow')}
            </Btn>
          </div>
          <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t('room.settings.recap.privacy')}</span>
        </>
      )}
    </div>
  );
}
