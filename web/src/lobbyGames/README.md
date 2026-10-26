# Room lobby mini games

The games people play in a room's lobby while a spin waits for members (or from Room settings, with no
spin). They are **cosmetic**: nothing here changes which game a spin picks.

A game has two halves that never share code, only the snapshot type in `packages/shared/src/spinLobby.ts`:

| Half | Where | Job |
| --- | --- | --- |
| Rules | `packages/shared/src/lobbyGames/<game>.ts` | The simulation. In a room the server runs it (players send inputs, it sends a snapshot ~15 times a second); solo practice is a private lobby of one on the server too, so every saved score is one the server saw. Plain code: no server, database or browser APIs. |
| Look | `web/src/lobbyGames/<game>.ts` | Draws a snapshot on a canvas and names the game's buttons. Never decides anything. |

## Adding a game

1. **Shared:** add the id to `LobbyGameId` / `LOBBY_GAME_IDS` and a `<Game>Snapshot` type (extend `RoundSummary`) in `packages/shared/src/spinLobby.ts`, and add it to `LobbyGameSnapshot`.
2. **Rules:** a class extending `RoundGame` (`roundGame.ts`) in `packages/shared/src/lobbyGames/`. It only supplies players, a seeded course and its physics; waiting, the countdown, runs, results, wins and the run history come from the base. Register it in `packages/shared/src/lobbyGames/index.ts`.
3. **Web:** a `LobbyGameView` in `web/src/lobbyGames/<game>.ts` whose `draw` is one call to `renderScene(args, scene)`, and a line in `LOBBY_GAME_VIEWS` (`index.ts`).
4. **Strings:** the game's name, tagline, hint and button labels in `web/src/i18n/locales/{en,pirate}/spin.ts` as `spin.lobby.<game>.*`. The countdown, result and "you're out" text are shared (`spin.lobby.hud.*`); do not add per-game copies. A game whose score is not metres (coins, swings, points) picks its words in `SCORE_WORDS` (`kit/hud.ts`).
5. **Docs:** a section for the game in `docs/minigames.md` (goal, what knocks you out, speeds and timings with the numbers from the rules class), a row in its controls table, and the game's name in the lists there it belongs in (client-sim games, scrolling games).
6. **Tests:** see "Before a PR".

Nothing on the server changes: it runs every game through `createLobbyGame`, and the practice picker and the lobby's random pick read `LOBBY_GAME_IDS`.

## Things only one person may see

Most games look the same to everyone. A game with something that belongs to one person (Battleships: where *your* ships are) uses the `viewer` the rules class is given: `snapshot(viewer)` returns that person's view, and the server sends every connection its own (`SpinLobbyHub.broadcastState`). Put the hidden thing in the snapshot only when `viewer` is its owner, and never in the part everyone gets. A bot is given its own view too (`BotFiller` calls `snapshot(botId)`), and a spectator or `snapshot()` with no viewer gets none of it. Test it: what one person's snapshot says must not contain what another's does.

## Where a player is worked out

A game whose players **do not affect each other** (they share a course but never collide or compete for the same thing) can run each player on their own device, so ping does not matter to their own play. In the rules class:

- `get clientSim()` returns true.
- `readReport(p, fields)` copies a player's reported fields into the player (use `RoundGame.num` on every field: a client is trusted to be honest, not well-formed), and `writeReport(p)` makes that report, a few small numbers, from the player.
- In `advance`, skip players the server does not work out: `if (!p.alive || !this.simulated(p)) continue;`. A player is not `simulated` once they report, so the server stops moving them; one who never reports (an older client, a bot) is still worked out here.

The web side needs no change: `ClientSim` (`web/src/lobbyGames/clientSim.ts`) runs a one-person copy of the same game from the server's seed and start time and lays this player and its course over the server's snapshot, so the view draws it as usual. Everything about the run's lifecycle (countdown, who is in, the winner, results) stays on the server. See `docs/minigames.md` ("Ping and who works out what").

A game where players compete for the same thing (a coin, a mole, a finish line) stays on the server for now; leave `clientSim` false.

## Controls

Phone-sized: **at most one movement axis (left/right, or up/down) plus one action button**, or one button alone. Declare them in the view: `pad` (`full`, `leftRight`, `none`), `holds` (buttons held down, one may be `primary`), `actions` (tap buttons), and `tapAction` / `tapHold` if tapping the arena should work too. Every control needs a keyboard key (arrows or A/D plus Space).

