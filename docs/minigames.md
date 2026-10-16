# Mini games

Small live games to play with your room while a spin waits for everyone, or just for fun. Everyone in the mini game plays the **same game at the same time**, on the same screen, and can see each other.

Mini games are **cosmetic**: nothing in them changes which game a spin picks.

## Where to find them

| Where | What you get |
| --- | --- |
| **Spin** button in a room | Opens the mini game first. **Vote to spin** takes you on to the spin menu (there is a **← Mini game** button to come back). |
| **Room settings → Mini games** | Play any time, with no spin. |
| **Mini games** (sidebar on desktop, profile menu on phones) | Play alone and pick which game, and see the high scores. |

## High scores

The **Mini games** page keeps a high score list for every game: your best run, your friends' and everyone's, for all time or the last 7 days. Every run counts, wherever it is played: solo, a room's mini game, or a spin's waiting room. People tied on a score share the place, and people you have blocked (or who blocked you) never show. A solo run's score is reported by your own device and only checked against the most the game could give, so the lists are for fun, not for prizes.

## Open lobbies

From the **Mini games** page anyone can **Open a lobby** without a room, and play it with whoever joins. Choose who can join:

- **Public**: anyone on the server sees it on the Mini games page (and a live dot in the sidebar) and can join.
- **Friends**: only your friends see and can join it.
- **Invite code**: hidden. People join with **Join with code** using the `XXX-XXX` code, or the link (`/games?code=...`). Codes are random and last only as long as the lobby.

It plays a random game after every run (like the waiting room), or one game you pick. It stays open until the last person has left, then it is gone, and the host can **Close my lobby** for everyone. Someone hosts one lobby at a time, a lobby holds up to 16 people, and anyone who has blocked or been blocked by the host cannot join. Every run in a lobby counts toward high scores.

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
- **Idle players.** While a spin is waiting, anyone in the mini game who does nothing for 60 seconds (no input, tap, action or vote, and no change in their reports) is removed from the lobby, so they stop holding the waiting room open and counting toward the votes needed. Holding a direction counts as playing. They can rejoin by opening the mini game again. Bots are not connections, so this never affects them.
- **Bots.** Some games need more than one player (Red light, green light needs 2). If fewer people are in the lobby, **bots** ("Bot 1", in a muted colour with a **B**) join to make up the numbers. They are not members: they never vote, never count as being in the mini game and never show up in the room. They are only added or removed between runs, never during one, and they leave once enough real people have joined. When the last person leaves, the bots go too. Practice mode on the Personal Shelf uses the same bots.
- **Playing together.** Any number of members can join. You can have the mini game open on up to 5 devices or tabs at once; you still count as one player.

## Ping and who works out what

In **Runner, Flappy, Dodge, Jump rope and Obstacle race**, your own player is worked out **on your own device**, so a slow connection does not make you jump late or get hit by something you cleared:

- **Your device** runs your player against the course the moment you press: your jump, your duck, your slide, your steering. Your hits are decided there too, and it tells the server where you are about 20 times a second, and straight away when you are out.
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
| Battleships | Click a square (no keyboard control yet). | Tap a square on the board. |
| Quick draw | Press **Space**, or click the big light. | Tap the big light. |
| Tilt | Hold **←** / **→** or **A** / **D**. | Hold the **◀** and **▶** buttons. |
| Stacker | **Space**, **↑** or **W** to stop the light. | **Stop**, or tap anywhere on the arena. |
| Words | Type in the box under the board, **Enter** to send. | Type with your phone's keyboard in the box, **Send** to send. |
| Memory pattern | Click a panel, or press **1-4** (top left, top right, bottom left, bottom right). | Tap a panel. |
| Asteroid defence | **←** / **→** or **A** / **D** to swing the gun (it fires by itself). | The **◀** and **▶** buttons. |
| Sumo ledge | **←** / **→** or **A** / **D** to walk, **Space**, **↑** or **W** to shove. | **◀ Shove ▶**: the arrows either side of the Shove button. |
| Whack-a-mole | Click a hole, or press **1-9** (laid out like a numpad: **7 8 9** on the top row, **1 2 3** on the bottom). | Tap a hole on the grid. |
| Jump rope | **Space**, **↑** or **W** to jump. | **Jump**, or tap anywhere on the arena. |
| Obstacle race | **←** / **→** or **A** / **D** to steer. | The **◀** and **▶** buttons. |

## Runner

