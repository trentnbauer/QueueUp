// The lobby games' shared graphics kit. A new game draws with these, and gets the arena's look, the
// heads-up display, the countdown and result card, and the knock-out effects, from `renderScene`:
// see ../README.md for the standard.
export { renderScene, drawFloor, type Scene, type SceneGame } from './scene';
export { avatar, coverTile, groundShadow, hueOf, outlinedText, roundRect, type AvatarSpec } from './draw';
export { LobbyFx } from './fx';
export { FONT, STAGE, stageTheme, type StageTheme } from './theme';
