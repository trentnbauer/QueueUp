/** Cleans what was typed into a word field: lower case letters a to z only, at most `length` of them. A phone's
 * keyboard can add capitals, spaces or suggestions, and none of it should reach the game. */
export function cleanTyped(raw: string, length: number): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, length);
}

/** The taps that turn the word the game has (`before`) into the one now in the field (`next`): a Backspace for
 * each letter taken off the end of what they share, then each new letter (a is target 0, b is 1, ...). */
export function typedTargets(before: string, next: string, backspace: number): number[] {
  let common = 0;
  while (common < before.length && common < next.length && before[common] === next[common]) common++;
  const taps: number[] = [];
  for (let i = before.length; i > common; i--) taps.push(backspace);
  for (let i = common; i < next.length; i++) taps.push(next.charCodeAt(i) - 97);
  return taps;
}