The offline-dinosaur game, with everyone running the same track.

- **Goal:** survive. Obstacles scroll in from the right, faster and faster. Hit one and you are out.
- **Cactus** (a game cover standing on the ground): jump it. A **tap** is a short hop.
- **Two skinny cacti** (from about 3 seconds in, roughly one cactus in three): a pair of narrow covers standing right next to each other, with only a sliver of space between. Treat them as one obstacle: one jump clears both, so you do not need to land between them.
- **Log** (a wide, low stack of covers, which start to appear about 5 seconds into a run): too wide for a hop, so **hold** the jump button to go higher and stay in the air longer.
- **Bird** (a coloured game cover with a 😴 on it, floating at head height, which starts to appear about 8 seconds in): **duck** under it. Jumping into it knocks you out. About two birds in five are **wide** (a long run of covers, up to about a third of the screen), so keep **holding** duck until you are all the way past, not just until it reaches you.
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

## Obstacle race

A top-down race on a scrolling track, everyone on the same course.

- **Goal:** stay on the screen. Obstacles scroll down the track toward you; steer left and right to miss them. Everyone drives on the same track, side by side, and cars never bump into each other.
- **The middle line is full speed.** A driver at full speed sits on the dashed line across the middle of the screen, and nobody can get ahead of it, so the race is about staying on that line.
- **A hit slows you down**, and you slide back down the screen. You recover by yourself and climb back to the middle line (slowly: about a sixteenth of a screen a second). From the middle line one hit is never enough to put you off the bottom, but hits close together add up: a **cone** is a nudge, an **oil slick** (the dark puddle) is more, and a **rock** (a big cover) is the worst, about a quarter of a screen. Straight after a hit you cannot be hit again for half a second.
- **Slide off the bottom** (the red glow) and you are out. Last driver on the screen wins; alone, your distance is your score.
- **Starting spots** are spread across the middle of the track, the same spot for you every run.
- **Speed:** the track starts at 0.45 of a screen per second and climbs to 0.95 after about 42 seconds. A new obstacle appears every 0.9 seconds at the start, down to every 0.22 seconds after about 45 seconds, so hits come thicker and faster and every run ends.
- A **safe lane** drifts slowly from side to side, and no obstacle is ever made over it, so there is always a way through for someone who keeps up with it.
- You steer at 0.6 of a screen per second and can't leave the track (the striped kerbs).

## Red light, green light

A race to the finish line, with a traffic light in charge. Needs at least 2 players, so on your own you race a bot.

- **Goal:** be the first across the line. Everyone runs on the same open field, with no lanes and no separate windows.
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

## Quick draw

A reaction duel on one shared screen. Needs at least 2 players, so on your own a bot duels you.

- **How a round goes:** everyone waits with a finger ready. After a **random pause** (1.5 to 4 seconds, never shown to anyone) the big light flashes **GO!**. The **first tap after GO** wins the point.
- **False start:** tapping **before** GO puts you out of that round (you are dimmed, and can tap again in the next round).
- **If everyone jumps the gun**, the round is shown and run again.
- **Winning:** first to **3 points** wins the run. If nobody gets there, the run ends after **60 seconds** and the most points wins; a tie is a draw.
- **Fairness:** the order is decided by when taps reach the server, so a slow connection loses out. It is for fun, not a reaction-time test. The winning tap's time after GO is shown.
- **Bots** tap about a third to three quarters of a second after GO and never false-start, so a quick person beats them.
- **Controls:** the big light is the controller. Tap it, or press **Space**.

## Tilt

One ball on one beam, and everyone pushes it.

- **One shared beam and ball.** Hold left or right to push. The ball goes where the group pushes: the pushes are added up (a push to the right cancels one to the left) and softened by the number of players, so more people push harder, but never in proportion.
- **The beam wobbles by itself**, slowly at first and more and more as the run goes on, so keep correcting. The beam leans the way the ball is being pushed. The wobble comes from the round's seed, so it is the same for every run of that seed, and it always gets strong enough to end a run (at about a minute alone).
- **Targets** (green) appear on the beam, up to two at a time, and last 7 seconds. Tip the ball into one and **whoever pushed last** scores 1. The ball is drawn in their colour, so you can see who it would score for.
- **The run ends when the ball falls off either end** (or after 2 minutes). **Most targets scored wins**; a tie, or scoring nothing, is a draw. Alone it is a high score. Nobody is knocked out.
- Everyone's points are in the row under the beam, with an arrow for the way each is pushing.
- **Controls:** left and right only.
## Stacker