**Or the play space is the controller:** a game can declare `taps` instead (see `taps.ts`): a grid (`{ cols, rows }`, numbered left to right then top to bottom) or a list of rectangles, as fractions of the arena, plus a keyboard key per target (`keys`, by target number; a 3x3 grid uses the numpad layout `7 8 9 / 4 5 6 / 1 2 3`). Then there is **no pad and nothing under the arena**: the arena is the controller, a game uses `taps` or the buttons above, never both. The game draws its own targets where they are declared and passes the same `taps` to `renderScene` (the `SceneGame.taps` field), which lights the target that was just tapped. A tap reaches the game as `tap(userId, target)` on its rules class (override `RoundGame.tap`); the server only ever passes a whole number from 0 to `LOBBY_TAP_TARGETS_MAX - 1`, and the game must ignore an index it has no target for. A tap names a target, never a position, so a client cannot invent one.

## Graphics standard

### The arena's zones

The arena is square, and every size is a fraction of `S`, its side in pixels. The vertical bands are fixed, so a player switching games always finds the same things in the same places:

| Band (y) | What | Drawn by |
| --- | --- | --- |
| 0 – 0.008 | **Timer**: time left in the round or pick | `drawTimer(sc, left)` |
| 0.035 – 0.11 | **HUD**: score pill (left), players-left dots (right) | kit, automatically |
| ~0.13 – 0.22 | **Standings strip**: everyone, their score, a badge, optional lives | `drawStandings(sc, o)` |
| 0.275 | **Prompt**: the one line saying what to do now | `drawPrompt(sc, text, tone)` |
| 0.3 – 1 | **World**: the board, course, beam, pond, etc. | the game |
| centre | Countdown, result card, "You're out" | kit, automatically |

A scrolling game (Runner, Flappy, Dodge…) whose players are *in* the world does not need a standings strip. Its players are on the course, and the HUD dots say who is still in. Every game whose players are *not* in the world (boards, buttons, bars, tap targets) uses the strip.

### Rules

**Never draw the HUD yourself.** The score pill, the players-left dots, the countdown, the result card and the "you're out" note belong to the kit. Games must not add their own banners or counters.

**Standings: one strip, never your own row.** If a game shows everyone's score, it calls `drawStandings`. Do not write a loop that places avatars and `fillText`s scores. The strip fixes:
- its position (`STRIP_Y` 0.15), avatar radius (`STRIP_R` 0.022) and spacing (`stripX(n, i)`);
- the score text: Geist Mono 600 at `S * 0.024`, in `accText` for the viewer and `text` for everyone else;
- **out players stay in the row**, drawn at `OUT_ALPHA` (0.35), so the row never reshuffles mid-run. Never `continue` past an out player;
- the viewer gets the accent ring but no YOU tag (the HUD pills sit right above).

Use `text` to change what the line says (a `3/5` progress), `badge` for a status mark, and `under` for anything below it (lives, a push arrow). Use `stripX` in your `anchor()` too, so a knock-out burst starts on the avatar.

**Status marks are badges, not characters.** Right, wrong, too late, a tie and finished are `drawBadge` kinds: `ok`, `no`, `late`, `tie` and `done`. Never type ✓ ✗ ⏱ = into canvas text. The UI fonts have no glyphs for them, so each OS swaps in its own, and a mark typed after a score pushes the score off-centre.

**One prompt line.** The "what to do now" text (`Your turn`, `Round 3`, `Stop it!`) goes through `drawPrompt`: Bricolage 800 at `S * 0.044`, **sentence case**, centred, at `PROMPT_Y` (0.275). There are four tones:
- `text`: neutral (a round number, "Decided");
- `go`: mint, your move now;
- `warn`: danger, hurry up or a mistake;
- `accent`: an action cue.

