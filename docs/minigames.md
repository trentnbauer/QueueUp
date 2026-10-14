# Mini games

Small live games to play with your room while a spin waits for everyone, or just for fun. Everyone in the mini game plays the **same game at the same time**, on the same screen, and can see each other.

Mini games are **cosmetic**: nothing in them changes which game a spin picks.

## Where to find them

| Where | What you get |
| --- | --- |
| **Spin** button in a room | Opens the mini game first. **Vote to spin** takes you on to the spin menu (there is a **← Mini game** button to come back). |
| **Room settings → Mini games** | Play any time, with no spin. |
| **Personal Shelf settings → Practice mini games** | Play alone, on your own device, and pick which game. Nothing is saved or sent. |

## How a lobby works

- **One game at a time.** When the lobby opens (the first person to join), it picks a game at random and keeps playing it until everyone has left. Closing the dialog leaves it; when the last person leaves, the lobby resets and its wins and history are gone.
- **Runs.** A run starts with a 3 second countdown. When it ends, the result shows for 4 seconds and the next run starts by itself.
- **Winning a run.** With two or more players, the **last one still in wins**. If everyone is out at the same moment, **nobody wins** ("Nobody made it"). Alone, a run is a **high-score run** with no winner: it ends when you are out, and your distance is your score.
- **Being out.** Anything that hits you knocks you out for the rest of that run. You keep watching, and play again in the next run.
- **Joining or leaving mid-run.** If you join while a run is on, you **watch** it and play from the next one. If you leave, you are out, and if only one player is left they win.
- **Everyone sees the same course.** The obstacles are the same for every player in a run, and every course can be cleared.
- **Distance** is shown in metres (one screen is 20 m).
- **Scoreboard.** The panel shows **wins this lobby** for everyone, the **last 10 runs** (the winner's colour and initial; a dash for a run nobody won), and the **best run** so far.
- **Playing together.** Any number of members can join. You can have the mini game open on up to 5 devices or tabs at once; you still count as one player.

## Voting to spin

While a spin is waiting for members, the mini game has a **Vote to spin** bar.

- The spin starts when **more than half of the people in the mini game** vote (3 people in the game need 2 votes; alone, your one vote is enough). People who are not in the mini game, or who are not on QueueUp at that moment, **do not count**, so they cannot hold it up.
- It also starts when **every member of the room is in the spin menu, ready**.
- The usual 30 second waiting room **stays open for as long as anyone is in the mini game**, so there is no rush.
- A room with **only one member** has no waiting room: pressing start in the spin menu spins straight away.
- If your connection to the mini game is down, the waiting room shows a plain **Start now** button instead of the mini game.

## Controls

Every game uses at most **one direction axis plus one button**, so it works on a phone. Keys work on a keyboard; the buttons below the arena work by touch (hold them down where it says hold).

| Game | Keyboard | Touch |
| --- | --- | --- |
| Runner | **Space**, **↑** or **W** to jump (hold for a longer jump). Hold **↓** or **S** to duck. | Hold **Jump** (or press and hold the arena). Hold **Duck**. |
| Flappy | **Space**, **↑** or **W** to flap. | **Flap**, or tap anywhere on the arena. |
| Dodge | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |

## Runner

The offline-dinosaur game, with everyone running the same track.

- **Goal:** survive. Obstacles scroll in from the right, faster and faster. Hit one and you are out.
- **Cactus** (a game cover standing on the ground): jump it. A **tap** is a short hop.
- **Log** (a wide, low stack of covers, which start to appear about 5 seconds into a run): too wide for a hop, so **hold** the jump button to go higher and stay in the air longer.
- **Bird** (a 😴 vote bubble flying at head height, which starts to appear about 8 seconds in): **duck** under it. Jumping into it knocks you out.
- **Jumping:** hold the button on the way up to jump higher and further; letting go early cuts the jump short. You can only jump from the ground, and holding the button after you land does not jump again: let go and press again. Pressing part-way up a hop does not make it higher.
- **Ducking** only works on the ground, and only while you hold it.
- **Speed** starts at half a screen per second and climbs to a screen per second after about 33 seconds, then stays there.
- Obstacles are always spaced so there is time to land and react.

## Flappy

Flap through the gaps, everyone on the same course.

- **Goal:** fly as far as you can. Pipes scroll in from the right, with a gap at a different height each time.
- **Flap** gives a short upward kick; gravity pulls you down between flaps. Tapping steadily keeps you level.
- Touching a **pipe, the floor or the ceiling** knocks you out.
- **Gaps** move up and down from pipe to pipe, but never by more than a bird can climb in the time between pipes.
- **Speed** starts at 0.4 of a screen per second and climbs to 0.7 after about 37 seconds.

## Dodge

Blocks fall; slide left and right to stay clear.

- **Goal:** don't get hit. Everyone stands on the same floor.
- You move at half a screen per second and can't leave the screen.
- **Blocks** (game covers of different widths) fall faster and faster: from 0.35 of a screen per second up to 0.9 after about 46 seconds. A new block appears every 0.75 seconds at the start, speeding up to every 0.28 seconds after about 47 seconds.
- A **safe lane** drifts slowly from side to side, and no block is ever made over it, so there is always a way through for someone who keeps up with it.
- A block that hits you knocks you out.

## Adding a game

Mini games are small, self-contained modules, and new ones are welcome as pull requests. See [`web/src/lobbyGames/README.md`](../web/src/lobbyGames/README.md) for how a game is built, the controls rule and the graphics standard, and file ideas with the **Mini game idea** issue template.