One tower and one light for the whole room. Stop the light on the target to climb.

- **One shared tower:** a grid 9 squares wide and 12 rows tall. A light bounces from one side of the current row to the other, the same for everyone. The target squares of the row are outlined in green.
- **Locking a row:** press (Space, Up, or tap) as the light passes over the target. The **first press that lands** locks the row for that player, scoring 1, and **everyone moves up** to the next row, shown in the colour of whoever locked it.
- **Missing:** a press that misses knocks that player out of the run (they keep watching). A press a moment after a row was just locked (about a third of a second) is ignored, so two people who press together are not penalised for being second. A press within a third of a square of the target's edge still counts, to forgive a slow connection.
- **Harder going up:** the target is **5 squares wide** on the first two rows, then 1 narrower every 2 rows, down to **2**. The light starts at 5 squares a second and is 0.9 faster each row, up to 12. Where the target is comes from the round's seed, and the next row's is not known until it is reached.
- **Ending:** the run ends when everyone is out, the tower is cleared, or after **2 minutes**. **Most rows locked wins**; a tie is a draw. Alone it is a high score (how many rows you climbed) and ends when you miss.
- Everyone's rows are listed on the right, and the bar along the top is the time left.
- **Controls:** one button: **Space**, **↑** or **W**, or tap anywhere on the arena.

## Words

Everyone guesses the same four-letter word, as in Wordle.

- **One secret word for everyone,** picked at random from a list of about 490 everyday four-letter words. It stays on the server until the run is over, when it is shown.
- **Five guesses.** Type a word in the **text box under the board** (on a phone it opens your own keyboard; on a computer the cursor is already in it) and press **Enter** (or **Send** on a phone). **Backspace** takes a letter back; only letters a to z are taken, and at most four. Any four letters are accepted as a guess (there is no dictionary check). Each letter of a guess is scored: **green** in the right place, **yellow** in the word but somewhere else, **grey** not in it (a letter the word has once is only marked once). The letters a to z along the bottom of the arena take the colour of the best each has scored for you.
- **Your own board is shown to you.** In the arena you see your guesses, letters and all. For everyone else you see only a small grid in their colour, scored the same way (green, yellow, grey) but **with no letters**, so you can see how close they are without being given anything.
- **Winning:** everyone who finds the word wins (it counts as a win on the scoreboard). The **best** is the one who found it in the fewest guesses, then the soonest: they are the run's winner. A dead heat for that has no single winner, and alone it is a high score with no winner.
- **Time:** the run ends after 90 seconds, or as soon as everyone has found the word or used their five guesses. Someone who has not found it by then does not win.
- **Score** (the high score list): 10 points for each guess you did not need to use (so a first-guess solve is 50) plus up to 9 more for solving early in the 90 seconds. Not finding the word scores nothing.
- **Controls:** typing. The text box sends the game one letter at a time (and Backspace, and Enter), so the server never sees anything but those. Touch the arena to bring the keyboard up on a phone. Someone who joins part way through watches and plays from the next run.

## Memory pattern

Watch the panels light up, then tap them back in the same order.

- **One shared board:** four coloured panels in a 2 by 2 grid, the same for everyone. The pattern is lit **one panel at a time** (about half a second each), the same for everyone.
- **Then everyone taps it back.** Tap a panel, or press **1** to **4** (top left, top right, bottom left, bottom right). A panel the pattern did not have next, **knocks you out**. Tapping before the pattern has finished being shown does nothing.
- **Time:** you get 3 seconds plus 1.2 seconds for each panel in the pattern. Anyone who has not tapped the whole pattern when it runs out is out.
- **The first pattern is 3 panels long.** Each round after it is one panel longer and starts with the same panels as the last. Everyone who got it right goes on after a short pause.
- **Last one in wins.** If everyone left is out in the same round, nobody wins. Alone it is a high score: the number of rounds you got through. If a run reaches 40 rounds it ends with no winner.
- **What others see of you:** only how many panels of the pattern you have got right so far (a tick when you have the lot), never which panels, and nothing lights up when someone else taps. The pattern lives on the server and only the panel being shown right now is ever sent, so nobody can read ahead.
- **Controls:** the panels are the controller, so tap or click them, or press **1-4**.

## Asteroid defence

