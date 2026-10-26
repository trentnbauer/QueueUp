// The lobby games' shared graphics kit. A new game draws with these, and gets the arena's look, the
// heads-up display, the countdown and result card, and the knock-out effects, from `renderScene`:
// see ../README.md for the standard.
export { renderScene, drawFloor, courseOffset, type Scene, type SceneGame } from './scene';
export { avatar, coverTile, drawLives, groundShadow, hueOf, outlinedText, roundRect, type AvatarSpec } from './draw';
export { OUT_ALPHA, STRIP_R, STRIP_Y, drawBadge, drawStandings, stripX, type BadgeKind, type StandingsOptions } from './standings';
export { PROMPT_Y, drawPrompt, drawTimer, emojiFont, type PromptTone } from './prompt';
export { LobbyFx } from './fx';
export { rememberSnapshot } from './events';
export { predictOwn } from './predict';
export { RESULT_RATING_STRIP, resultCardRect } from './hud';
export { FONT, STAGE, stageTheme, type StageTheme } from './theme';
