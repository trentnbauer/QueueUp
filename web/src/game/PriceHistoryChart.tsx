import { useQuery } from '@tanstack/react-query';
import type { PriceHistoryPoint } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { fmtMoney } from '../lib/gameView';
import { st } from '../ui/st';

const W = 300;
const H = 64;
const PAD = 4;

/** The line for a chart: prices only change at recorded moments, so it holds each price until the
 * next change (a step line), ending at the last point. Pure so it can be tested. */
export function priceChartPath(points: Pick<PriceHistoryPoint, 'at' | 'amount'>[], width = W, height = H, pad = PAD): string {
  if (points.length < 2) return '';
  const times = points.map((p) => new Date(p.at).getTime());
  const amounts = points.map((p) => p.amount);
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  const x = (t: number) => pad + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (width - 2 * pad));
  const y = (a: number) => (hi === lo ? height / 2 : height - pad - ((a - lo) / (hi - lo)) * (height - 2 * pad));
  let d = `M${x(times[0]).toFixed(1)},${y(amounts[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(times[i]).toFixed(1)} V${y(amounts[i]).toFixed(1)}`;
  }
  return d;
}

/** Small price history chart on the game card (wishlisted and owned games alike): what it has cost
 * over time, with the lowest and usual price. Hidden until there are at least two recorded prices. */
export function PriceHistoryChart({ gameId, currency }: { gameId: string; currency: string | null }) {
  const { data } = useQuery({
    queryKey: ['price-history', gameId, currency],
    queryFn: () => gamesApi.priceHistory(gameId, currency),
    staleTime: 10 * 60 * 1000,
  });
  if (!data || data.points.length < 2 || !data.currency) return null;
  const path = priceChartPath(data.points);
  const last = data.points[data.points.length - 1];
  const first = data.points[0];
  return (
    <div style={st('display:flex;flex-direction:column;gap:6px')}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Price history, from ${fmtMoney(first.amount, data.currency)} to ${fmtMoney(last.amount, data.currency)}`} preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--acc)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div style={st('display:flex;flex-wrap:wrap;gap:4px 12px;font:400 12px var(--font-ui);color:var(--muted)')}>
        <span>Since {new Date(first.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
        {data.lowest !== null && <span>Lowest {fmtMoney(data.lowest, data.currency)}</span>}
        {data.usual !== null && <span>Usually {fmtMoney(data.usual, data.currency)}</span>}
      </div>
    </div>
  );
}
