import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '@queueup/shared';
import { gamesApi } from '../../api/games';
import { useScope } from '../../context/ScopeContext';
import { useUi } from '../../context/UiContext';
import { fmtMoney } from '../../lib/gameView';
import { formatRelativeTime } from '../../utils/relativeTime';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { priceChartPath } from '../PriceHistoryChart';
import { alertPresets, lowestAboveZero, priceModeOf } from './cardLogic';
import { Kicker, RowGroup } from './ui';

const CHART_W = 300;
const CHART_H = 48;

/** The recorded prices for a game (shared cache with anything else asking for the same), only fetched for a live price. */
export function usePriceHistory(game: Game) {
  return useQuery({
    queryKey: ['price-history', game.id, game.price.currency],
    queryFn: () => gamesApi.priceHistory(game.id, game.price.currency),
    enabled: priceModeOf(game) === 'live',
    staleTime: 10 * 60 * 1000,
  });
}

/** The lowest price on record above $0 (free giveaways don't count), or null while unknown. */
export function useLowestPrice(game: Game): number | null {
  const { data } = usePriceHistory(game);
  if (priceModeOf(game) !== 'live') return null;
  return lowestAboveZero(data?.points.map((p) => p.amount) ?? [], game.price.historicalLow);
}

const CARD = 'display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:18px;background:var(--surf)';
const MONO = 'font:500 11px var(--font-mono);color:var(--muted);text-transform:uppercase';
const INPUT_WRAP = 'display:flex;align-items:center;gap:6px;border-radius:999px;background:var(--bg);border:1px solid var(--line)';
const INPUT = 'flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--text);font:500 15px var(--font-ui)';
const SET_BTN = 'height:44px;padding:0 18px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui);flex-shrink:0';

function ago(iso: string | null): string {
  return iso ? formatRelativeTime(iso).toUpperCase() : '';
}

