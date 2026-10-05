import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiDuplicateScanResponse, DuplicateSuggestion, DuplicateSuggestionGame } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { AiPickedBadge, Banner, Btn, Cover, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];

const pairKey = (p: DuplicateSuggestion) => `${p.a.id}:${p.b.id}`;

/** AI duplicate finder (issue #824): scans the shelf for cards that are probably the same game and
 * offers to merge them. Always shows a preview and asks first, because a merge removes a card. */
export function DuplicatesDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const aiReady = !!ai.data && ai.data.effectiveSource !== 'none';
  const [scan, setScan] = useState<AiDuplicateScanResponse | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => gamesApi.aiScanDuplicates(),
    onSuccess: (res) => {
      setError(null);
      setGone([]);
      setScan(res);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });
  const merge = useMutation({
    mutationFn: ({ remove, keep }: { remove: DuplicateSuggestionGame; keep: DuplicateSuggestionGame }) => gamesApi.mergeGame(remove.id, { targetGameId: keep.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.mergeFailed')),
  });
  const dismiss = useMutation({
    mutationFn: (p: DuplicateSuggestion) => gamesApi.dismissDuplicate({ gameIdA: p.a.id, gameIdB: p.b.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });

  async function mergePair(p: DuplicateSuggestion, keep: DuplicateSuggestionGame) {
    const remove = keep.id === p.a.id ? p.b : p.a;
    const ok = await confirm({
      title: t('settings.duplicates.confirmTitle', { remove: remove.title, keep: keep.title }),
      message: t('settings.duplicates.confirmMessage', { remove: remove.title, keep: keep.title }),
      confirmLabel: t('settings.duplicates.merge'),
      danger: true,
    });
    if (!ok) return;
    setError(null);
    await merge.mutateAsync({ remove, keep });
    setGone((g) => [...g, pairKey(p)]);
    void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    ui.notify(t('settings.duplicates.merged', { remove: remove.title, keep: keep.title }));
  }

  async function notDuplicates(p: DuplicateSuggestion) {
    setError(null);
    await dismiss.mutateAsync(p);
    setGone((g) => [...g, pairKey(p)]);
  }

  const pairs = (scan?.pairs ?? []).filter((p) => !gone.includes(pairKey(p)));
  const busy = run.isPending || merge.isPending || dismiss.isPending;

  return (
    <Dialog onClose={() => ui.closeDialog('duplicates')} title={t('settings.duplicates.title')} gap={14}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.duplicates.intro')}</span>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {ai.data && !aiReady ? (
        <span style={st('font:500 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t('settings.duplicates.needsAi')}</span>
      ) : (
        <div style={st('display:flex;align-items:center;gap:10px')}>
          <Btn height={40} padX={18} disabled={busy || !aiReady} onClick={() => run.mutate()}>
            {run.isPending ? t('settings.duplicates.scanning') : scan ? t('settings.duplicates.scanAgain') : t('settings.duplicates.scan')}
          </Btn>
        </div>
      )}
      {scan && pairs.length === 0 && <span style={st('font:500 14px/1.45 var(--font-ui)')}>{scan.pairs.length === 0 ? t('settings.duplicates.none', { n: scan.checked }) : t('settings.duplicates.allDone')}</span>}
      {pairs.map((p) => (
        <div key={pairKey(p)} style={st('display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:var(--surf)')}>
          <div style={st('display:flex;align-items:center;gap:8px')}>
            <AiPickedBadge title={t('settings.duplicates.badge')} />
            <Kicker size={11}>{t('settings.duplicates.confidence', { n: Math.round(p.confidence * 100) })}</Kicker>
          </div>
          <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {[p.a, p.b].map((g) => (
              <div key={g.id} style={st('min-width:0;display:flex;flex-direction:column;gap:8px')}>
                <div style={st('display:flex;gap:10px;align-items:center;min-width:0')}>
                  <Cover title={g.title} url={g.coverImageUrl} width={40} radius={7} />
                  <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                    <span style={st('font:600 14px var(--font-ui);overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                    <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
                  </span>
                </div>
                <Btn kind="soft" height={36} padX={10} fontSize={12.5} disabled={busy} onClick={() => void mergePair(p, g)}>
                  {t('settings.duplicates.keepThis')}
                </Btn>
              </div>
            ))}
          </div>
          {p.reason && <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--text2)')}>{p.reason}</span>}
          <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={busy} onClick={() => void notDuplicates(p)}>
            {t('settings.duplicates.notDuplicates')}
          </Btn>
        </div>
      ))}
    </Dialog>
  );
}
