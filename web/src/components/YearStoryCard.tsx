import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateYearStoryRequest, YearStoryFacts } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { roomsApi } from '../api/rooms';
import { yearStoryApi, yearStoryKey } from '../api/yearStory';
import { useConfirm } from '../context/ConfirmContext';
import { AiBadge, Banner, Btn, Toggle } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** The AI Year in Review story (issue #826), on the personal page (`roomId` null) and in a room.
 * Written from the numbers and titles in `facts` only. The person can regenerate it, edit it
 * (after which it is no longer shown as AI-written), hide it, and, for their own, share it on
 * their profile. Renders nothing when there is no story and no AI to write one. */
export function YearStoryCard({ roomId, facts }: { roomId: string | null; facts: YearStoryFacts }): ReactNode {
  const t = useT();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const key = yearStoryKey(roomId);
  const story = useQuery({ queryKey: key, queryFn: () => yearStoryApi.get(roomId) });
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const roomAi = useQuery({ queryKey: ['room-ai', roomId], queryFn: () => roomsApi.ai(roomId!), enabled: roomId !== null });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStory = (s: unknown) => queryClient.setQueryData(key, { story: s });
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  const generate = useMutation({
    mutationFn: () => yearStoryApi.generate(roomId, { facts }),
    onSuccess: (res) => {
      setError(null);
      setEditing(null);
      setStory(res.story);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (e) => fail(e, t('pages.story.failed')),
  });
  const update = useMutation({
    mutationFn: (body: UpdateYearStoryRequest) => yearStoryApi.update(roomId, body),
    onSuccess: (res) => {
      setError(null);
      setEditing(null);
      setStory(res.story);
    },
    onError: (e) => fail(e, t('pages.story.saveFailed')),
  });
  const remove = useMutation({
    mutationFn: () => yearStoryApi.remove(roomId),
    onSuccess: () => {
      setEditing(null);
      setStory(null);
    },
    onError: (e) => fail(e, t('pages.story.saveFailed')),
  });

  const s = story.data?.story ?? null;
  const aiReady = (!!ai.data && ai.data.effectiveSource !== 'none') || (roomId !== null && !!roomAi.data?.sponsor);
  const canWrite = aiReady && (s === null || s.canManage);
  if (!s && !canWrite) return null;
  const busy = generate.isPending || update.isPending || remove.isPending;

  async function confirmDelete() {
    const ok = await confirm({ title: t('pages.story.deleteTitle'), message: t('pages.story.deleteMessage'), confirmLabel: t('common.delete'), danger: true });
    if (ok) remove.mutate();
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:20px;background:linear-gradient(140deg, var(--hero1), var(--surf))')}>
      <div style={st('display:flex;align-items:center;gap:8px')}>
        <span style={st('font:700 16px var(--font-display)')}>{t(roomId ? 'pages.story.roomTitle' : 'pages.story.title')}</span>
        {s && !s.edited && <AiBadge title={t('pages.story.badge')} />}
      </div>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

      {!s && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t(roomId ? 'pages.story.introRoom' : 'pages.story.intro')}</span>}

      {s && editing === null && (
        <>
          {s.hidden && <span style={st('font:600 12px var(--font-mono);letter-spacing:0.05em;color:var(--muted)')}>{t('pages.story.hiddenNote')}</span>}
          {(!s.hidden || s.canManage) && <p style={st(`margin:0;font:400 14.5px/1.6 var(--font-ui);white-space:pre-wrap;color:${s.hidden ? 'var(--muted)' : 'var(--text)'}`)}>{s.text}</p>}
          {s.canManage && !roomId && (
            <div style={st('display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--surf)')}>
              <span style={st('flex:1;font:600 14px var(--font-ui)')}>{t('pages.story.share')}</span>
              <Toggle on={s.sharedOnProfile && !s.hidden} label={t('pages.story.share')} onChange={(v) => update.mutate({ sharedOnProfile: v })} />
            </div>
          )}
        </>
      )}

      {editing !== null && (
        <>
          <textarea
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            maxLength={2000}
            rows={8}
            aria-label={t('pages.story.editAria')}
            style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
          />
          <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('pages.story.editNote')}</span>
          <div style={st('display:flex;gap:8px')}>
            <Btn height={36} padX={16} disabled={busy || !editing.trim()} onClick={() => update.mutate({ text: editing })}>
              {t('common.save')}
            </Btn>
            <Btn kind="ghost" height={36} padX={12} disabled={busy} onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Btn>
          </div>
        </>
      )}

      {editing === null && (
        <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
          {canWrite && (
            <Btn height={36} padX={16} disabled={busy} onClick={() => generate.mutate()}>
              {generate.isPending ? t('pages.story.writing') : s ? t('pages.story.regenerate') : t('pages.story.write')}
            </Btn>
          )}
          {s?.canManage && (
            <>
              <Btn kind="soft" height={36} padX={14} disabled={busy} onClick={() => setEditing(s.text)}>
                {t('pages.story.edit')}
              </Btn>
              <Btn kind="soft" height={36} padX={14} disabled={busy} onClick={() => update.mutate({ hidden: !s.hidden })}>
                {s.hidden ? t('pages.story.show') : t('pages.story.hide')}
              </Btn>
              <Btn kind="ghost" height={36} padX={12} disabled={busy} style={{ color: 'var(--danger)' }} onClick={() => void confirmDelete()}>
                {t('common.delete')}
              </Btn>
            </>
          )}
        </div>
      )}
    </div>
  );
}
