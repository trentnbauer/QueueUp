import { describe, expect, it } from 'vitest';
import { rememberSnapshot } from './events';

const snap = (run: number, phase = 'playing') => ({ run, phase });

describe('rememberSnapshot', () => {
  it('says what the last snapshot held only when a new one comes, in the same run while playing', () => {
    const previous = rememberSnapshot<number>();
    const a = snap(1);
    const b = snap(1);
    expect(previous(a, () => 1)).toBeNull(); // the first
    expect(previous(b, () => 2)).toBe(1);
    expect(previous(snap(1), () => 3)).toBe(2);
  });

  it('does not look at a snapshot that is drawn again, and does not make its value twice', () => {
    const previous = rememberSnapshot<number>();
    const a = snap(1);
    let made = 0;
    previous(a, () => ++made);
    previous(a, () => ++made);
    previous(a, () => ++made);
    expect(made).toBe(1);
    expect(previous(a, () => ++made)).toBeNull();
    expect(previous(snap(1), () => ++made)).toBe(1);
  });

  it('has nothing to say across runs, or when the run is not being played, so a new run clearing the board is not a pile of events', () => {
    const previous = rememberSnapshot<string>();
    previous(snap(1), () => 'run 1');
    expect(previous(snap(2), () => 'run 2')).toBeNull();
    expect(previous(snap(2, 'over'), () => 'over')).toBeNull();
    expect(previous(snap(2, 'countdown'), () => 'countdown')).toBeNull();
    // Once the run is on, it is compared with the countdown just before it (the same run, and the board is already laid), so the first moment is quiet.
    expect(previous(snap(2), () => 'playing')).toBe('countdown');
  });
});