A shooting gallery under a sky of falling asteroids, with everyone's turret in the same sky.

- **One shared sky.** Every player has a **turret at a random spot along the bottom**. The spots come from the round's seed and stay put for the whole run, so everyone sees the same layout, and nobody's turret is on top of another's.
- **Swing your gun** left and right (it can swing up to about 70 degrees either way from straight up). **It fires by itself,** twice a second, along wherever it points. Shots pass through turrets, so nobody can shoot each other.
- **Asteroids** (game covers) fall from the top and drift sideways, bouncing off the sides. **Small** ones break in 1 hit; **big** ones (with a ring round them) take 2. The shot that **breaks** one scores 1 for whoever fired it.
- **Harder as it goes:** they fall faster (from 0.1 to 0.45 of a screen a second), appear more often (every 1.3 seconds down to every 0.35) and are big more often (1 in 20 at first, up to 1 in 2).
- **Out:** an asteroid that touches your turret breaks on it and knocks you out; your turret stays as a dim wreck, and asteroids that reach it break on it too. **Last turret standing wins.** If everyone is hit at the same moment, nobody wins. Alone it is a high score: your count when you are hit. After 3 minutes a run still going ends, and the most asteroids broken wins.
- Each turret has its **points** under it, and the scoreboard shows who has the most.
- **Controls:** left and right only (**←** / **→** or **A** / **D**, or the **◀** and **▶** buttons).

## Sumo ledge

Everyone on one short platform over a drop. Shove the others off. Needs at least 2 players, so on your own a bot joins and plays against you.

- **One shared platform,** drawn side-on, with everyone standing on it. It starts about 0.8 of the screen wide and **shrinks from both ends**, about 0.012 of the screen a second from each end, down to a quarter of the screen, so a run always ends. A faint outline shows where it started.
- **Walk** left and right. You face the way you last walked.
- **Shove** (Space, ↑, **W**, or the Shove button): anyone **just in front of you** (up to about a tenth of the screen, and not behind you) is knocked away from you and slides a good way; you also lunge a little. After a shove you wait **0.7 seconds**, shown as a bar under your feet. A shove that hits nobody still costs the wait.
- **Out:** if your middle goes past either end of the platform you fall and are out. **Last one on wins.** If everyone falls together it is a draw, and a run still going after 2 minutes ends with no winner.
- Nobody pushes anyone except by shoving: you walk through each other.
- **Score** is the seconds you stayed on, which is also what the high score list records. Alone against the bot that is how long you last.
- **The bot** walks toward the nearest player, backs away from the edge, and shoves late (a quarter to half a second after it is in range). It is beatable.
- **Controls:** **←** / **→** or **A** / **D** to walk, **Space**, **↑** or **W** to shove. On a phone, the buttons are laid out **◀ Shove ▶**, with the Shove button in the middle.

## Whack-a-mole

Moles pop up out of a grid of holes; tap them before anyone else does.

- **Goal:** the most points in 30 seconds. Everyone plays on **the same 3 by 3 grid** and goes for the same moles.
- **Nobody is knocked out.** When the time is up, the most points wins; a tie for the most, or scoring nothing, is a draw. Alone, it is a high-score round: no winner, just your points.
- **Moles** are worth 1 point. The **first tap to reach the server** gets the point and the mole drops (a ring in your colour shows who got it); a later tap on a mole that is already whacked is ignored and costs nothing.
- **Bombs** (dark, with a fuse) pop up now and then, never two in a row (about one in six). Whacking one costs **2 points** (never below zero).
- **Missing:** tapping an empty hole costs **1 point** (never below zero), so mashing every hole does not win.
- **Speed:** a new mole appears every 0.8 seconds at the start, down to every 0.28 seconds, and each stays up for 1.4 seconds at the start, down to 0.6 seconds. Which hole, and which are bombs, is decided on the server and comes from the round's seed, so it is the same sequence for everyone.
- The bar along the top is the time left, and everyone's points are in the row above the grid.
- **Controls:** the grid is the controller, so tap or click a hole. On a keyboard, the number keys **1-9** match the holes like a numpad.

## Battleships

One board for everyone, with everyone's ships hidden on it. Last fleet afloat wins.

