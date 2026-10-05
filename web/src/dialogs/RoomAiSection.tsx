import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomsApi } from '../api/rooms';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Avatar, Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { AiSettingsDialog } from './AiSettingsDialog';

/** Room settings: who, if anyone, has applied their own AI key to this room. Their key is never
 * shown - only that they're providing it. The sponsor, the Room Master and Moderators can remove it;
 * a member who has set up their own AI provider can apply it while nobody else has. */
export function RoomAiSection({ roomId, onOpenProfile }: { roomId: string; onOpenProfile?: () => void }) {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const key = ['room-ai', roomId];
  const { data } = useQuery({ queryKey: key, queryFn: () => roomsApi.ai(roomId) });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onError = (e: unknown) => ui.showError(e instanceof Error ? e.message : t('room.settings.ai.error'));
  const apply = useMutation({
    mutationFn: () => roomsApi.applyAi(roomId),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      ui.notify(t('room.settings.ai.applied'));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => roomsApi.removeAi(roomId),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      ui.notify(t('room.settings.ai.removed'));
    },
    onError,
  });

  if (!data) return null;
  const { sponsor } = data;

  async function confirmRemove() {
    const ok = await confirm({
      title: t('room.settings.ai.removeTitle'),
      message: data!.youAreSponsor ? t('room.settings.ai.removeMessageSelf') : t('room.settings.ai.removeMessage', { name: sponsor?.displayName ?? '' }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (ok) remove.mutate();
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      {sponsor ? (
        <div style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
          <Avatar
            name={sponsor.displayName}
            color={sponsor.avatarColor}
            avatarUrl={sponsor.avatarUrl}
            size={32}
            fontSize={13}
            profileUserId={data.youAreSponsor ? undefined : sponsor.id}
            onOpenProfile={onOpenProfile}
          />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>
              {data.youAreSponsor ? t('room.settings.ai.sponsorYou') : t('room.settings.ai.sponsor', { name: sponsor.displayName })}
            </span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t('room.settings.ai.sponsorHint')}</span>
          </span>
          {data.canRemove && (
            <Btn height={34} padX={14} fontSize={13} disabled={remove.isPending} onClick={() => void confirmRemove()}>
              {t('common.remove')}
            </Btn>
          )}
        </div>
      ) : (
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.ai.none')}</span>
      )}
      {!sponsor && data.canApply && (
        <div style={st('display:flex;flex-direction:column;gap:6px;align-items:flex-start')}>
          <Btn height={40} fontSize={13} disabled={apply.isPending} onClick={() => apply.mutate()}>
            {t('room.settings.ai.apply')}
          </Btn>
          <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.ai.applyHint')}</span>
        </div>
      )}
      {!sponsor && !data.hasOwnSettings && (
        <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.ai.noOwn')}</span>
      )}
      <Btn kind="soft" height={38} padX={14} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setSettingsOpen(true)}>
        {t('room.settings.ai.openMine')}
      </Btn>
      {settingsOpen && (
        <AiSettingsDialog
          onClose={() => {
            setSettingsOpen(false);
            void queryClient.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </div>
  );
}
