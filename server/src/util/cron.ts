/** A small 5-field cron expression parser ("minute hour day-of-month month day-of-week"), enough for
 * the admin-editable backup schedule without pulling in a cron library. Supports `*`, lists (`1,15`),
 * ranges (`1-5`), steps (a slash and a number, e.g. every 10 minutes, or `0-30/5`) and day-of-week 0-7 (0 and 7 are Sunday). Names (JAN, MON)
 * and the `@daily` shorthands are not supported. Evaluated in the server's local time zone (set TZ
 * in the container to change it). Like standard cron, when both day-of-month and day-of-week are
 * restricted a date matches if EITHER does. */

export interface CronSchedule {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
] as const;

function parseField(text: string, field: (typeof FIELDS)[number]): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined || part === '') throw new Error(`Invalid ${field.name} field "${text}"`);
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) throw new Error(`Invalid step in ${field.name} field "${text}"`);
      step = Number(stepPart);
    }
    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = field.min;
      hi = field.max;
    } else if (/^\d+$/.test(rangePart)) {
      lo = Number(rangePart);
      // "5/10" means 5-max in steps of 10, same as most crons.
      hi = stepPart !== undefined ? field.max : lo;
    } else if (/^\d+-\d+$/.test(rangePart)) {
      [lo, hi] = rangePart.split('-').map(Number);
    } else {
      throw new Error(`Invalid ${field.name} field "${text}"`);
    }
    if (lo < field.min || hi > field.max || lo > hi) {
      throw new Error(`${field.name[0].toUpperCase()}${field.name.slice(1)} must be between ${field.min} and ${field.max} (got "${text}")`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parses a 5-field cron expression, throwing an Error with a readable message if it's invalid. */
export function parseCron(expression: string): CronSchedule {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('A cron schedule needs 5 fields: minute hour day-of-month month day-of-week');
  const [min, hour, dom, month, dow] = parts;
  const daysOfWeek = parseField(dow, FIELDS[4]);
  if (daysOfWeek.has(7)) {
    daysOfWeek.delete(7);
    daysOfWeek.add(0);
  }
  return {
    minutes: parseField(min, FIELDS[0]),
    hours: parseField(hour, FIELDS[1]),
    daysOfMonth: parseField(dom, FIELDS[2]),
    months: parseField(month, FIELDS[3]),
    daysOfWeek,
    domRestricted: dom !== '*',
    dowRestricted: dow !== '*',
  };
}

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

/** True if the (local-time) minute containing `date` is one the schedule fires on. */
export function cronMatches(schedule: CronSchedule, date: Date): boolean {
  if (!schedule.minutes.has(date.getMinutes()) || !schedule.hours.has(date.getHours()) || !schedule.months.has(date.getMonth() + 1)) {
    return false;
  }
  const domOk = schedule.daysOfMonth.has(date.getDate());
  const dowOk = schedule.daysOfWeek.has(date.getDay());
  if (schedule.domRestricted && schedule.dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

/** The next time strictly after `from` that the schedule fires, or null if none within ~5 years
 * (e.g. "0 0 31 2 *"). */
export function nextCronRun(schedule: CronSchedule, from: Date): Date | null {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = from.getTime() + 5 * 366 * 24 * 60 * 60 * 1000;
  while (d.getTime() <= limit) {
    // Skip whole days/hours that can't match, so a yearly schedule doesn't walk every minute.
    if (!schedule.months.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    const domOk = schedule.daysOfMonth.has(d.getDate());
    const dowOk = schedule.daysOfWeek.has(d.getDay());
    const dayOk = schedule.domRestricted && schedule.dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (!dayOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!schedule.hours.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (schedule.minutes.has(d.getMinutes())) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}