/** The price card at the top of Price History: live (with the step-line history), manual or none. */
function PriceCard({ game }: { game: Game }) {
  const t = useT();
  const mode = priceModeOf(game);
  const { data } = usePriceHistory(game);
  const lowest = useLowestPrice(game);

  if (mode === 'live') {
    const points = data?.points ?? [];
    const first = points[0];
    return (
      <div style={st(CARD)}>
        <div style={st('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}>
          <span style={st('font:800 26px var(--font-display)')}>{fmtMoney(game.price.amount, game.price.currency)}</span>
          {game.price.lastRefreshedAt && <span style={st(MONO)}>{t('card.price.source', { ago: ago(game.price.lastRefreshedAt) })}</span>}
        </div>
        {points.length >= 2 && (
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height={CHART_H} preserveAspectRatio="none" role="img" aria-label={t('game.priceChart.aria', { from: fmtMoney(points[0].amount, data?.currency), to: fmtMoney(points[points.length - 1].amount, data?.currency) })}>
            <path d={priceChartPath(points, CHART_W, CHART_H, 4)} fill="none" stroke="var(--acc)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
        <div style={st('display:flex;flex-wrap:wrap;gap:4px 12px;font:400 12px var(--font-ui);color:var(--muted)')}>
          {first && <span>{t('game.priceChart.since', { date: new Date(first.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) })}</span>}
          {lowest !== null && <span style={st('color:var(--accText);font-weight:600')}>{t('card.price.lowestExcl', { price: fmtMoney(lowest, game.price.currency) })}</span>}
          {data?.usual != null && <span>{t('game.priceChart.usual', { price: fmtMoney(data.usual, game.price.currency) })}</span>}
        </div>
      </div>
    );
  }

  if (mode === 'manual') {
    return (
      <div style={st(CARD)}>
        <div style={st('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}>
          <span style={st('font:800 26px var(--font-display)')}>{fmtMoney(game.manualPrice, game.price.currency)}</span>
          <span style={st(MONO)}>{t('card.price.manualBy')}</span>
        </div>
        <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('card.price.manualNote')}</span>
      </div>
    );
  }

  return (
    <div style={st(CARD)}>
      <div style={st('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}>
        <span style={st('font:800 26px var(--font-display);color:var(--faint)')}>{t('card.price.noneTitle')}</span>
        {game.price.lastRefreshedAt && <span style={st(MONO)}>{t('card.price.checked', { ago: ago(game.price.lastRefreshedAt) })}</span>}
      </div>
      <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('card.price.noneNote')}</span>
    </div>
  );
}

/** Price History: the price card, then PRICE SOURCE (your own price, and a refresh from gg.deals). */
export function PriceHistorySheet({ game }: { game: Game }) {
  const t = useT();
  const { ops } = useScope();
  const mode = priceModeOf(game);
  const refreshing = ops.isRefreshingPrice(game.id);
  const [draft, setDraft] = useState('');
  const value = parseFloat(draft);
  const canSave = draft.trim() !== '' && value >= 0;

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      <PriceCard game={game} />
      <Kicker>{t('card.price.sourceTitle')}</Kicker>
      <RowGroup radius={16}>
        <div style={st('display:flex;align-items:center;gap:10px;min-height:56px;padding:0 8px 0 16px;background:var(--surf)')}>
          <span style={st('font:600 14px var(--font-ui);flex-shrink:0')}>{t('card.price.manual')}</span>
          <div style={st(`${INPUT_WRAP};flex:1;min-width:0;height:40px;padding:0 12px`)}>
            <span style={st('font:600 14px var(--font-ui);color:var(--muted)')}>$</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder={mode === 'live' ? t('card.price.overrides') : game.manualPrice ?? t('card.price.example')}
              aria-label={t('game.detail.manual.aria')}
              style={st(INPUT)}
            />
          </div>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              ops.setManualPrice(game.id, String(value));
              setDraft('');
            }}
            style={st(`${SET_BTN};height:40px;padding:0 14px;font-size:13px;opacity:${canSave ? 1 : 0.5}`)}
          >
            {t('common.save')}
          </button>
        </div>
        {game.manualPrice && (
          <button
            type="button"
            onClick={() => ops.setManualPrice(game.id, null)}
            className="hv-surf2"
            style={st('display:flex;align-items:center;min-height:44px;padding:0 16px;border:none;background:var(--surf);color:var(--muted);font:600 13px var(--font-ui);text-align:left')}
          >
            {t('card.price.clearManual')}
          </button>
        )}
        <button
          type="button"
          onClick={() => !refreshing && ops.refreshPrice(game.id)}
          aria-busy={refreshing}
          className="hv-surf2"
          style={st(`display:flex;align-items:center;gap:12px;min-height:50px;padding:0 16px;border:none;background:var(--surf);color:var(--text);text-align:left;opacity:${refreshing ? 0.6 : 1}`)}
        >
          <span aria-hidden style={st('width:18px;text-align:center;font-size:15px')}>↻</span>
          <span style={st('flex:1;font:600 14px var(--font-ui)')}>{t('card.price.refresh')}</span>
          <span style={st('font:500 12.5px var(--font-ui);color:var(--muted)')}>
            {refreshing ? t('game.detail.checking') : game.price.lastRefreshedAt ? formatRelativeTime(game.price.lastRefreshedAt) : ''}
          </span>
        </button>
      </RowGroup>
    </div>
  );
}

/** Price alert: tell me when it drops to... Presets from the history, or a price of your own. Needs a live gg.deals price. */
export function PriceAlertSheet({ game }: { game: Game }) {
  const t = useT();
  const ui = useUi();
  const { ops, isShelf } = useScope();
  const mode = priceModeOf(game);
  const lowest = useLowestPrice(game);
  const [custom, setCustom] = useState('');
  const current = Number(game.price.amount);
  const alert = game.targetPrice !== null ? Number(game.targetPrice) : null;
  const currency = game.price.currency;

  if (mode !== 'live') {
    return <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);padding:0 4px;text-wrap:pretty')}>{t('card.alert.needsLive')}</span>;
  }

  function set(v: number | null) {
    ops.setTargetPrice(game.id, v === null ? null : String(v));
    if (v !== null) ui.notify(t('game.detail.alert.saved', { price: fmtMoney(v, currency) }));
  }

  const presets = alertPresets(current, lowest);
  const labels = { low: t('card.alert.low'), half: t('card.alert.half'), any: t('card.alert.any') };
  const subs = {
    low: t('card.alert.lowSub'),
    half: t('card.alert.halfSub'),
    any: t('card.alert.anySub', { price: fmtMoney(current, currency) }),
  };
  const customValue = parseFloat(custom);

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      {alert !== null && (
        <div style={st('display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-radius:16px;background:var(--accSoft);border:1px solid var(--accA35)')}>
          <span style={st('font-size:16px')}>🔔</span>
          <span style={st('flex:1;font:600 14px var(--font-ui);color:var(--accText)')}>{t('card.alert.at', { price: fmtMoney(alert, currency) })}</span>
          <button type="button" onClick={() => set(null)} style={st('height:30px;padding:0 12px;border-radius:999px;border:none;background:var(--accA20);color:var(--accText);font:600 12px var(--font-ui)')}>
            {t('common.remove')}
          </button>
        </div>
      )}
      <Kicker>{t('card.alert.tellMe')}</Kicker>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        {presets.map((p) => {
          const on = alert === p.value;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => set(on ? null : p.value)}
              style={st(`display:flex;align-items:center;gap:12px;min-height:50px;padding:0 14px;border-radius:14px;text-align:left;color:var(--text);background:${on ? 'var(--accSoft)' : 'var(--surf)'};border:1px solid ${on ? 'var(--accA45)' : 'transparent'}`)}
            >
              <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14px var(--font-ui)')}>{labels[p.key]}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{subs[p.key]}</span>
              </span>
              <span style={st('font:700 15px var(--font-display)')}>{fmtMoney(p.value, currency)}</span>
            </button>
          );
        })}
      </div>
      <div style={st('display:flex;gap:8px')}>
        <div style={st(`${INPUT_WRAP};flex:1;height:44px;padding:0 14px;background:var(--surf)`)}>
          <span style={st('font:600 15px var(--font-ui);color:var(--muted)')}>$</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={t('card.alert.custom')} aria-label={t('game.detail.alert.aria')} style={st(INPUT)} />
        </div>
        <button
          type="button"
          disabled={!(customValue > 0)}
          onClick={() => {
            set(customValue);
            setCustom('');
          }}
          style={st(`${SET_BTN};opacity:${customValue > 0 ? 1 : 0.5}`)}
        >
          {t('game.detail.set')}
        </button>
      </div>
      <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted);padding:0 4px;text-wrap:pretty')}>{isShelf ? t('card.alert.noteShelf') : t('card.alert.noteRoom')}</span>
    </div>
  );
}
