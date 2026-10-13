import { rich, useT } from '../i18n';
import { st } from './st';
import { StageCard, stageMetrics, usePhases, useStageWidth, type MergeGame } from './MergeStage';

/** A remaster or remake of another game: the two cards start stacked, move apart and a link draws between them. Nothing is merged;
 * both stay in the library. `original` is on the left and `newer` on the right. `kind` is null until one is chosen. */
export function RemasterStage({
  original,
  newer,
  kind,
  onSwap,
}: {
  original: MergeGame;
  newer: MergeGame;
  kind: 'remaster' | 'remake' | null;
  onSwap: () => void;
}) {
  const t = useT();
  const [stageRef, width] = useStageWidth<HTMLDivElement>();
  const m = stageMetrics(width);
  const { phase, replay, reduced } = usePhases<'reset' | 'stacked' | 'split' | 'linked'>(
    [
      { phase: 'reset', at: 0 },
      { phase: 'stacked', at: 40 },
      { phase: 'split', at: 1000 },
      { phase: 'linked', at: 1650 },
    ],
    `${original.title}|${newer.title}`,
  );
  const together = phase === 'reset' || phase === 'stacked';
  const linked = phase === 'linked';
  const transition = phase === 'reset' ? 'none' : 'transform .7s cubic-bezier(.6,0,.3,1), opacity .3s ease';
  const kindLabel = kind ? t(kind === 'remake' ? 'game.remaster.kind.remake' : 'game.remaster.kind.remaster').toUpperCase() : t('game.remaster.newer');
  const rel = kind ? t(kind === 'remake' ? 'game.remaster.remakeOf' : 'game.remaster.remasterOf') : t('game.remaster.newerOf');
  const coverMid = Math.round(m.pad + 21 + (m.coverW * 1.5) / 2);
  const baseShadow = '0 10px 24px oklch(0 0 0 / 0.35)';

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px;min-width:0')}>
      <div
        ref={stageRef}
        role="group"
        aria-label={t('game.remaster.stageAria')}
        style={st(`position:relative;border-radius:18px;background:var(--surf);overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:${m.gap}px;padding:${m.pad}px`)}
      >
        <div
          aria-hidden="true"
          style={st(`position:absolute;left:50%;top:${coverMid - 1}px;width:${Math.max(24, Math.round(m.colW - m.coverW))}px;height:2px;border-radius:2px;background:var(--acc);transform:translateX(-50%) scaleX(${linked ? 1 : 0});transition:transform .45s cubic-bezier(.6,0,.3,1);pointer-events:none`)}
        />
        <span
          aria-hidden="true"
          style={st(`position:absolute;left:50%;top:${coverMid - 13}px;width:26px;height:26px;border-radius:50%;background:var(--sheet);border:2px solid var(--acc);color:var(--accText);font:700 13px var(--font-ui);display:flex;align-items:center;justify-content:center;transform:translateX(-50%) scale(${linked ? 1 : 0.4});opacity:${linked ? 1 : 0};transition:opacity .3s ease .2s, transform .4s cubic-bezier(.3,1.6,.5,1) .2s;z-index:3;pointer-events:none`)}
        >
          ←
        </span>
        <StageCard
          game={original}
          other={newer}
          label={t('game.remaster.original')}
          labelColour="var(--text2)"
          compact={m.compact}
          coverW={m.coverW}
          colW={m.colW}
          titleSize={m.titleSize}
          transform={together ? 'translateX(calc(50% + 2px)) rotate(-5deg)' : 'translateX(0) rotate(0deg)'}
          opacity={phase === 'reset' ? 0 : 1}
          zIndex={1}
          transition={transition}
          coverShadow={baseShadow}
          captionOpacity={together ? 0 : 1}
          highlight={false}
        />
        <StageCard
          game={newer}
          other={original}
          label={kindLabel}
          labelColour="var(--accText)"
          compact={m.compact}
          coverW={m.coverW}
          colW={m.colW}
          titleSize={m.titleSize}
          transform={together ? 'translateX(calc(-50% - 2px)) rotate(5deg)' : 'translateX(0) rotate(0deg)'}
          opacity={phase === 'reset' ? 0 : 1}
          zIndex={2}
          transition={transition}
          coverShadow={linked ? `0 0 0 3px var(--acc), ${baseShadow}` : baseShadow}
          captionOpacity={together ? 0 : 1}
          highlight={false}
        />
        <span style={st('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap')}>
          {kind ? t('game.remaster.srLine', { newer: newer.title, kind: t(kind === 'remake' ? 'game.remaster.kind.remake' : 'game.remaster.kind.remaster').toLowerCase(), original: original.title }) : t('game.remaster.srLineNoKind', { newer: newer.title, original: original.title })}
        </span>
      </div>

      <span style={st('align-self:center;max-width:100%;padding:3px 10px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:700 10.5px/1.4 var(--font-mono);letter-spacing:0.04em;text-align:center;text-wrap:balance')}>
        ← {rel}
      </span>

      <div style={st('display:flex;justify-content:center;gap:8px;min-width:0')}>
        <button
          type="button"
          onClick={onSwap}
          aria-label={t('game.remaster.makeOriginalAria', { title: newer.title })}
          style={st('min-width:0;max-width:100%;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:600 12.5px var(--font-ui);display:flex;align-items:center;gap:4px;white-space:nowrap')}
        >
          <span style={st('flex-shrink:0')}>⇄</span>
          {m.compact ? (
            <span>{t('game.remaster.swapShort')}</span>
          ) : (
            <span style={st(`min-width:0;display:flex;gap:4px;max-width:${Math.max(70, Math.round(m.inner - 90))}px`)}>
              {rich(t('game.remaster.makeOriginal'), { title: <span key="t" style={st(`min-width:0;max-width:${Math.max(70, Math.round(m.inner - 190))}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{newer.title}</span> })}
            </span>
          )}
        </button>
        {!reduced && (
          <button type="button" onClick={replay} style={st('flex-shrink:0;height:34px;padding:0 12px;border-radius:999px;border:none;background:none;color:var(--muted);font:600 12.5px var(--font-ui)')}>
            ↻ {t('card.merge.replay')}
          </button>
        )}
      </div>
    </div>
  );
}
