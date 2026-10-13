import type { PriceHistoryPoint } from '@queueup/shared';

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
