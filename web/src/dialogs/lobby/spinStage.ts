/** Which step the Spin button opens on, in a room.
 *
 * With no spin yet, the mini game comes first and its Vote to spin button moves on to the spin menu
 * (`stage` 'menu'). As soon as there is a spin (someone started one, or one is already running), the
 * spin screens take over - the waiting room has the same mini game and the vote in it. Nothing is shown
 * until the room's spin has been fetched, so the mini game does not flash up in front of a spin that is
 * already waiting. The Personal Shelf has no room, so no lobby: it goes straight to the menu. */
export function showMiniGameFirst(opts: { inRoom: boolean; hasSpin: boolean; spinLoaded: boolean; stage: 'game' | 'menu' }): boolean {
  return opts.inRoom && !opts.hasSpin && opts.spinLoaded && opts.stage === 'game';
}
