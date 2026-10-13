export interface PickerOption {
  id: string;
  title: string;
  /** Small extra line, e.g. the year or status. */
  sub?: string;
}

/** Most options listed at once: a library can have thousands of games, and a list that long only slows the page. The
 * rest are one search away. */
export const PICKER_MAX_SHOWN = 60;

/** The options whose title contains the search text (case and accent-insensitive), alphabetically, capped. */
export function filterPickerOptions(options: PickerOption[], query: string, max = PICKER_MAX_SHOWN): { shown: PickerOption[]; total: number } {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  const matches = q ? options.filter((o) => norm(o.title).includes(q)) : options;
  return { shown: matches.slice(0, max), total: matches.length };
}