Only one prompt shows at a time. Pass a different `y` only when the world needs the line somewhere else (Stop's cue under its bar, RPS between the hands and the choices). In-arena prompts are never all caps. Caps are for mono kickers only (`RUN 3 STARTS IN`, `WINNER`).

**One timer.** Time left goes through `drawTimer(sc, left)`: a thin bar along the very top edge over a faint track. It is accent, then danger below 30%. Pass `null` when there is no clock. Do not draw a second timer anywhere in the world.

**One play space.** Everyone plays on the same arena, in the same world. Do not give each player their own window, strip, lane or mini-board, whether stacked or side by side. Players differ by where they are in the one shared space. The standings strip is information, not a playing field.

**Players are drawn with `sc.drawPlayer(id, cx, cy, rx, ry, opts?)`.** It draws a circle (`rx === ry`) or a capsule (`ry` taller). This covers every player-owned object: a ball on a beam, a car, a fish-hook float. Do not draw a player's object in their colour by hand, because the viewer would lose the accent ring and the YOU tag. Always iterate `sc.order()` so the viewer is drawn last. **Do not draw players who are out in the world.** The knock-out burst replaces them, and the strip keeps them dimmed.

**Objects are game covers.** Obstacles and any object you pick or hit (choice cards, targets, blocks) are drawn with `coverTile(...)` and `hueOf(o.n)`, so a colour never changes as it scrolls. They stand on `drawFloor(...)` with `groundShadow(...)`. Anything that is not a cover still takes its colours from the kit's `STAGE` and `sc.theme`.

**Selection is the accent ring.** Your pick, your panel or your choice is outlined in `theme.acc` at `max(2, S * 0.007)` px. Never use white or `theme.text` for selection. Dim the choices you did not pick to 0.4.

**Everything is a fraction of `S`.** Mirror the server's hitbox sizes as named constants, and comment where they come from, so what is drawn is what is hit.

**Smooth motion.** Use `sc.ease(key, x, y)` for things that jump between snapshots and `sc.drift` for scrolling things.

**Everything on the course moves at the course's speed.** Obstacles use `o.x - sc.drift`. Repeating patterns use `courseOffset(sc, period)`, and never scale an offset you already have. Only the kit's dot grid moves slower, for parallax. A game where nothing scrolls sends `speed: 0`.

**Sounds are the kit's too.** The countdown ticks, the go cue, knock-outs, the win jingle, button and tap presses and `fx.confettiAt` (a collect chime, or the `sound` you pass) all play by themselves, through `playSound` (`web/src/lib/sound.ts`; the player's Sound effects setting mutes them). Do not load audio in a game. A new sound is a CC0 `.ogg` in `web/public/sounds/` plus a name in `SOUNDS`, with its licence kept beside it.

**Effects are the kit's.** Do not write particles. The knock-out burst, shake, red flash and confetti come from the snapshot. Anything else you animate (a bobbing mole, a flicker) must be gentle, or stop under `prefersReducedMotion()`.

**Colours come from `sc.theme`.** That means `acc`, `accSoft`, `accText`, `mint`, `star`, `danger`, `errBg`, `errLine`, `errText` and `text`, which follow the room's tint and Monochrome. **Never write the default accent (`oklch(0.74 0.15 45 …)`) as a literal.** It is the one colour that must change per room. World art (a mole, a pond, a beam) may use its own fixed `oklch()` colours. Avoid hex, except for an avatar's own colour.

**Fonts.** Use `FONT.display` (Bricolage Grotesque) for big words and prompts, `FONT.ui` (Geist) for labels and names, and `FONT.mono` (Geist Mono) for numbers, scores and kickers. Canvas text needs the real family names the kit exports.

**Emoji only through `emojiFont(px)`.** If a game draws an emoji (RPS hands, Runner's 😴), set its font with `emojiFont` so it renders in colour on Windows and Linux too. Use emoji only for content that *is* a picture. Never use them for status (that is `drawBadge`) or for UI chrome.

**Performance.** No per-frame allocation in loops that run per pixel, at most a few dozen draw calls per player, and the kit caps particles at 500.

### Checklist for a new game's PR

- [ ] `draw` is one call to `renderScene`.
- [ ] Scores use `drawStandings` (or the game is a scroller with players in the world).
- [ ] No `fillText` of ✓ ✗ ⏱ = or other status characters; status uses `drawBadge`.
- [ ] Any "what to do" text goes through `drawPrompt`, in sentence case.
- [ ] Any clock goes through `drawTimer`.
- [ ] Every player-owned object goes through `sc.drawPlayer`; out players are not drawn in the world.
- [ ] Your selection uses the accent ring.
- [ ] `grep "0.15 45"` finds nothing in the new file.
- [ ] Screenshots of playing, knock-out, countdown and winner, with **two room tints** (the default and one other) and the Monochrome theme.

## Before a PR

- A test (next to the game, in `packages/shared/src/lobbyGames/`) with a **bot that plays the game** and clears several seeded courses for a minute, so the course can always be cleared. Add a bot that does the wrong thing and show it loses.
- Tests for the lifecycle your base class does not cover (anything the game adds).
- `docker build -f docker/Dockerfile.server .` must succeed: it type-checks the games' tests as well as the code (the shared package's build does it).
- A **speed check** if anything scrolls: take two frames a known time apart and confirm an obstacle and a ground mark moved the same number of pixels (the Runner's accent dashes once moved at twice the course speed). `courseOffset` has a test (`kit/courseOffset.test.ts`); a new scrolling layer should use it.
- A screenshot of the game's states (playing, knock-out, countdown, winner) rendered through the real `draw`. The headless harness used for the first three games is: bundle a small script that imports your view and draws sample snapshots into canvases, then screenshot it with headless Chrome.
- **Randomness:** the game's seed and anything hidden come from the cryptographic source, never `Math.random` (see "Randomness and secrets" in `docs/minigames.md`). Say what in your game is hidden and show it is not in any snapshot it should not be in.
- Not tried with real players yet? Say so in the PR.