- **One shared board:** an 8 by 8 grid. At the start of a round every player's ships are hidden on it, **all on the same grid**, never overlapping (and, when there is room, never touching). **You can see your own ships** (the blue squares) **and nobody else's**: the server sends each player their own view, so nobody is sent where anyone else's ships are.
- **Firing:** **tap a square** to fire at it. Anyone's ship on that square is hit; otherwise it is a miss. Everyone sees every shot as it lands: a miss is a dot, a hit is a cross, in the colour of whoever fired it. You cannot fire at your own ships. A hit on one of yours shows as a cross in the colour of who hit it.
- **Whose ship?** A hit does not say whose ship it was. When a ship is **sunk**, its squares go dark with a ring in its owner's colour.
- **Scoring:** a **hit** scores 1, and the shot that **sinks** a ship scores 1 more. Points are for the scoreboard; what wins is surviving.
- **Out:** when every ship of yours is sunk you are out for the round, and you keep watching (your ships are still shown to you). The **last fleet afloat wins**. If more than one is still afloat after 2 minutes, the one with the **most squares afloat** wins; a tie is a draw. The list on the right is everyone in the round with how many squares of their ships are afloat, and you are ringed.
- **Free space:** about 30% of the board is ship **in all, shared out between the players**, so **the more players, the fewer ships each**: two players get 10 squares of ships each, four get 5, twelve get 2. Ships are **1, 2, 3 or 4 squares long, picked at random** until each player's squares add up (so 5 squares can be one 4 and a 1, or 2, 2 and 1), a different fleet for everyone every round. A 1-square ship is sunk by a single hit, which scores the hit and the sinking bonus together.
- **A short wait after each shot** (under a second, shown as a bar under the board) so quick tapping does not decide it. A tap at a square already shot does nothing and costs nothing, and if two people shoot the same square the first shot to reach the server counts. Under the board is your own fleet by ship length, with sunk ships dimmed.
- **It needs two players:** on your own, a bot joins (see Bots above) and plays against you: it hides ships on the same board, shoots at squares (going after the ones beside its hits, and never at its own ships), and you shoot at its.
- **Controls:** the board is the controller, so tap or click. There is no keyboard control for this game yet.

## Randomness and secrets

Anything a game decides at random and players are not meant to know is a secret, and a secret must not be guessable.

- **Seeds come from a cryptographic source, never `Math.random`.** Every game builds its course from a seed. `Math.random` in Node can be worked out from a few of its outputs, and the seeds of the client-run games (Runner, Flappy, Dodge, Jump rope) are sent to every player. Someone collecting those could predict a later round: where Battleships ships are, when Red light, green light turns red, which coins fall next. The same goes for the pick of the next game and the bots' choices.
- **A seed that is sent to players is public.** Never use it, or anything worked out from it, for something hidden. A game with hidden state keeps its own seed on the server and never puts it in a snapshot.
- **Hidden things stay on the server.** Ship positions, light timings and upcoming items are never in a snapshot (except to their owner, for ships), and must not be derivable from one.
- **Tests inject the random source** (`seedSource`), so they stay repeatable. Do not make the default `Math.random` to save a line.

(Tracked in [#1278](https://github.com/trentnbauer/QueueUp/issues/1278): the games still use `Math.random` today.)

## Keeping the motion consistent

Scrolling games (Runner, Flappy, Dodge, Catch the coins, Obstacle race) all follow one rule so the world never slides at two speeds:

- **Everything on the course moves at the course's speed.** Obstacles, pickups and the marks on the ground (the Runner's pale ticks and accent dashes, for example) all move by the same distance every second: the speed shown in the game's own description above, in screens per second. A ground mark must never look faster or slower than the obstacles it sits under.
- **Only the faint dot grid in the background is slower**, at a quarter of the course speed, as distant parallax. It is drawn by the arena for every game; a game never adds its own.
- **A game where nothing scrolls** (Jump rope, Red light, green light) reports a speed of 0, so the background stays still.
- **How it is kept true in code:** repeating patterns on the course use the shared `courseOffset` helper, which wraps the distance the course has travelled by the pattern's own spacing. Never scale an offset that has already been worked out (`offset * 2`): that changes the pattern's speed. The helper has a test, and `web/src/lobbyGames/README.md` lists the check a new scrolling game needs before a pull request.

(The Runner's accent dashes used to move at twice the course speed because of exactly that mistake.)

## Adding a game

Mini games are small, self-contained modules, and new ones are welcome as pull requests. See [`web/src/lobbyGames/README.md`](../web/src/lobbyGames/README.md) for how a game is built, the controls rule and the graphics standard, and file ideas with the **Mini game idea** issue template.
