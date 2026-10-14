# Room lobby mini games

The games people play in a room's lobby while a spin waits for members (or from Room settings, with no
spin). They are **cosmetic**: nothing here changes which game a spin picks.

A game has two halves that never share code, only the snapshot type in `packages/shared/src/spinLobby.ts`:

| Half | Where | Job |
| --- | --- | --- |
| Rules | `packages/shared/src/lobbyGames/<game>.ts` | The simulation. In a room the server runs it (players send inputs, it sends a snapshot ~15 times a second); the same code runs in the browser for solo practice. Plain code: no server, database or browser APIs. |
| Look | `web/src/lobbyGames/<game>.ts` | Draws a snapshot on a canvas and names the game's buttons. Never decides anything. |

## Adding a game

1. **Shared:** add the id to `LobbyGameId` / `LOBBY_GAME_IDS` and a `<Game>Snapshot` type (extend `RoundSummary`) in `packages/shared/src/spinLobby.ts`, and add it to `LobbyGameSnapshot`.
2. **Rules:** a class extending `RoundGame` (`roundGame.ts`) in `packages/shared/src/lobbyGames/`. It only supplies players, a seeded course and its physics; waiting, the countdown, runs, results, wins and the run history come from the base. Register it in `packages/shared/src/lobbyGames/index.ts`.
3. **Web:** a `LobbyGameView` in `web/src/lobbyGames/<game>.ts` whose `draw` is one call to `renderScene(args, scene)`, and a line in `LOBBY_GAME_VIEWS` (`index.ts`).
4. **Strings:** the game's name, hint and button labels in `web/src/i18n/locales/{en,pirate}/spin.ts` as `spin.lobby.<game>.*`. The countdown, result and "you're out" text are shared (`spin.lobby.hud.*`); do not add per-game copies.
5. **Tests:** see "Before a PR".

## Controls

Phone-sized: **at most one movement axis (left/right, or up/down) plus one action button**, or one button alone. Declare them in the view: `pad` (`full`, `leftRight`, `none`), `holds` (buttons held down, one may be `primary`), `actions` (tap buttons), and `tapAction` / `tapHold` if tapping the arena should work too. Every control needs a keyboard key (arrows or A/D plus Space).

## Graphics standard

Every game uses the kit in `kit/` so the lobby looks like one product. The point is that a new game's art is just its *world*; everything around it is already done.

**`renderScene` draws, in this order:** the arena backdrop (warm dark gradient, accent glow, drifting dot grid), the game's world, effects, the heads-up display, then the red flash and vignette. A game supplies only:

- `scroll`: which way the dots drift (`'x'` as a course passes, `'y'` as things fall);
- `drawWorld(sc)`: the ground, obstacles and players;
- `anchor(snapshot, i)`: where player `i` is, so a knock-out burst starts in the right place.

**Rules**

- **Never draw the HUD yourself.** The metres pill, the players-left dots, the "RUN n STARTS IN" countdown, the winner card and the "you're out" note are the kit's. Games must not add their own banners or counters.
- **Obstacles are game covers.** Draw them with `coverTile(...)` and `hueOf(o.n)` (the server numbers every obstacle, so a colour never changes as it scrolls). They stand on `drawFloor(...)` with `groundShadow(...)`. Anything that is not a cover (a vote bubble, a pipe column) still takes its colours from the kit's `STAGE` and the app's CSS variables.
- **Players are drawn with `sc.drawPlayer(id, cx, cy, rx, ry)`.** Circle (`rx === ry`) or capsule (`ry` taller). Always iterate `sc.order()` so the viewer is drawn last and carries the "YOU" tag. **Do not draw players who are out**: the knock-out burst replaces them.
- **Everything is a fraction of `S`** (the arena's side in pixels) so it scales with the canvas. Mirror the server's hitbox sizes as named constants and comment where they come from, so what is drawn is what is hit.
- **Smooth motion:** use `sc.ease(key, x, y)` for things that jump between snapshots (a bird's height) and `sc.drift` for scrolling things (obstacle x, falling block y).
- **Effects are the kit's.** Do not write particles. A knock-out burst, shake, red flash and winner confetti happen by themselves from the snapshot (the kit compares each one with the last). Shake, flash and confetti are skipped when the device asks for reduced motion; anything else you animate (a bobbing bird, a flapping wing) must be gentle or stop for `prefersReducedMotion()`.
- **Colours:** use `sc.theme` (accent, text, danger, ...), which reads the CSS variables, so a room's tint and the Monochrome theme apply. The arena itself is a fixed dark stage on purpose, so a game reads the same in light and dark mode. Do not hard-code hex colours except an avatar's own colour.
- **Fonts:** `FONT.display` for big words, `FONT.ui` for labels, `FONT.mono` for numbers and kickers. Canvas text needs the real family names the kit exports.
- **Performance:** no per-frame allocation in loops that run per pixel; at most a few dozen draw calls per player; the kit caps particles at 500.

## Before a PR

- A test (next to the game, in `packages/shared/src/lobbyGames/`) with a **bot that plays the game** and clears several seeded courses for a minute, so the course can always be cleared. Add a bot that does the wrong thing and show it loses.
- Tests for the lifecycle your base class does not cover (anything the game adds).
- `docker build -f docker/Dockerfile.server .` must succeed: it type-checks the games' tests as well as the code (the shared package's build does it).
- A screenshot of the game's states (playing, knock-out, countdown, winner) rendered through the real `draw`. The headless harness used for the first three games is: bundle a small script that imports your view and draws sample snapshots into canvases, then screenshot it with headless Chrome.
- Not tried with real players yet? Say so in the PR.
