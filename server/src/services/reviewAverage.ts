/** Average of a review's scored categories (each 1-5), or null when none are scored. Mirrors the
 * web's reviewAverage so the number in a notification matches the one shown in the app. */
export function reviewAverage(r: { art: number | null; gameplay: number | null; story: number | null; sound: number | null }): number | null {
  const vals = [r.art, r.gameplay, r.story, r.sound].filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
