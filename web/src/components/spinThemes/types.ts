import type { Game } from '@queueup/shared';

/** The shared contract every Spin the Wheel theme component implements (issue #297) - winner
 * selection, the reveal panel (title/time-to-beat/actions), and the confetti celebration all live
 * once in SpinWheelModal, the shared dispatcher; a theme only owns its own pre-reveal animation.
 * `winner` is chosen once per spin by the dispatcher (not by the theme), so every theme animates
 * toward the same already-decided outcome rather than each re-implementing weighted selection. */
export interface SpinThemeProps {
  /** The full candidate pool, for a theme's own decorative filler (e.g. what else appears on the
   * reel/wheel/cards alongside the winner) - not necessarily all shown at once. */
  candidates: Game[];
  winner: Game;
  /** Each candidate's actual Spin the Wheel odds (spinCandidateWeight, keyed by game id) - computed
   * once by the dispatcher since it needs the full room `games` list (for avoidedGenres) that
   * themes don't otherwise receive. Used by the roulette theme (issue #355) to size each slice
   * proportionally to its real chance of winning, instead of a plain equal-sized wedge. */
  candidateWeights: Map<string, number>;
  /** Changes on every spin ("Spin again" included) - a theme should treat this as its own re-run
   * signal (e.g. a useEffect dependency) to restart its animation from scratch. */
  spinKey: number;
  /** Called exactly once per spin, when the theme's own animation has finished and it's time for
   * the shared reveal panel + confetti to appear. */
  onRevealed: () => void;
}
