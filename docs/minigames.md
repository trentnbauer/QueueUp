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

- **A random game, and a new one after every run.** When the lobby opens (the first person to join), it picks a game at random. Each time a run ends and its result has been shown, the lobby moves everyone to a **different** random game, so the waiting room keeps changing while a spin waits. Closing the dialog leaves it; when the last person leaves, the lobby resets and its wins and history are gone.
- **Practice keeps the game you pick.** In practice mode you choose the game, and it stays that game, with a new run each time one ends. Changing the game does not reset the scoreboard.
- **Runs.** A run starts with a 3 second countdown. When it ends, the result shows for 4 seconds and the next run starts by itself (in a room, in a new random game).
- **Winning a run.** With two or more players, the **last one still in wins**. If everyone is out at the same moment, **nobody wins** ("Nobody made it"). Alone, a run is a **high-score run** with no winner: it ends when you are out, and your distance is your score.
- **Being out.** Anything that hits you knocks you out for the rest of that run. You keep watching, and play again in the next run.
- **Joining or leaving mid-run.** If you join while a run is on, you **watch** it and play from the next one. If you leave, you are out, and if only one player is left they win.
- **Everyone sees the same course.** The obstacles are the same for every player in a run, and every course can be cleared.
- **Distance** is shown in metres (one screen is 20 m).
- **Scoreboard.** The panel shows **wins this lobby** for everyone, the **last 10 runs** (the winner's colour and initial; a dash for a run nobody won), and the **best run** so far in the game being played. The run number, the last 10 runs and the wins belong to the lobby, not to a game, so they **carry over when the game changes** (in a room after every run, and in practice when you pick another game). The best run is kept per game, because metres, coins and swings cannot be compared with each other.
- **Bots.** Some games need more than one player (Red light, green light needs 2). If fewer people are in the lobby, **bots** ("Bot 1", in a muted colour with a **B**) join to make up the numbers. They are not members: they never vote, never count as being in the mini game and never show up in the room. They are only added or removed between runs, never during one, and they leave once enough real people have joined. When the last person leaves, the bots go too. Practice mode on the Personal Shelf uses the same bots.
- **Playing together.** Any number of members can join. You can have the mini game open on up to 5 devices or tabs at once; you still count as one player.

## Ping and who works out what

In **Runner, Flappy, Dodge and Jump rope**, your own player is worked out **on your own device**, so a slow connection does not make you jump late or get hit by something you cleared:

- **Your device** runs your player against the course the moment you press: your jump, your duck, your slide. Your hits are decided there too, and it tells the server where you are about 20 times a second, and straight away when you are out.
- **The server** decides the shared things: the course's seed and exactly when a run starts (everyone's device lines its clock up with the server's, so everyone starts the same course at the same moment), who is still in, who won, the wins and the history. It shows everyone else's player from what their devices report.
- **What you still see late:** other players. They are drawn where their device last said they were, so on a slow connection you see them a moment behind. It does not change what happens to you.
- **If your device goes quiet** (a closed or frozen tab) for 3 seconds in a run, the server counts you out.
- Players in these games never affect each other, which is why this is safe. Games where players race for the same thing (**Catch the coins**, **Red light, green light**) are still worked out by the server, so there ping matters; they will move over as their rules allow.

## Voting to spin

While a spin is waiting for members, the mini game has a **Vote to spin** bar.

- The spin starts when **more than half of the people in the mini game** vote (3 people in the game need 2 votes; alone, your one vote is enough). People who are not in the mini game, or who are not on QueueUp at that moment, **do not count**, so they cannot hold it up.
- It also starts when **every member of the room is in the spin menu, ready**.
- The usual 30 second waiting room **stays open for as long as anyone is in the mini game**, so there is no rush.
- A room with **only one member** has no waiting room: pressing start in the spin menu spins straight away.
- If your connection to the mini game is down, the waiting room shows a plain **Start now** button instead of the mini game.

## Controls

Every game uses at most **one direction axis plus one button**, so it works on a phone. Keys work on a keyboard; the buttons below the arena work by touch (hold them down where it says hold).

A game can instead make **the play space the controller**: there are no buttons under the arena, and you tap the thing you mean (a hole, a square on a board, a coloured panel) right on the screen. The tapped spot lights up for a moment. On a keyboard, each tappable spot has a key (for a 3x3 grid, the number keys 1-9 laid out like a numpad). A game uses one or the other, never both.

| Game | Keyboard | Touch |
| --- | --- | --- |
| Runner | **Space**, **↑** or **W** to jump (hold for a longer jump). Hold **↓** or **S** to duck. | Hold **Jump** (or press and hold the arena). Hold **Duck**. |
| Flappy | **Space**, **↑** or **W** to flap. | **Flap**, or tap anywhere on the arena. |
| Dodge | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Red light, green light | Hold **Space**, **→** or **D** to run. | Hold **Run** (or press and hold the arena). |
| Catch the coins | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Battleships | Click a square on the board (no keyboard control yet). | Tap a square on the board. |
| Jump rope | **Space**, **↑** or **W** to jump. | **Jump**, or tap anywhere on the arena. |

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

## Jump rope

A rope swings round and everyone jumps it together.

- **Goal:** jump each time the rope comes down to the floor. Everyone stands in a row on the same floor.
- **Mistime it** (be on the floor as the rope passes under you) and you are out. Last one jumping wins.
- **Jumping** only works from the floor, and a jump is the same height every time, so it is all about timing. Pressing again while you are still in the air does nothing.
- **Score:** the number of swings you jumped (shown as SWINGS in the top-left counter, where the other games show metres).
- **Speed:** a swing starts at 1.8 seconds and shortens by 0.03 seconds for every second of the run, down to 0.75 seconds after about 35 seconds. Now and then a swing is slower (a pause, 1.5 times as long) or quicker (0.85 times as long, never under 0.65 seconds), so don't jump on rhythm alone.
- Every swing is long enough to land and jump again.
- **Depth:** the rope comes up on the far side of the jumpers and down on the near side. While it is behind them it is drawn darker, with no glow, and behind the jumpers; once it is over their heads it is bright, with a glow, and passes in front of them.

## Red light, green light

A race to the finish line, with a traffic light in charge. Needs at least 2 players, so on your own you race a bot.

- **Goal:** be the first across the line. Everyone has their own lane on the same track.
- **Hold the run button** to run while the light is green. Let go to stand still.
- **The light** turns amber and flashes for about half a second before it goes red. Moving once it is red (after a quarter of a second to let a slow connection catch up) knocks you out. Green and red spells are random but the same for everyone.
- **Winning:** the first runner to cross the line wins. This game ends the moment someone finishes, so unlike the others it is not only last one in. If nobody has finished after 45 seconds, whoever is furthest along wins; a tie for the lead is a draw.
- **Distance** shown is how far the leader has run, out of 20 m.
- It takes about 10 seconds of holding the button to cross the track, so a run is roughly 20 seconds.

## Catch the coins

Coins fall; slide left and right to catch them before anyone else does.

- **Goal:** catch the most coins in 30 seconds. Everyone is on the same floor and goes for the same coins.
- **Nobody is knocked out.** When the time is up, the most coins wins; a tie for the most, or catching nothing, is a draw. Alone, it is a high-score round: no winner, just your coins.
- **Coins** (gold) are worth one each. If two catchers reach the same coin, the nearer one gets it.
- **Bombs** (dark, with a fuse) fall now and then, never two in a row. Catching one costs you a coin (never below zero) and **stuns** you for one second, so you cannot move. A stunned catcher cannot be hit by another bomb.
- **Speed:** things start at 0.4 of a screen per second and climb to 0.7 after 30 seconds. A new item appears every 0.55 seconds at the start, down to every 0.3 seconds.
- The bar along the top is the time left, and each catcher's coin count is shown over their head.
- You move at 0.6 of a screen per second and can't leave the screen.

## Battleships

One board for everyone: a hidden fleet, and everyone shooting at the same squares.

- **Goal:** find and sink the fleet. A **hit** scores 1, the shot that **sinks** a ship scores 1 more. When the whole fleet is sunk, or after 90 seconds, **most points wins**; a tie for the most, or nobody scoring, is a draw.
- **The board is the controller:** it is an 8 by 8 grid, and you tap or click a square to fire. There are no buttons under it. (There is no keyboard control for this game yet.)
- **A fleet to fit the room:** it is made when the round starts, from how many are playing. **Fewer players get a fuller board** (about 30% of the squares are ship for one or two players) and **more players get more open water** (about 10% for twelve). The ships are **1, 2, 3 or 4 squares long, picked at random** until the squares add up, so the same amount of ship can be one 4 and a 1, or 2, 2 and 1, and every round has a different fleet. Ships are straight, never overlap and never touch.
- **Everyone sees every shot** as it lands: a miss is a dot, a hit is a cross, in the colour of whoever fired it, and a sunk ship is shown dark. Squares nobody has shot never show what is under them. The row along the top is the fleet by ship length, with sunk ships dimmed. A 1-square ship is sunk by a single hit, which scores the hit and the sinking bonus together.
- **A short wait after each shot** (under a second, shown as a bar under the board) so quick tapping does not decide it. If two people shoot the same square, the first shot to reach the server counts; a tap at a square already shot does nothing and costs nothing.
- **It needs two players:** on your own, a bot joins (see Bots above) and plays with you.
- Everyone's points are along the bottom, and the **POINTS** counter at the top left is the highest.

## Keeping the motion consistent

Scrolling games (Runner, Flappy, Dodge, Catch the coins) all follow one rule so the world never slides at two speeds:

- **Everything on the course moves at the course's speed.** Obstacles, pickups and the marks on the ground (the Runner's pale ticks and accent dashes, for example) all move by the same distance every second: the speed shown in the game's own description above, in screens per second. A ground mark must never look faster or slower than the obstacles it sits under.
- **Only the faint dot grid in the background is slower**, at a quarter of the course speed, as distant parallax. It is drawn by the arena for every game; a game never adds its own.
- **A game where nothing scrolls** (Jump rope, Red light, green light) reports a speed of 0, so the background stays still.
- **How it is kept true in code:** repeating patterns on the course use the shared `courseOffset` helper, which wraps the distance the course has travelled by the pattern's own spacing. Never scale an offset that has already been worked out (`offset * 2`): that changes the pattern's speed. The helper has a test, and `web/src/lobbyGames/README.md` lists the check a new scrolling game needs before a pull request.

(The Runner's accent dashes used to move at twice the course speed because of exactly that mistake.)

## Adding a game

Mini games are small, self-contained modules, and new ones are welcome as pull requests. See [`web/src/lobbyGames/README.md`](../web/src/lobbyGames/README.md) for how a game is built, the controls rule and the graphics standard, and file ideas with the **Mini game idea** issue template.
