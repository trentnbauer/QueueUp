import type { Game } from '@queueup/shared';

/** The shared contract every Spin the Wheel theme component implements (issue #297, reworked for
 * issue #356's click-to-nudge follow-up): the dispatcher (SpinWheelModal) owns the physics -
 * building the candidate strip, deciding the live `position`, and deciding when it's `settled` -
 * a theme's only job is rendering *itself* for whatever position it's handed this frame. Themes no
 * longer run their own timers/animation-end callbacks; there's nothing to schedule; every prop
 * here can change on any frame (the strip is the exception - see below) and the theme just paints
 * accordingly. */
export interface SpinThemeProps {
  /** The full circular candidate strip driving this spin (see spinPicker.ts's buildSpinStrip) -
   * built once per spin/restart and never changed by a nudge, only traveled along further. A
   * theme that doesn't visualize individual candidates at all (see CrateTheme) can ignore this. */
  strip: Game[];
  /** Continuous, live position along `strip` (in strip slots - see spinPhysics.ts) - keeps moving
   * every animation frame while unsettled (forward, or backward if the spin's been reversed - see
   * `velocity`), driven by the dispatcher's own decay-curve math, not by anything a theme schedules
   * itself. Once `settled`, this is frozen at its final resting value. */
  position: number;
  /** Continuous, live velocity (strip slots/second - see spinPhysics.ts) - how fast `position` is
   * currently changing. Can be negative (issue #487: repeated left nudges can reverse the spin) -
   * sign is direction, magnitude is speed; a theme that only cares "how hard is this being nudged
   * right now" (see CrateTheme below) should read `Math.abs(velocity)`, not `velocity` directly.
   * Themes that visualize individual candidates rarely need this at all (position already reflects
   * it). Always 0 once `settled`. */
  velocity: number;
  /** True once the spin has come to rest - `position` no longer changes and `winner` is set. A
   * theme should stop any of its own continuous animation and show its "landed" visual once this
   * flips true. */
  settled: boolean;
  /** The resolved winner, or null while still spinning - only ever non-null once `settled`. */
  winner: Game | null;
}
