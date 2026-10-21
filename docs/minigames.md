# Mini games

Small live games to play with your room while a spin waits for everyone, or just for fun. Everyone in the mini game plays the **same game at the same time**, on the same screen, and can see each other.

Mini games are **cosmetic**: nothing in them changes which game a spin picks.

## Where to find them

| Where | What you get |
| --- | --- |
| **Spin** button in a room | Opens the mini game first. **Vote to spin** takes you on to the spin menu (there is a **← Mini game** button to come back). |
| **Room settings → Mini games** | Play any time, with no spin. |
| **Mini games** (sidebar on desktop, profile menu on phones) | Play alone and pick which game, and see the high scores. |

## The Mini games page

On a computer the page is a **list of every game on the left** (A to Z in your language, fixed height so it stays the same size however many games there are, with a search box that filters on name and tagline) and the **picked game on the right**: its name and tagline, **Play**, your four numbers (personal best, rank among your friends, runs played, the gap to your next friend) and its high scores. The list shows your best in each game, and a **🥇 🥈 🥉** before it for the games where you are top three among your friends (a plain number below that; nothing before your first run in a game). A game you lead has a gold wash. In the search box, **↑** and **↓** move the pick through what is shown, and **Enter** picks the first match when the picked game is not among them.

On a phone it is a strip of game cards under a search box, also A to Z, with the medal before your best, then the scores and your numbers, and a Play button pinned to the bottom.

## High scores

The **Mini games** page keeps a high score list for every game: your best run, your friends' and everyone's, for all time or the last 7 days. Every run counts, wherever it is played: solo, a room's mini game, or a spin's waiting room. People tied on a score share the place, and people you have blocked (or who blocked you) never show. **Solo practice runs on the server too**, in a private lobby of one that nobody else can see or join, so every score on the lists is one the server saw happen: there is no way to post a score from a browser. (The games that work out your own movement on your device are worked out by the server in practice, and their lobby scores stay off the lists; see "Ping and who works out what".)

**Beaten alerts.** When a friend's new run beats **your** best in a game, you get a notification: *"{friend} beat your {game} high score: 80 to your 50"*. Opening it takes you to the Mini games page with that game picked, ready to take your score back. Only runs that reach the high score lists count (so only verified ones), only friends are told, and never someone who has blocked or been blocked by the player. The run that first gets past your best is the one you are told about (a friend who is already ahead and keeps improving does not tell you again), people who played the same run are not told, and an unread alert for the same game is refreshed rather than stacked. It is on by default; **Settings › Notifications** can turn it off in the app or send it by email ("A friend beats your mini game high score").

## Open lobbies

From the **Mini games** page anyone can **Open a lobby** without a room, and play it with whoever joins. Choose who can join:

- **Public**: anyone on the server sees it on the Mini games page (and a live dot in the sidebar) and can join.
- **Friends**: only your friends see and can join it.
- **Invite code**: hidden. People join with **Join with code** using the `XXX-XXX` code, or the link (`/games?code=...`). Codes are random and last only as long as the lobby.

It plays a random game after every run (like the waiting room), or one game you pick. It stays open until the last person has left, then it is gone, and the host can **Close my lobby** for everyone. Someone hosts one lobby at a time, a lobby holds up to 16 people, and anyone who has blocked or been blocked by the host cannot join. Every run in a lobby counts toward high scores.

## Playing as a guest

The sign-in page has a **Play mini-games** button (under the sign-in buttons, with a live count of public lobbies). Without an account anyone can join a **public** lobby from the list, or an **invite-code** lobby with its code, after picking a display name (2 to 24 characters, checked against the banned words and blocked names). Friends-only lobbies are never listed or joinable.

Nothing about a guest is stored on the server: no user row, session, score, high score, rating or notification. A guest is an in-memory id in the lobby's live state, joined with a short-lived signed token for that one lobby, and they disappear when they leave or the lobby closes. The display name is kept only in the browser (`localStorage['sq-guest-name']`). A guest's runs are never saved, so they cannot appear on the high score lists or trigger beaten alerts. Guests show in the lobby marked **GUEST**.

Guest play is off when `SIGNUP_MODE=invite` or `PRIVATE_INSTANCE=true`. The two unauthenticated endpoints (`GET /api/minigames/public-lobbies`, `POST /api/minigames/lobbies/:ref/guest-join`) are rate limited, and the join needs the sign-in page's Turnstile token when the captcha is on.

## How a lobby works

- **A random game, and a new one after every run.** When the lobby opens (the first person to join), it picks a game at random. Each time a run ends and its result has been shown, the lobby moves everyone to a **different** random game, so the waiting room keeps changing while a spin waits. Closing the dialog leaves it; when the last person leaves, the lobby resets and its wins and history are gone.
- **Games played less come up more.** The pick is not an even coin toss: each game is weighted by how little it has been played, so a new or rarely seen game comes up more often, but every game still has a chance and the most played is never shut out. A game's weight is `1 / (1 + plays / (average plays + 1))`. Plays are counted across the whole server over the last 30 days, as distinct runs saved to the high score table (so a run with many people counts once, and waiting room runs count), read again every 5 minutes. Within one lobby a game it has already played is also less likely again. The game just played never comes straight back, and **solo practice** on the Mini games page, which is your own choice of game, does not use the weighted pick. A game with a minimum player count (Quick draw, Sumo ledge) is picked the same way and a lone player gets a bot.
- **Practice keeps the game you pick.** In practice mode you choose the game, and it stays that game, with a new run each time one ends. It is a private lobby on the server (never listed, nobody can join it); picking another game opens a new one in its place, and closing the dialog closes it.
- **Runs.** A run starts with a 3 second countdown. When it ends, the result shows for 4 seconds and the next run starts by itself (in a room, in a new random game).
- **Winning a run.** With two or more players, the **last one still in wins**. If everyone is out at the same moment, **nobody wins** ("Nobody made it"). Alone, a run is a **high-score run** with no winner: it ends when you are out, and your distance is your score.
- **The result card** is the run's standings: the headline says what happened, the winner is the top row (alone, you are, with your best so far), the next places follow up to third, and your own row is always shown and outlined, whatever place you came. Under the standings is **Review this mini-game** with the thumbs. The headline says what happened: the winner's name; **"New best!"** for a solo run that is your best in that game (not for Quick draw, where less is better); **"Run over"** for any other solo run; **"Time's up"** when a time cap ended the run with people still in; **"It's a draw"** for a tie in a game of points; and **"Nobody made it"** only when several players all went out together. A solo run is never "Nobody made it". The word games (Words and Anagram) show the word the run ended on straight under the headline.
- **Being out.** Anything that hits you knocks you out for the rest of that run. You keep watching, and play again in the next run.
- **Joining or leaving mid-run.** If you join while a run is on, you **watch** it and play from the next one. If you leave, you are out, and if only one player is left they win.
- **Everyone sees the same course.** The obstacles are the same for every player in a run, and every course can be cleared.
- **Distance** is shown in metres (one screen is 20 m).
- **Scoreboard.** The panel shows **wins this lobby** for everyone, the **last 10 runs** (the winner's colour and initial; a dash for a run nobody won), and the **best run** so far in the game being played. The run number, the last 10 runs and the wins belong to the lobby, not to a game, so they **carry over when the game changes** (in a room after every run, and in practice when you pick another game). The best run is kept per game, because metres, coins and swings cannot be compared with each other.
- **Time limit, in any lobby.** A lobby that is not a practice run has a **Time limit** switch under its header: **Infinite** (runs go on until they are beaten, getting harder; the default) or **30 seconds** (every run capped, like a spin's waiting room: whoever is still in keeps their score). It is one setting for everyone in the lobby, and anyone in it can change it, in a room's Mini games, an open lobby (which also asks when you open it) or anywhere else. While a spin is waiting the cap is always on and the switch is locked; when the spin ends the lobby goes back to what its members chose. A **practice run** (Play solo) has no time limit at all.
- **Time limits.** With no time limit, games go on until they are beaten and get harder as they go. Four are a fixed length by design (Catch the coins, Whack-a-mole and Match are 30 seconds, Words 90). Words keeps its 90 seconds always, as part of the game. With **no** time limit, Catch the coins, Whack-a-mole and Match are **endless**: each player has **three lives**, the game keeps getting quicker, and the last one standing wins (alone, it ends when you are out, and the score is what you had). In a **spin's waiting room every run is capped at 30 seconds**, whatever the game, so the waiting room keeps moving: when the cap is reached the run ends, anyone still in keeps the score they have got (a game that scores points, such as Tilt or Words, ends by its own count: most points wins), and nobody wins a game that is only survival. The time bar along the top of a game only appears when it has a limit.
- **Built so 30 seconds is hard.** Solo practice and open lobbies without the time limit go on until you are out, but every survival game starts briskly (no slow warm-up) and reaches its top difficulty within about 15 to 30 seconds, so getting to the 30 second cap of a waiting room is an achievement, not a stroll.
- **Idle players.** While a spin is waiting, anyone in the mini game who does nothing for 60 seconds (no input, tap, action or vote, and no change in their reports) is removed from the lobby, so they stop holding the waiting room open and counting toward the votes needed. Holding a direction counts as playing. They can rejoin by opening the mini game again. Bots are not connections, so this never affects them.
- **Bots.** Some games need more than one player (Sumo ledge and Quick draw need 2). If fewer people are in the lobby, **bots** ("Bot 1", in a muted colour with a **B**) join to make up the numbers. They are not members: they never vote, never count as being in the mini game and never show up in the room. They are only added or removed between runs, never during one, and they leave once enough real people have joined. When the last person leaves, the bots go too. Practice mode on the Personal Shelf uses the same bots.
- **Playing together.** Any number of members can join. You can have the mini game open on up to 5 devices or tabs at once; you still count as one player.

## Ping and who works out what

In **Runner, Flappy, Dodge, Jump rope, Obstacle race, Gravity flip, Laser gaps, Road hop, Fishing, Orbit, Rhythm lanes, Sort it, Steady tempo, Lava, Tunnel and Parachute**, your own player is worked out **on your own device**, so a slow connection does not make you jump late or get hit by something you cleared:

- **Your device** runs your player against the course the moment you press: your jump, your duck, your slide, your steering. Your hits are decided there too, and it tells the server where you are about 20 times a second, and straight away when you are out.
- **The server** decides the shared things: the course's seed and exactly when a run starts (everyone's device lines its clock up with the server's, so everyone starts the same course at the same moment), who is still in, who won, the wins and the history. It shows everyone else's player from what their devices report.
- **What you still see late:** other players. They are drawn where their device last said they were, so on a slow connection you see them a moment behind. It does not change what happens to you.
- **Practice runs** (Play solo on the Mini games page) are worked out by the server, so their scores are its own and cannot be forged, and your device runs the same run to draw it, so it feels instant. To keep the two the same, each press goes to the server with the moment of the run it was made at, and the server runs 0.3 seconds behind your device, so the press has arrived before the server needs it and is applied at exactly that moment. What you see happen is what is scored: a slow connection no longer lets the server's version of you fall somewhere your screen never showed. The result card comes up a moment after your own player is out, for the same reason. A press that takes more than 0.3 seconds to arrive is applied late.
- **If your device goes quiet** (a closed or frozen tab) for 3 seconds in a run, the server counts you out.
- **High scores only come from runs the server saw.** Because your device decides your hits in these games, a modified client could say it never got hit. So a score from one of these games played **in a lobby or a spin's waiting room is kept but not put on the high score lists** (it is saved as unverified, `verified = false`); it still counts for the wins and run history in that lobby. **Solo practice** is different: there the server works out your player itself from your presses, as for any other game (your device draws its own copy of the run so it feels instant, but any report it sends is ignored and your presses go to the server too), so a practice score is the server's own and does go on the lists. Your device still runs its own copy of the run to draw, so the game looks and feels instant (the same as in a lobby), but your presses also go to the server, which decides whether you were hit; if the two ever disagree, the server wins. The trade is that on a slow connection the server can see a press a moment later than you made it. Every other game is worked out by the server everywhere, so its lobby scores are listed as usual.
- Players in these games never affect each other, which is why this is safe. **Catch the coins**, where players race for the same thing, is still worked out by the server, so there ping matters.

## Snake arena

One shared grid and a snake for each player. Needs at least 2 players, so on your own a bot plays you.

- **Goal:** be the last snake alive. Your snake always moves on, one cell at a time, and leaves its body behind it. **Hit a wall, any snake (yours included), or run head-on into another head, and you are out.** Last one going wins; if the last ones go out in the same step, it is a draw.
- **Pickups** (one for each snake going) appear on empty cells. Eating one makes your snake one cell longer.
- **Speed:** a step takes 0.13 seconds at the start and gets shorter as the longest snake grows (0.006 less for each cell beyond the start), down to 0.075 seconds.
- **Starting spots:** snakes start 3 cells long, spread round a ring and facing the middle, in the order players joined.
- **Score** (the high score list): how long your snake got. There is no time limit of its own: it goes on until it is beaten.
- **Bots** steer away from walls and bodies and toward the nearest pickup. They only look one cell ahead and now and then turn the wrong way, so they can be beaten.
- **Controls:** turn left or right (each press is one turn at the next step).

## Gravity flip

Run along the floor or the ceiling and flip between them. Everyone runs the same course, side by side, and never touches.

- **Goal:** don't hit anything. Obstacles scroll in from the right: spikes standing on the floor, spikes hanging from the ceiling, and **blocks floating in the middle**. Be on the other side from a spike as it arrives, and **stay on a side (do not be flying across) as a middle block passes**: it kills anyone in the middle of the corridor. **Last one running wins**; alone it is a high score (metres).
- **Flipping:** one button. A flip takes 0.7 seconds to cross (slow enough that, once you are in the middle, tapping about every fifth of a second keeps you floating there), and you can press again **part way across to turn round** and go back. There is a short wait (0.18 seconds) before the next flip, so mashing the button cannot hold you in the middle, out of reach of the spikes. A spike is only dangerous near the side it is on, so you are safe from spikes while flying, but a middle block is exactly where you fly.
- **Obstacles** start 0.06 to 0.14 wide: spikes 0.14 tall, middle blocks 0.26 tall, and they **get bigger the further a run has come**, up to 1.7 times as wide and as tall by 60 screens in (about 50 seconds), so the middle blocks end up 0.44 tall. 40% are floor spikes, 40% ceiling spikes and 20% middle blocks, at random. They are at least 0.85 seconds of running apart, edge to edge (and up to 0.7 seconds more), which is always long enough to flip in and settle. They come from the round's seed, so they are the same for everyone.
- **Speed:** the course starts at 0.6 of a screen per second and climbs by 0.02 every second, with no top speed.
- There is no time limit of its own: it goes on until it is beaten.
- **Controls:** one button: **Space**, **↑**/**↓** or **W**/**S**, or tap anywhere on the arena.

## Laser gaps

Rows of lasers fall; slide into the gap. Everyone is on the same floor and never touches.

- **Goal:** don't touch a beam. A row of lasers spans the whole screen except for a gap. Be entirely inside the gap as the row reaches you. **Last one standing wins**; alone it is a high score (metres).
- You move at half a screen per second and can't leave the screen.
- **Rows** fall faster and faster: from 0.5 of a screen per second, 0.016 more every second, with no top speed. A new row appears every 0.9 seconds at the start, down to every 0.55 seconds after about 23 seconds.
- **The gap** starts 0.3 wide and narrows to 0.17 (after about 65 seconds). Each row's gap is never further from the last one's than 0.7 of what you can slide in the time between them, so there is always a way through for someone who keeps up. Rows come from the round's seed, so they are the same for everyone.
- There is no time limit of its own: it goes on until it is beaten.
- **Controls:** left and right only.

## Match

A colour name is written in the ink of another colour, and the prompt says what to match: the **ink** or the **word**. It changes from one prompt to the next, so read what it asks before you tap.

- **Goal:** points. With a time limit it is a 30 second round and the most points wins. With none it is **endless**: three lives each, shown as hearts; a wrong answer, or none before the prompt runs out, costs a life (and no points); the prompts wait 3.2 seconds at first and less and less, down to 1.2 seconds after 45 seconds; the last one standing wins, and alone it ends when you are out.
- **Timed round:** the most points in 30 seconds. Everyone sees the same prompts at the same time and answers on the same four panels (red, blue, green, yellow).
- **What it asks:** one large white word above the prompt: *Color* (the panel whose colour the word is written in) or *Word* (the panel whose colour the word names). The ink and the word are always two different panels, so each is a trap for the other. Which one is asked is random each prompt, so it can repeat.
- **Scoring:** a right answer is **1 point**, or **2 if it comes quickly** (in the first 40% of the time the prompt allows). In a timed round a wrong answer costs **1 point** (never below zero). **Only your first tap on a prompt counts**: you cannot mash all four.
- **Prompts** wait 3.2 seconds for answers at the start, down to 2.2 seconds after 20 seconds, and move on as soon as everyone has answered. The result of a prompt stays up for 0.8 seconds before the next one, and the first prompt comes 1.2 seconds in, so there is time to read what is asked. They come from the round's seed.
- **Nobody is knocked out.** When the time is up, the most points wins; a tie for the most, or scoring nothing, is a draw. Alone, it is a high-score round: no winner, just your points.
- The bar along the top is the time left, and everyone's points are in the row above the prompt, with a tick or cross for how they answered it.
- **Controls:** the panels are the controller, so tap or click one, or press **1-4** (top left, top right, bottom left, bottom right).
- The game used to be called Color match and only ever asked for the ink. Its version is now 5 (no shapes: just Color and Word), so its high score list starts again.

## Hot potato

A bomb with a lit fuse goes round the ring. Needs at least 2 players, so on your own a bot plays you.

- **Goal:** don't be holding it when it goes off. Players stand on a ring. One of them is handed the bomb; the holder presses **Pass** to throw it to the **next player along the ring** (so there is nobody to pick). **Whoever is holding it when it explodes is out.** Then a new bomb goes to a random player still in. **Last one in wins.**
- **The fuse is hidden.** You can see the bomb glow redder and shake as it burns, but not how long is left. Each bomb's fuse is a random length between 55% and 100% of the longest allowed that round.
- **Fuses get shorter:** the longest is 8 seconds in the first round, 0.9 seconds less every round, down to 4.5 seconds.
- **Passing:** after you receive the bomb you must hold it for 0.4 seconds before you can pass it on, so it cannot be flicked straight back.
- **Score** (the high score list): **how long you held a bomb without it going off on you**, in seconds (to a tenth). Every time you pass the bomb on, the time you held it counts; a hold that ends with the bomb exploding in your hands does not, so holding on longer is worth more but risks everything you have not yet passed on. Rounds survived is still what the scoreboard and the run history show. There is no time limit of its own: it goes on until someone is the last one in.
- **Bots** hold the bomb for between half a second and two seconds and then throw it, so they are beatable.
- **Controls:** one button: **Space**, **↑** or **W**, or tap anywhere on the arena.

## Anagram

One scrambled word, the same for everyone. Tap the tiles to spell it; the first to spell it scores.

- **Goal:** the most points in 60 seconds. A scrambled word is shown: the first three words have 3 letters, the next three 4, the next three 5, and from the tenth on 6 (the most tiles there are). Tap the tiles in the order that spells it; a tile you have used is dimmed, and **⌫** takes your last pick back. When you have used every tile the word is checked: right, and you score; wrong, and your picks are cleared so you can try again.
- **Any word made of the same letters counts** if it is in the game's word list (HEART or EARTH), not only the one the game had in mind.
- **Only the first to solve a word scores** (5 points, plus up to 5 more for how much of the 14 seconds was left). Then the answer is shown for a moment, with who got it, and a new word starts. **A word nobody solves in 14 seconds ends the run**: the answer is shown, and the most points wins (alone, it is your score). So the way to keep going is to solve every word, and the 60 seconds still end a run that has not missed.
- **What others see of you:** only your points and how many tiles you have picked, never which. The answer stays on the server until the word is over.
- **Nobody is knocked out.** When the time is up, the most points wins; a tie for the most, or scoring nothing, is a draw. Alone, it is a high-score round: no winner, just your points.
- **Controls:** the tiles are the controller, so tap or click them, or press **1-6** (left to right) to pick a tile and **Backspace** to take one back.

## Minesweeper race

One shared minefield, and everyone opens squares on it.

- **Goal:** open the most safe squares. The field is 9 by 9 with 10 mines hidden in it. Tap a square: a safe one **scores a point** for you and shows how many mines are in the squares next to it; a square with **no** mines next to it opens its neighbours too, and everything it opens is yours. **A mine knocks you out** (it stays on the field, marked, for everyone to see).
- **The first square opened is always safe**, and so are the squares round it, so the first tap opens up some space.
- **Everyone is on the same field.** A square opened by one person is open for all; a thin outline in the opener's colour shows who opened it.
- **Ending:** the run ends when every safe square is open, or when everyone is out. **Most squares opened wins**; on a tie the one still in wins, otherwise it is a draw. Alone it is a high score (squares opened).
- **Hidden:** where the mines are stays on the server; a square's mine is only ever shown once someone hits it.
- There is no time limit of its own: it goes on until it is beaten.
- **Controls:** the field is the controller, so tap or click a square. There is no keyboard control yet.

## Perfect stop

A marker sweeps back and forth along a bar with a target zone. Stop it inside the zone, round after round.

- **Goal:** stop your marker inside the green zone. Everyone sees the same marker and the same zone, and presses to stop **their own** marker where it is right then. Inside the zone and you go on to the next round; **outside it, or too slow, and you are out.** **Last one in wins**; alone it is a high score (rounds cleared).
- **Each round is harder:** the marker crosses the bar 1.1 times a second in the first round and 0.18 more every round, up to 2.6; the zone is 0.30 of the bar wide in the first round and 0.022 narrower every round, down to 0.06. The zone's middle moves each round (from the round's seed).
- **Too slow:** a sweep lasts 5 seconds; anyone who has not stopped by then is out. A round ends as soon as everyone left has stopped. Everyone's stops are shown as ticks in their colour.
- **Timing:** the stop is decided by when your press reaches the server, so a slow connection loses out.
- There is no time limit of its own: it goes on until it is beaten.
- **Controls:** one button: **Space**, **↑** or **W**, or tap anywhere on the arena.

## Pong rally

One ball on one shared court, and a paddle for each player on their own side. Needs at least 2 players, so on your own a bot plays you.

- **Goal:** don't miss the ball. Players take the sides of the court in turn: bottom, top, left, right (so two players face each other). Slide your paddle to send the ball back. **Miss it and you are out**, and your side becomes a wall. **Last one in wins.**
- **The ball** starts at 0.65 of the court a second and speeds up with every return (0.05 each), to 1.3. Where it lands on your paddle slants the way it goes back: the ends send it off sideways. After a miss, it is served again from the middle after a short pause.
- **More than four players:** four play at once. Who sits out changes every run, so everyone gets a turn.
- **Score** (the high score list): your returns. There is no time limit of its own: it goes on until someone is the last one in.
- **Bots** follow the ball with a lag and a small error, so they can be beaten.
- **Smoothness:** the server runs the ball, but your screen carries on moving it (and the other paddles) between updates, and draws your own paddle moving the moment you press, pulled back toward the server's position so they never drift apart. The server still decides every hit.
- **Controls:** left and right only. On the side paddles, left is up and right is down.

## Game versions

Every game has a **version** (`MINIGAME_VERSIONS` in `packages/shared/src/miniGames.ts`, starting at 1). Each saved score records the version it was played under, and the high score lists, "your best" and the ranks show **only the current version**. When a game's rules change enough that an old score is no longer fair against a new one (a different course, a different meaning for the score), raise its number and the game starts a fresh list; the old scores stay in the database (and an administrator reset still removes them).

- A solo score is sent with the version the player's page ran. If the server's version is different (the page is out of date) the score is refused with a note to reload, so a stale page cannot post onto the new list.
- Scores from lobby and waiting room runs take the server's current version, since the server runs the game.
- The leaderboard shows which version it is.

## Wall ball

Like the playground game "down ball": one wall across the top of the court, everyone standing in a row along the bottom, each as a paddle (as wide as the reach that hits the ball). Needs at least 2 players, so on your own a bot plays you.

- **Goal:** don't miss your turn. A ball is hit up at the wall and comes back down; **each time it comes back it is one player's turn, going round the players still in** (the one it is coming for is ringed, the others are dimmed). Slide along the bottom to where it will land (a ring on the floor shows the spot) and be there as it lands. It goes back up at the wall and then comes down for the next player. **Miss your turn and you are out.** **Last one in wins.**
- **Hitting is automatic:** there is no button. As the ball lands, if you are within 0.1 of the court of where it lands, it is hit back for you; if you are further away, you are out.
- **Everyone has to keep moving:** the ball lands near the **next** player's spot, moved by up to 0.05 at first and up to 0.28 later, so the player whose turn is coming has to be ready and the others cannot stand still.
- **Speed:** the ball takes 1.2 seconds to come down at first and 0.07 seconds less after every hit, down to 0.65 seconds.
- **Score** (the high score list): your own hits. There is no time limit of its own: it goes on until someone is the last one in.
- **Bots** slide to where the ball will land, setting off a little early or late, so on a quick ball they can be too slow and miss.
- **Smoothness:** the server runs the ball, but your screen carries it on between updates and draws your own player moving the moment you press; the server still decides every hit.
- **Controls:** left and right to slide: **←** / **→** or **A** / **D**.

## Road hop

Cross lane after lane of traffic, and keep ahead of the bottom of the screen. Everyone crosses the same road, side by side, and never touches.

- **Goal:** get up the road. The road is rows: **grass** is safe, a **road** row has cars driving across it, all the same speed and spacing for everyone. Slide **left and right** to line up and press **Hop** to go up one row. **A car that touches you knocks you out.** **Last one hopping wins**; alone it is a high score (rows crossed, two metres a row).
- **The bottom edge:** the screen keeps rising. The red hazard band along the bottom is where it is, and anyone it passes (a whole row under it) is out, however safe their row. It starts at 0.08 of a screen a second, gains 0.009 a second and tops out at 0.26 after about 20 seconds. From the start you have about 3 seconds before it takes the grass you begin on, so you must keep going up. There is no hopping back down.
- **The top of the screen** is as far as you can hop: you cannot hop to a row you can't see, so when you have caught up with the top you wait for the screen to rise.
- **Hopping:** one row a press, then a wait of 0.12 seconds, so mashing the button cannot cross the road before a car arrives. You slide at half a screen a second and can't leave the screen. You start on the first grass row, in a spot across the road that is the same for you every run (the middle first, then out to each side).
- **Traffic** is made of cars 0.08 to 0.18 of a screen wide, driving left or right at a speed that stays the same for a row, and loops round off screen. Early rows are 0.16 to 0.3 of a screen a second with at least half a screen between cars; by about row 40 they are 0.34 to 0.68 with 0.2 to 0.36 between, so the gaps get tighter and the cars quicker. A hopper fits in every gap (never under 0.2 between two cars), and the cars come from the round's seed.
- **Bands:** roads come in bands of 2 to 4 rows (up to 5 higher up) with a grass row between to catch your breath. Higher up the grass is more and more often left out (by row 40, six times in ten), so the bands run together.
- **Score:** the rows you crossed, two metres each (the same as the high score list). With two or more players the last one still hopping wins; with a time cap (a waiting room), whoever is still in keeps their rows and nobody wins. There is no time limit of its own.
- **Hard to pass 30 seconds:** a test bot that sees every car a second ahead, and moves perfectly, lasts between 20 and 60 seconds, so a person getting to 30 seconds is doing very well.
- **Ping:** your own hopper is worked out on your own device (see "Ping and who works out what"), so hops and hits are decided the moment you press. The server counts you out if you fall under the bottom edge, whatever your device says.
- **Controls:** **←** / **→** or **A** / **D** to slide, **Space**, **↑** or **W** to hop, or tap anywhere on the arena. On a phone, the **◀** and **▶** buttons and **Hop**.
## Fishing

Cast a lure up the pond, hook a fish, and keep it in the green while you reel it in. Everyone fishes the same pond at once, and never touches.

- **The pond:** fish swim across it from side to side while they drift up and down, always from the round's seed, so it is the same pond for everyone. Anglers stand in a row along the bank at the bottom, each at their own place, and cast **up** the pond. Fish come in four sizes: **1, 2, 4 and 8 points**. Bigger fish are rarer (though less so as the run goes on), swim further up the pond (the 8-point fish stay in the far third), and fight harder.
- **Casting:** **press and hold** to charge a cast. The power meter runs from nothing to full in 1.1 seconds and then back down, and a dashed line up your lane shows where the lure will land. **Let go** to throw it: it reaches from 0.1 of the pond (a weak cast) to 0.74 (full power) and then sits in the water.
- **Winding in:** with the lure out, **hold** to wind it back in (0.4 of the pond a second) and let go to leave it where it is. So you set it where the fish swim past, and wind it in to move it or to cast again. Back at the rod, you need a fresh press to cast.
- **Hooking:** a fish that **touches the lure** (the lure and the fish's size together) is hooked, once it has landed: while it sits in the water or is being wound in. A lure still flying out to where it will land passes over fish without taking one. Each angler can have a go at a fish once: one that got away does not bite again.
- **Reeling it in:** a bar appears down the left of your screen with a **green zone** and the fish on it. **Hold to raise the green zone and let go to let it sink** (it speeds up at 2.4 a second each second while held, sinks at 1.6, up to 1.4 a second, and bounces a little at the ends). **Keep the fish inside the green:** while it is, the catch fills (the bar beside it) and the line mends 0.2 a second; while it is not, the catch drains slowly and the line wears down. Fill the catch and you land the fish and refill your health bar by its points; wear the line out and it snaps. Smaller fish are easier: the green is wider and the fish darts about less.
- **Lines and the wait for a bite:** you have **three lines**, shown under your avatar. A snapped line costs one. So does **25 seconds with nothing hooked** (the thin bar under your lines is the wait running down; it resets whenever a fish is hooked). With none left you are out. **Last one fishing wins**; alone it is a high score (peak health).
- **The health bar:** under your lines is a **health bar with a number**. You start with **10**, and it **drains all the time**: 0.5 a second at the start and 0.03 a second faster every second, so it always runs out in the end. Landing a fish **refills it by 5 for every point** the fish is worth (5, 10, 20 or 40), so the bigger the fish the more health. The bar is drawn as how full you are compared with the most health you have had (it goes red below 30%); at 0 you are out, whatever lines you have left.
- **Harder as it goes:** the pond gets busier over the first 60 seconds (a new fish every 0.9 seconds, down to every 0.5; fish up to half as fast again; the small fish get rarer). The reeling keeps getting harder for longer, up to 8 minutes in: the green zone shrinks (to 0.4 of its size), the fish darts about up to 5 times as fast and rests for a shorter time, and the line wears down up to 5 times as fast, so a run always ends in the end. A fish is easy to land at the start.
- **What each size does against you** at the start (green half height, how fast it darts about the bar, catch fill a second in the green, line wear a second outside it): 1 point 0.28, 0.22, 0.8, 0.12; 2 points 0.25, 0.3, 0.6, 0.16; 4 points 0.22, 0.38, 0.45, 0.2; 8 points 0.19, 0.45, 0.35, 0.25. Each fish fights the same way for everyone who hooks it, from its own seed.
- **Score** (the high score list): your **highest health**, the most the bar has ever been (you start on 10, so that is the least). There is no time limit of its own: it goes on until someone is the last one in. With a time cap (a waiting room), whoever is still in keeps the highest health they have had and nobody wins.
- **How long a run lasts:** with fights this forgiving, a test angler who reels a tenth of a second behind the fish lasts one to two and a half minutes (80 to 140 seconds over four ponds) before the drain catches up with them, and someone who never catches anything is out in about 15 seconds.
- **Ping:** your own angler (the cast, the lure, the reeling) is worked out on your own device (see "Ping and who works out what"), so it answers the moment you press. The fish come from the same seed and the server's clock. Where you stand along the bank is set by the server when the run begins.
- **Controls:** one button does everything: hold **Space**, **↑** or **W**, or press and hold anywhere on the arena. On a phone, hold **Hold**.

## Orbit

Circle the ring and flip direction to dodge what flies at it. Everyone is on the same ring, and never touches.

- **Goal:** last as long as you can. You go round a ring at a steady speed, **one button flips which way you go**. Things fly in from the edge and out of the middle toward spots on the ring (a faint red mark on the ring shows where each will land, brighter as it gets near), and one that lands where you are ends your run. **Last one going wins**; alone it is a high score (**seconds lasted**).
- **Always possible:** everything comes from the round's seed, and each thing is put somewhere that a hidden way round (which flips every half to one and a half seconds) is never touching, so there is always a way through. It is a way for you to find, not one you are shown.
- **Harder as it goes (38 seconds, then no harder):** you go round quicker (1.7 radians a second up to 3.2), things come more often (one every second down to every third of a second), each is in the air for less (1.5 seconds down to 0.85, so less warning) and each covers more of the ring.
- **Deadly** from 0.07 seconds before a thing lands to 0.07 after.
- **Hard to pass 30 seconds:** a test player who sees everything coming and plays perfectly can go on for ever, but one who reacts 0.3 seconds late lasts about 15 to 25 seconds.
- **Ping:** your own marker is worked out on your own device (see "Ping and who works out what"), so a flip happens the moment you press.
- **Controls:** one button: **Space**, **↑**, **←** / **→** or **W** / **A** / **D**, or tap anywhere on the arena. On a phone, **Flip**.

## Rock paper scissors

Everyone picks at once. Needs at least 2 players, so on your own a bot plays you.

- **A round:** everyone picks rock, paper or scissors within the time given, and **nobody sees what the others picked until the round is decided**. Paper beats rock, scissors beat paper, rock beats scissors.
- **Who is out:** if **two different choices** were made, the one that beats the other wins: **everyone who made the losing choice is out**, and everyone who made the winning one scores a round. If **everyone made the same choice, or all three were made**, it is a **draw** and the round is played again, with nobody out. **Someone who has not picked when the time is up is out.** Only your first tap counts.
- **Last one in wins.** Alone against the bot, you are out when you lose a round (or run out of time), and your score is the rounds you won. If everyone is out together, nobody wins.
- **Time to pick** starts at 3.5 seconds and is 0.15 seconds shorter every round, down to 1.2 seconds, so a run is short.
- **Hidden:** your pick is only sent to you until the round is decided (to everyone else it shows as a ? once you have picked); a spectator sees no picks at all.
- **Bots** pick a moment into the round, at random, but a third of the time they play what beats whatever a rival showed last round, which is what people tend to repeat. It is a game of chance, and a bot reading a person who only ever plays rock wins clearly more than a coin would.
- **Controls:** the three choices are the controller, so tap or click one, or press **1-3** (rock, paper, scissors).

## Rhythm lanes

Notes fall down four lanes to a line; tap the lane as each one reaches it. Everyone plays the same notes, and never touches.

- **Goal:** keep tapping on the beat. A note falls down one of four lanes on each beat, and you tap that lane (tap anywhere in it, or press **D**, **F**, **J**, **K**) as the note reaches the line. A tap within **0.06 seconds** of the note is **great (2 points)**, within **0.12 seconds** is **good (1 point)**.
- **The hit zone:** a glowing box is drawn across the lanes where the line is, and it is the real timing window turned into distance: tap while a note's middle is inside it. The outer band is a good hit (±0.12 seconds), the brighter inner band a great one (±0.06). It gets taller as the notes speed up, because a quicker note covers more distance in the same time.
- **Lives:** you have three, shown as hearts. **A note that gets past the line untapped, or a tap with no note to hit, costs a life**, so mashing every lane does not work. Out of lives and your run is over. **Last one in wins**; alone it is a high score (points).
- **Harder as it goes (40 seconds, then no harder):** the beat goes from 100 to 190 beats a minute, and the notes fall quicker (1.4 seconds from the top down to 0.8, so less warning). **From 10 seconds in, some beats have two notes at once** (in two different lanes), up to two beats in five by 30 seconds.
- **Always possible:** every note is in a lane of its own at its moment, and the same beats are apart by at least 0.3 seconds in a lane, so a perfect player never misses.
- **Hard to pass 30 seconds:** a test player who is within 0.04 seconds of every note lasts at least 15 seconds, and one who is a tenth of a second out lasts under two minutes (nobody goes on for ever). Two fingers are needed for the two-note beats.
- **Ping:** your own taps are judged on your own device against the notes (see "Ping and who works out what"), so how well you did does not depend on your connection. Everyone's notes are the same, from the round's seed.
- **Controls:** the four lanes are the controller, so tap or click one, or press **D F J K**.

## Sort it

Sort what rides the belt into two bins by a rule that keeps changing. Everyone sorts the same belt, each at their own pace, and never touches.

- **Goal:** sort items into the left or right bin by the rule on screen: **by colour** (red left, blue right), **by shape** (circle left, square right) or **by size** (small left, big right). Items come down the belt one after another; tap the **bin** (or press **←** / **→**) to sort the **oldest** item you have not dealt with, from when it comes on the belt until just after it reaches the line. Right is a point.
- **Lives:** you have three, shown as hearts. **A wrong sort, or an item that gets past the line unsorted, costs a life.** Out of lives and your run is over. **Last one in wins**; alone it is a high score (items sorted). A tap when nothing is on the belt does nothing.
- **The rule changes every few items** (every 8 at first), never to the same one, with a short pause before the next item so you can read it; the bins always show what goes where, and a small *NEXT: ...* warns when the oldest item after the one you are on has a different rule.
- **Harder as it goes (40 seconds, then no harder):** an item every 1.3 seconds down to every 0.38, each on the belt for less time (2.6 seconds down to 1.3, so less warning), and the rule changing every 5 items.
- **Hard to pass 30 seconds:** a test player who reads and answers in half a second lasts at least 15 seconds, and one who is a second slow lasts under two minutes (nobody goes on for ever).
- **Ping:** your own sorting is judged on your own device (see "Ping and who works out what"). Everyone's belt is the same, from the round's seed.
- **Controls:** the two bins are the controller, so tap or click one, or press **←** / **→**.

## Steady tempo

Keep the beat going when it falls silent. Everyone has the same rounds, and never touches.

- **A round:** four guide ticks play at the round's tempo (a ring flashes on each), then they **stop** and you keep tapping at the same tempo, anywhere on the arena or with **Space**, for a number of beats that **grows every round** (4 in the first, one more each round, up to 14). The tempo is different every round (about 80 to 150 beats a minute, going up).
- **Scoring:** the beats you should be tapping are never shown. A tap within the round's margin of a beat is **1 point**, and **2** if it is within half of the margin. A tap further out than the margin (early or late), or **a beat that goes by with no tap near it, costs a life**; you have three, shown as hearts. Taps during the guide ticks, or between rounds, do nothing. Out of lives and your run is over. **Last one in wins**; alone it is a high score (points).
- **The margin** is 0.15 seconds either side in the first round and narrows over six rounds to 0.05 seconds.
- **Feedback:** a dot for each beat of the round, lit by how it went (green right on, yellow on it, red out or missed), and a gauge that shows how far from the beat your last tap was (left is early, right is late, the green part is the margin).
- **Hard to pass 30 seconds:** a test player whose taps are about 0.04 seconds out lasts around 45 seconds, and one 0.06 seconds out about 30; at 0.09 it is about 20.
- **Ping:** your own taps are judged on your own device against the beats (see "Ping and who works out what"), so your connection does not matter. Everyone's tempos are the same, from the round's seed, and only the guide ticks are ever sent, never the silent beats.
- **Controls:** one target, the arena: tap or click anywhere, or press **Space**.

## Lava

A ball that bounces by itself, up a tower of platforms. Everyone climbs the same tower side by side, and never touches.

- **Goal:** keep up with the screen. The ball bounces off every platform it comes down on, about a third of a screen high, and the screen climbs the tower faster and faster. **Slide left and right** to land on the next platform; **fall off the bottom, into the lava, and you are out**. The top of the screen is a ceiling. **Last one up wins**; alone it is a high score (metres the screen climbed).
- **Wrapping round:** go off one side and you come back on the other, so the next platform is never far.
- **The tower** is a platform every 0.13 to 0.26 of a screen up, never further sideways than 0.3 from the last, so a bounce can always reach the next. From about a screen up, **some platforms slide** from side to side (a bright edge), more and more of them, up to two in five. The platforms come from the round's seed, so they are the same for everyone; you start on a floor as wide as the screen.
- **The climb** starts at 0.08 of a screen a second and reaches 0.36 after 50 seconds. A bounce gains about a quarter of a screen a second, so even a perfect player is caught up with in the end.
- There is no time limit of its own: it goes on until it is beaten. With a time cap (a waiting room), whoever is still in keeps their metres and nobody wins.
- **Hard to pass 30 seconds:** a test player who always steers to the highest platform the bounce can reach lasts about 40 seconds, and one who steers a fifth of a second late lasts 20 to 35, so getting to 30 is a good run.
- **Ping:** your own ball is worked out on your own device (see "Ping and who works out what"), so it answers the moment you press. The platforms come from the same seed and the server's clock.
- **Controls:** left and right only.

## Tunnel

A ship flies down a tunnel that twists and narrows. Everyone is in the same tunnel, side by side, and never touches.

- **Goal:** stay between the walls. The tunnel comes down the screen toward your ship; **steer left and right** to follow it. **Touch a wall and you are out.** **Last one flying wins**; alone it is a high score (metres flown).
- **The tunnel** starts straight and 0.48 of the screen wide, and its curves grow over the first six screens. Its middle follows two waves that never turn sharper than the ship can slide, so there is always a line through. It **narrows** by 0.02 a screen of tunnel, down to 0.18 wide. The waves come from the round's seed, so it is the same tunnel for everyone.
- **Speed:** the tunnel comes at 0.45 of a screen a second at first and 0.018 faster every second, with no top speed, so it always gets faster than anyone can follow in the end. The ship slides at 0.6 of a screen a second.
- There is no time limit of its own: it goes on until it is beaten. With a time cap (a waiting room), whoever is still in keeps their metres and nobody wins.
- **Hard to pass 30 seconds:** a test pilot who follows the middle perfectly lasts about two minutes, one who sees the tunnel a fifth of a second late lasts 27 to 39 seconds, and one a third of a second late about 20 to 25, so getting to 30 is a good run.
- **Ping:** your own ship is worked out on your own device (see "Ping and who works out what"), so it answers the moment you press. The tunnel comes from the same seed and the server's clock.
- **Controls:** left and right only.

## Parachute

A skydiver falls through rows of clouds and gusts of wind, with a chute to float on. Everyone falls through the same sky, side by side, and never touches.

- **Goal:** get through every gap. A row of clouds, with a gap, comes up the screen at you. **Slide left and right** into the gap; **touch a cloud and you are out**. **Last one falling wins**; alone it is a high score (metres fallen).
- **The chute is the arrows:** **holding left or right opens it** (there is no chute button); let go and you are in **free fall**. With it open you slide (0.7 of a screen a second) and **float up** the screen (0.2 of a screen a second), so the next row takes longer to reach you, and **gusts push you harder** (1.4 times). In free fall you sink (0.3 of a screen a second) and only the wind moves you. It eases, so opening and closing is a glide, not a jerk. You can be anywhere between 0.14 and 0.62 down the screen.
- **Gusts** are bands of wind between rows (more than one gap in two has one), with arrows showing which way they push (0.25 of a screen a second; 1.4 times that with the chute open). A gust is 0.4 of a screen tall and **fades in and out**: it is drawn that way (faint at its edges, with the arrows fading with it), and its push builds up over the first 0.15 of a screen of it and dies away over the last 0.15, so one never shoves you all at once and you can see it coming up from below.
- **The rows** come every half a screen of fall, and the course comes up the screen at 0.4 of a screen a second at first and 0.12 quicker every second, with no top speed, so it always gets too fast in the end. The gap starts 0.34 wide and narrows to 0.17 (after about 115 seconds), and each gap is within reach of the last one, working from the time between a row coming into view at the bottom and reaching a skydiver as low and as fast as they can be, and against the wind. Everything comes from the round's seed, so it is the same for everyone.
- There is no time limit of its own: it goes on until it is beaten. With a time cap (a waiting room), whoever is still in keeps their metres and nobody wins.
- **Hard to pass 30 seconds:** a test skydiver who reacts instantly and never misjudges a gap lasts about two minutes, and one that steers on a delayed view of itself (like a late press) falls out within seconds, so getting to 30 seconds by eye is a good run.
- **Ping:** your own skydiver is worked out on your own device (see "Ping and who works out what"), so it answers the moment you press. The sky comes from the same seed and the server's clock.
- **Controls:** **←** / **→** or **A** / **D** to slide, which also opens the chute.

## Rating a game

When a run ends and its result card is showing, a **thumbs up / thumbs down** appears in the result card (in a room's lobby, a spin's waiting room, an open lobby and solo practice alike).

- **What is rated is the game**, not the run. You have **one rating per game**: tapping the other thumb changes it, and playing a game twice never counts twice. The thumb you picked stays lit.
- The thumbs sit **inside the end-of-run pop-up** (a strip along the bottom of the result card, "Nobody made it" or the winner), so they read as part of it. They are real buttons laid over the arena, so tapping one does not press the game, and the next run still starts by itself.
- **Only signed-in members** can rate, and a rating for a game that does not exist is refused.
- **Administrators** see the results on the Administrator page under **Mini game ratings**: for each game the thumbs up, thumbs down, total, the share that are up, and thumbs up / down for the last 7 days (so a new game is not drowned by an old one's history). Lowest rated first. It shows **counts only, never who voted**. Not shown on the player-facing Mini games page.
- Ratings are kept in the `mini_game_ratings` table (one row per person per game).

## Resetting high scores

Super administrators can wipe the saved high scores from the Administrator page, under **Mini game high scores**: one game's with its **Reset** button, or every game's with **Reset all high scores**. It asks first and cannot be undone. Only the saved runs (`mini_game_scores`) go: ratings, wins in a lobby and everything else stay. Each reset is written to the admin audit log (`minigames.resetScores`).

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
| Catch the coins | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Battleships | Click a square (no keyboard control yet). | Tap a square on the board. |
| Quick draw | Press **Space**, or click the big light. | Tap the big light. |
| Tilt | Hold **←** / **→** or **A** / **D**. | Hold the **◀** and **▶** buttons. |
| Stacker | **Space**, **↑** or **W** to stop the light. | **Stop**, or tap anywhere on the arena. |
| Words | Type the letters, **Enter** to send, **Backspace** to take one back. | Tap the on-screen keys. |
| Memory pattern | Click a panel, or press **1-4** (top left, top right, bottom left, bottom right). | Tap a panel. |
| Asteroid defence | **←** / **→** or **A** / **D** to swing the gun (it fires by itself). | The **◀** and **▶** buttons. |
| Sumo ledge | **←** / **→** or **A** / **D** to walk, **Space**, **↑** or **W** to shove. | **◀ Shove ▶**: the arrows either side of the Shove button. |
| Whack-a-mole | Click a hole, or press **1-9** (laid out like a numpad: **7 8 9** on the top row, **1 2 3** on the bottom). | Tap a hole on the grid. |
| Jump rope | **Space**, **↑** or **W** to jump. | **Jump**, or tap anywhere on the arena. |
| Obstacle race | **←** / **→** or **A** / **D** to steer. | The **◀** and **▶** buttons. |
| Snake arena | **←** / **→** or **A** / **D** to turn. | The **◀** and **▶** buttons. |
| Gravity flip | **Space**, **↑**/**↓** or **W**/**S** to flip. | **Flip**, or tap anywhere on the arena. |
| Laser gaps | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Match | Click a panel, or press **1-4** (top left, top right, bottom left, bottom right). | Tap a panel. |
| Hot potato | **Space**, **↑** or **W** to pass. | **Pass**, or tap anywhere on the arena. |
| Anagram | Click a tile, or press **1-6** to pick one and **Backspace** to take it back. | Tap a tile (⌫ takes one back). |
| Minesweeper race | Click a square (no keyboard control yet). | Tap a square on the field. |
| Perfect stop | **Space**, **↑** or **W** to stop. | **Stop**, or tap anywhere on the arena. |
| Pong rally | **←** / **→** or **A** / **D** to slide your paddle. | The **◀** and **▶** buttons. |
| Wall ball | **←** / **→** or **A** / **D** to slide (the hit is automatic). | The **◀** and **▶** buttons. |
| Road hop | **←** / **→** or **A** / **D** to slide, **Space**, **↑** or **W** to hop. | The **◀** and **▶** buttons, and **Hop** (or tap anywhere on the arena). |
| Fishing | Hold **Space**, **↑** or **W**: charge a cast, wind the lure in, reel a fish in. | Hold **Hold** (or press and hold the arena). |
| Rock paper scissors | Click a choice, or press **1-3** (rock, paper, scissors). | Tap a choice. |
| Rhythm lanes | Press **D**, **F**, **J**, **K** (or click a lane). | Tap a lane. |
| Sort it | Press **←** / **→** (or click a bin). | Tap a bin. |
| Steady tempo | **Space** (or click anywhere). | Tap anywhere on the arena. |
| Lava | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Tunnel | **←** / **→** or **A** / **D**. | The **◀** and **▶** buttons. |
| Parachute | **←** / **→** or **A** / **D** (holding one opens the chute; none is free fall). | The **◀** and **▶** buttons. |
| Orbit | **Space**, **↑**, **←** / **→** or **W** / **A** / **D** to flip direction. | **Flip**, or tap anywhere on the arena. |

## Runner

The offline-dinosaur game, with everyone running the same track.

- **Goal:** survive. Obstacles scroll in from the right, faster and faster. Hit one and you are out.
- **Cactus** (a game cover standing on the ground): jump it. A **tap** is a short hop.
- **Two skinny cacti** (from about 2 seconds in, roughly one cactus in three): a pair of narrow covers with a gap between them, about 0.16 of a screen wide in all, so it reads as a double block. It is wider than a normal cactus, so a quick tap hop only just clears it early on: jump a touch early, or hold the jump for a longer hop.
- **Log** (a wide, low stack of covers, which start to appear about 5 seconds into a run): too wide for a hop, so **hold** the jump button to go higher and stay in the air longer.
- **Bird** (a coloured game cover with a 😴 on it, floating at head height, which starts to appear about 8 seconds in): **duck** under it. Jumping into it knocks you out. About two birds in five are **wide** (a long run of covers, up to about a third of the screen), so keep **holding** duck until you are all the way past, not just until it reaches you.
- **Pit** (a hole in the ground, from about 10 seconds in): be **in the air** while it passes under you, and land on the far side. Being on the ground over the middle of one knocks you out. A pit is 0.18 to 0.32 of a screen wide, so a tap hop always spans one; jump a touch before the edge, not right at it.
- **Tall stack** (a cactus about half again as tall, from about 14 seconds in): a tap hop only just reaches the top of it, so **hold** the jump to clear it with room to spare.
- **Jumping:** hold the button on the way up to jump higher and further; letting go early cuts the jump short. You can only jump from the ground, and holding the button after you land does not jump again: let go and press again. Pressing part-way up a hop does not make it higher.
- **Ducking** only works on the ground, and only while you hold it.
- **Speed** starts at 0.65 of a screen per second and climbs by 0.02 every second, with no top speed (it is 1.1 after about 22 seconds, and goes on from there).
- Obstacles are always spaced so there is time to land and react.

## Flappy

Flap through the gaps, everyone on the same course.

- **Goal:** fly as far as you can. Pipes scroll in from the right, with a gap at a different height each time.
- **Flap** gives a short upward kick; gravity pulls you down between flaps. Tapping steadily keeps you level.
- Touching a **pipe, the floor or the ceiling** knocks you out.
- **Gaps** move up and down from pipe to pipe, but never by more than a bird can climb in the time between pipes.
- **Speed** starts at 0.5 of a screen per second and climbs by 0.012 every second, with no top speed.

## Dodge

Blocks fall; slide left and right to stay clear.

- **Goal:** don't get hit. Everyone stands on the same floor.
- You move at half a screen per second and can't leave the screen.
- **Blocks** (game covers of different widths) fall faster and faster: from 0.4 of a screen per second, 0.02 more every second, with no top speed. Blocks are 0.09 to 0.24 of a screen wide and 0.09 tall. A new block appears every 0.8 seconds at the start, speeding up to every 0.3 seconds after about 33 seconds.
- A **safe lane** drifts slowly from side to side, and no block is ever made over it, so there is always a way through for someone who keeps up with it.
- A block that hits you knocks you out.

## Jump rope

A rope swings round and everyone jumps it together.

- **Goal:** jump each time the rope comes down to the floor. Everyone stands in a row on the same floor.
- **Mistime it** (be on the floor as the rope passes under you) and you are out. Last one jumping wins.
- **Jumping** only works from the floor, and a jump is the same height every time, so it is all about timing. Pressing again while you are still in the air does nothing.
- **Score:** the number of swings you jumped (shown as SWINGS in the top-left counter, where the other games show metres).
- **Speed:** a swing starts at 1.4 seconds and shortens by 0.04 seconds for every second of the run, down to 0.75 seconds after about 16 seconds. Now and then a swing is slower (a pause, 1.5 times as long) or quicker (0.85 times as long, never under 0.65 seconds), so don't jump on rhythm alone.
- Every swing is long enough to land and jump again.
- **Depth:** the rope comes up on the far side of the jumpers and down on the near side. While it is behind them it is drawn darker, with no glow, and behind the jumpers; once it is over their heads it is bright, with a glow, and passes in front of them.

## Obstacle race

A top-down race on a scrolling track, everyone on the same course.

- **Goal:** stay on the screen. Obstacles scroll down the track toward you; steer left and right to miss them. Everyone drives on the same track, side by side, and cars never bump into each other.
- **The middle line is full speed.** A driver at full speed sits on the dashed line across the middle of the screen, and nobody can get ahead of it, so the race is about staying on that line.
- **A hit slows you down**, and you slide back down the screen. You recover by yourself and climb back to the middle line (slowly: about a sixteenth of a screen a second). From the middle line one hit is never enough to put you off the bottom, but hits close together add up: a **cone** is a nudge, an **oil slick** (the dark puddle) is more, and a **rock** (a big cover) is the worst, about a quarter of a screen. Straight after a hit you cannot be hit again for half a second.
- **Slide off the bottom** (the red glow) and you are out. Last driver on the screen wins; alone, your distance is your score.
- **Starting spots** are spread across the middle of the track, the same spot for you every run.
- **Speed:** the track starts at 0.6 of a screen per second and climbs by 0.016 every second, with no top speed. A new obstacle appears every 0.65 seconds at the start, down to every 0.22 seconds after about 21 seconds, so hits come thicker and faster and every run ends.
- A **safe lane** drifts slowly from side to side, and no obstacle is ever made over it, so there is always a way through for someone who keeps up with it. It stays clear of the pit lanes too, so a clear path is always on the road.
- **Pit lanes** (amber hatched strips with a bright edge each side) appear in stretches about 0.8 of a screen long from a few seconds in, scrolling at the course speed. Up to two at a time, **against either kerb or anywhere in the middle of the track**, each between **a tenth and a third of the track wide**. A driver whose middle is **in** one is dragged down the screen the whole time (0.14 of a screen a second, more than the slow climb back), so the way out is to steer out of it; staying in one long enough slides you off the bottom. Which of the left, the right and the middle is likelier swings slowly over the run, and everything comes from the round's seed, so it is the same for everyone. They give a driver who hugs an edge, or cuts through the middle, a price to pay.
- A pit lane is never made over the safe lane (nor within 0.1 of it), and the safe lane stays out of any pit lane on the track, so there is always a clear way through however many there are.
- You steer at 0.6 of a screen per second and can't leave the track (the striped kerbs).

## Catch the coins

Coins fall; slide left and right to catch them before anyone else does, and keep out of the way of the bombs.

- **Goal:** catch coins. Everyone is on the same floor and goes for the same coins.
- **A bomb is instant death, and the only thing that is.** Catch one and you are out for the run, keeping the coins you had. Keep clear of them. A coin that gets past you costs nothing.
- **Endless (no time limit):** everything keeps getting quicker and busier for as long as you last, with no top speed, and more and more of what falls is bombs (up to one in two). The last one standing wins; alone, it ends when a bomb gets you or your health runs out, and your coins are the score.
- **Health bar** (endless only): a small bar over each catcher's coin count. You start with **10** (of at most **20**) and it **drains all the time**: 0.4 a second at the start and 0.04 a second faster every second, so it always runs out in the end (a test catcher that goes for every coin and keeps clear of the bombs lasts about 38 seconds). **Each coin you catch refills 1.** At 0 you are out, like a bomb, keeping your coins. A coin that gets away still costs nothing; the drain is what you are racing. A timed round has no health bar.
- **With a time limit (30 seconds):** the most coins wins, a tie for the most, or catching nothing, is a draw (a bomb still puts you out of it). Alone, it is a high-score round: no winner, just your coins.
- **Coins** (gold) are worth one each. If two catchers reach the same coin, the nearer one gets it.
- **Bombs** (dark, with a fuse) are about one item in seven at the start and **one in two** by the end of the ramp (40 seconds endless, 30 seconds timed): the longer you last the more of them there are. Never two in a row.
- **Speed:** endless, things start at 0.45 of a screen per second and climb by about 0.019 every second (1.2 after 40 seconds, and on from there), and a new item appears every 0.8 seconds at the start, down to every 0.28 at 40 seconds and quicker still after that. A timed round starts at 0.4 and climbs to 0.7, one every 0.55 seconds down to every 0.3.
- With a time limit the bar along the top is the time left. Each catcher's coin count is shown over their head.
- You move at 0.6 of a screen per second and can't leave the screen.

## Quick draw

A reaction duel on one shared screen. Needs at least 2 players, so on your own a bot duels you.

- **How a round goes:** everyone waits with a finger ready. After a **random pause** (1.5 to 4 seconds, never shown to anyone) the big light flashes **GO!**. The **first tap after GO** wins the point.
- **False start:** tapping **before** GO puts you out of that round (you are dimmed, and can tap again in the next round).
- **If everyone jumps the gun**, the round is shown and run again.
- **Winning:** first to **3 points** wins the run. There is no time limit of its own: it goes on until someone has the points (in a spin's waiting room, the 30 second cap ends it and the most points wins; a tie is a draw).
- **Fairness:** who wins the point is decided by the order taps reach the server, so a slow connection loses out. It is for fun, not a reaction-time test. The winning tap's time after GO is shown.
- **High score:** your **reaction time**, in milliseconds: your quickest winning tap in the run. **Smaller is better**, so the high score list runs from the fastest time up. The time is measured on your own device, from the moment GO is on your screen to your tap, so your connection does not count against it. The server keeps it within what it saw and never under 100 ms. A run where you did not win a point has no score. (Scores from before this change were points, and are no longer shown.)
- **Bots** tap about a third to three quarters of a second after GO and never false-start, so a quick person beats them.
- **Controls:** the big light is the controller. Tap it, or press **Space**.

## Tilt

One beam, and everyone has their own ball on it.

- **Your own ball.** Hold left or right to push **your** ball (yours has a ring round it). Everyone's balls are on the same beam, each in its owner's colour.
- **The beam tips toward where the balls are.** It leans toward the balls' average position, so balls bunched on the right tip it right, and a tipped beam pulls **every** ball downhill. The group tips it around together while each person fights to stay on.
- **The beam also wobbles by itself**, from the start and more and more as the run goes on, so keep correcting. The wobble comes from the round's seed, and it always gets strong enough to end a run.
- **Rolling off is out.** A ball that goes past either end drops away and bursts below the arena, and its owner is out (they keep their score and keep watching). The run ends when the last ball is off, or when one ball is left in a run with others.
- **Targets** (green) appear on the beam, up to two at a time, and last 7 seconds. The **first ball to reach one** scores 1 (the nearest, if two arrive together).
- **Winning:** most targets scored wins. On a tie, the ball still on the beam wins; otherwise it is a draw, and so is scoring nothing. Alone it is a high score.
- Everyone's points are in the row under the beam, with an arrow for the way each is pushing; fallen players are dimmed.
- **Controls:** left and right only.

## Stacker

One tower and one light for the whole room. Stop the light on the target to climb.

- **One shared tower:** a grid 9 squares wide. It has **no top**: the view is 12 rows tall and scrolls up as the tower grows, with every fifth row numbered, so you can climb as high as you can keep locking rows in. A light bounces from one side of the current row to the other, the same for everyone. The target squares of the row are outlined in green.
- **Locking a row:** press (Space, Up, or tap) as the light passes over the target. The **first press that lands** locks the row for that player, scoring 1, and **everyone moves up** to the next row, shown in the colour of whoever locked it.
- **Missing:** a press that misses knocks that player out of the run (they keep watching). A press a moment after a row was just locked (about a third of a second) is ignored, so two people who press together are not penalised for being second. A press within a third of a square of the target's edge still counts, to forgive a slow connection.
- **Harder going up:** the target is **5 squares wide** on the first two rows, then 1 narrower every 2 rows, down to **2** by row 7, and a **single square** from row 19 up. The light starts at 6.5 squares a second and is 0.7 faster each row, up to 12 at about row 8, and **keeps getting faster** after that (0.4 a row) up to 22 squares a second far up the tower. A press counts a little outside the target, and a bit more the faster the light goes, so a fast light is not judged unfairly on a slow connection. The first row's target can be anywhere; **every row after it stands on the one below**, as in the arcade game. A narrower row's target sits somewhere **within the squares of the row under it**, and a target as wide as the one under it can shift by **one square** to either side (a single-square target stays in the same column). So the tower climbs from where it began and cannot jump across the field. Where the target is comes from the round's seed, and the next row's is not known until it is reached.
- **Ending:** the run ends when everyone is out (the tower has no top, so there is no time limit of its own), or if nobody has pressed the button for **20 seconds** (everyone has wandered off). **Most rows locked wins**; a tie is a draw. Alone it is a high score (how many rows you climbed) and ends when you miss.
- Everyone's rows are listed on the right, and the bar along the top is the time left.
- **Controls:** one button: **Space**, **↑** or **W**, or tap anywhere on the arena.

## Words

Everyone guesses the same four-letter word, as in Wordle.

- **One secret word for everyone,** picked at random from a list of about 490 everyday four-letter words (guesses can be any dictionary word, see below). It stays on the server until the run is over, when it is shown.
- **Five guesses.** Type a word (on a keyboard, or by tapping the on-screen keys) and press **Enter**. **Backspace** takes a letter back. **A guess has to be a word**: one of about 3,900 four-letter dictionary words (the ENABLE word list), so a run of letters like AEIO is turned back with *Not in the word list*, keeps what you typed so you can change it, and does not use up a guess. The secret word is always an everyday one. Each letter of a guess is scored: **green** in the right place, **yellow** in the word but somewhere else, **grey** not in it (a letter the word has once is only marked once). The keys on the keyboard take the colour of the best each has scored for you.
- **Letters you have right are filled in for you.** Once a guess has had a letter in the right place (green), the next guess puts it there by itself, shown in green, and **skips past it**: you only type the other squares, left to right, and **Enter** sends the guess once they are all filled. So after a guess with two greens, the next guess is two letters to type. (A letter that was only yellow still has to be placed by you.)
- **Your own board is shown to you.** In the arena you see your guesses, letters and all. For everyone else you see only a small grid in their colour, scored the same way (green, yellow, grey) but **with no letters**, so you can see how close they are without being given anything.
- **Winning:** everyone who finds the word wins (it counts as a win on the scoreboard). The **best** is the one who found it in the fewest guesses, then the soonest: they are the run's winner. A dead heat for that has no single winner, and alone it is a high score with no winner.
- **Time:** the run ends after 90 seconds, or as soon as everyone has found the word or used their five guesses. Someone who has not found it by then does not win. The 90 seconds are part of the game, so they apply in every lobby, whatever its time limit says.
- **Score** (the high score list): 10 points for each guess you did not need to use (so a first-guess solve is 50) plus up to 9 more for solving early in the 90 seconds. Not finding the word scores nothing.
- **Controls:** the keyboard is the controller (letters, **Enter**, **Backspace**), or tap the keys on screen. Someone who joins part way through watches and plays from the next run. When the run ends, the result card shows the word under it; alone, finding it reads "You got the word!" instead of "Nobody made it".

## Memory pattern

Watch the panels light up, then tap them back in the same order.

- **One shared board:** four coloured panels in a 2 by 2 grid, the same for everyone. The pattern is lit **one panel at a time** (about half a second each), the same for everyone.
- **Then everyone taps it back.** Tap a panel, or press **1** to **4** (top left, top right, bottom left, bottom right). A panel the pattern did not have next, **knocks you out**. Tapping before the pattern has finished being shown does nothing.
- **Time:** you get 3 seconds plus 1.2 seconds for each panel in the pattern. Anyone who has not tapped the whole pattern when it runs out is out.
- **The first pattern is 3 panels long.** Each round after it is one panel longer and starts with the same panels as the last. Everyone who got it right goes on after a short pause.
- **Last one in wins.** If everyone left is out in the same round, nobody wins. Alone it is a high score: the number of rounds you got through. There is no cap on the rounds: it goes on until it is beaten.
- **What others see of you:** only how many panels of the pattern you have got right so far (a tick when you have the lot), never which panels, and nothing lights up when someone else taps. The pattern lives on the server and only the panel being shown right now is ever sent, so nobody can read ahead.
- **Controls:** the panels are the controller, so tap or click them, or press **1-4**.

## Asteroid defence

A shooting gallery under a sky of falling asteroids, with everyone's turret in the same sky.

- **One shared sky.** Every player has a **turret at a random spot along the bottom**. The spots come from the round's seed and stay put for the whole run, so everyone sees the same layout, and nobody's turret is on top of another's.
- **Swing your gun** left and right (it can swing up to about 70 degrees either way from straight up). **It fires by itself,** twice a second, along wherever it points. Shots pass through turrets, so nobody can shoot each other.
- **Asteroids** (game covers) fall from the top and drift sideways, bouncing off the sides. **Small** ones break in 1 hit; **big** ones (with a ring round them) take 2. The shot that **breaks** one scores 1 for whoever fired it.
- **Harder as it goes:** they fall faster (from 0.2 of a screen a second, 0.012 more every second, with no top speed), appear more often (every 0.9 seconds down to every 0.35) and are big more often (3 in 20 at first, up to 1 in 2).
- **Out:** an asteroid that touches your turret breaks on it and knocks you out; your turret stays as a dim wreck, and asteroids that reach it break on it too. **Last turret standing wins.** If everyone is hit at the same moment, nobody wins. Alone it is a high score: your count when you are hit. There is no time limit of its own: it goes on until it is beaten (in a spin's waiting room the 30 second cap ends it, and the most asteroids broken wins).
- Each turret has its **points** under it, and the scoreboard shows who has the most.
- **Controls:** left and right only (**←** / **→** or **A** / **D**, or the **◀** and **▶** buttons).

## Sumo ledge

Everyone on one short platform over a drop. Shove the others off. Needs at least 2 players, so on your own a bot joins and plays against you.

- **One shared platform,** drawn side-on, with everyone standing on it. It starts about 0.8 of the screen wide and **shrinks from both ends**, about 0.02 of the screen a second from each end, down to a quarter of the screen, so a run always ends. A faint outline shows where it started.
- **Walk** left and right. You face the way you last walked.
- **Shove** (Space, ↑, **W**, or the Shove button): anyone **just in front of you** (up to about a tenth of the screen, and not behind you) is knocked away from you and slides a good way; you also lunge a little. After a shove you wait **0.7 seconds**, shown as a bar under your feet. A shove that hits nobody still costs the wait.
- **Out:** if your middle goes past either end of the platform you fall and are out: you drop off the platform and burst when you reach the bottom of the arena. **Last one on wins.** If everyone falls together it is a draw, and there is no time limit of its own: the platform keeps shrinking until someone is out.
- Nobody pushes anyone except by shoving: you walk through each other.
- **Score** is the seconds you stayed on, which is also what the high score list records. Alone against the bot that is how long you last.
- **The bot** walks toward the nearest player, backs away from the edge, and shoves late (a quarter to half a second after it is in range). It is beatable.
- **Controls:** **←** / **→** or **A** / **D** to walk, **Space**, **↑** or **W** to shove. On a phone, the buttons are laid out **◀ Shove ▶**, with the Shove button in the middle.

## Whack-a-mole

Moles pop up out of a grid of holes; tap them before they drop back down.

- **Goal:** points. Everyone plays on **the same 3 by 3 grid** and goes for the same moles.
- **Endless (no time limit):** each player has **three lives**, shown as hearts. A mole that goes down without you tapping it, a bomb you whack, and an empty hole you tap each cost a life. Moles stay up for less and come quicker for 40 seconds (1.8 seconds down to 0.35, one every 0.8 seconds down to 0.22), then it stays that hard. The last one standing wins; alone, it ends when you are out, and your points are the score. Bombs and empty holes cost a life, not points.
- **With a time limit (30 seconds):** the most points wins, a tie for the most, or scoring nothing, is a draw, and nobody is knocked out. Alone, it is a high-score round: no winner, just your points.
- **Moles** are worth 1 point, and **everyone who taps a mole while it is up scores for it**: being first does not matter. A mole stays up for its full time, so late tappers still get it, and a ring in each person's colour shows who has. A second tap on a mole you already have does nothing and costs nothing.
- **Bombs** (dark, with a fuse) pop up now and then, never two in a row (about one in six). **Each person** who taps one loses **2 points** (never below zero).
- **Missing:** tapping an empty hole costs **1 point** (never below zero), so mashing every hole does not win.
- **Pressure comes from time:** each mole stays up for less as the round goes on, from 1.8 seconds at the start to 0.45 seconds by the end, so you have to be quicker to catch it at all. A new mole appears every 0.8 seconds at the start, down to every 0.28 seconds.
- **Pauses:** every 4 to 8 moles the grid is left to empty and nothing comes up for a further 0.5 to 1.2 seconds. Which hole, which are bombs and when the pauses are comes from the round's seed, so it is the same for everyone.
- The bar along the top is the time left, and everyone's points are in the row above the grid.
- **Controls:** the grid is the controller, so tap or click a hole. On a keyboard, the number keys **1-9** match the holes like a numpad.

## Battleships

One board for everyone, with everyone's ships hidden on it. Last fleet afloat wins.

- **One shared board:** an 8 by 8 grid. At the start of a round every player's ships are hidden on it, **all on the same grid**, never overlapping (and, when there is room, never touching another player's ships; your own ships may sit next to each other). **You can see your own ships** (the blue squares) **and nobody else's**: the server sends each player their own view, so nobody is sent where anyone else's ships are.
- **Firing:** **tap a square** to fire at it. Anyone's ship on that square is hit; otherwise it is a miss. Everyone sees every shot as it lands: a miss is a dot, a hit is a cross, in the colour of whoever fired it. You cannot fire at your own ships. A hit on one of yours shows as a cross in the colour of who hit it.
- **Whose ship?** A hit does not say whose ship it was. When a ship is **sunk**, its squares go dark with a ring in its owner's colour.
- **Scoring:** a **hit** scores 1, and the shot that **sinks** a ship scores 1 more. Points are for the scoreboard; what wins is surviving.
- **Out:** when every ship of yours is sunk you are out for the round, and you keep watching (your ships are still shown to you). The **last fleet afloat wins**. There is no time limit of its own, so the round goes on until one fleet is left (in a spin's waiting room, if more than one is still afloat when the 30 second cap runs out, the one with the **most squares afloat** wins; a tie is a draw). The list on the right is everyone in the round with how many squares of their ships are afloat, and you are ringed.
- **Free space:** about 30% of the board is ship **in all, shared out between the players**, so **the more players, the fewer ships each**: two players get 10 squares of ships each, four get 5, twelve get 2. Ships are **1, 2, 3 or 4 squares long, picked at random** until each player's squares add up (so 5 squares can be one 4 and a 1, or 2, 2 and 1), a different fleet for everyone every round. A 1-square ship is sunk by a single hit, which scores the hit and the sinking bonus together.
- **A short wait after each shot** (under a second, shown as a bar under the board) so quick tapping does not decide it. A tap at a square already shot does nothing and costs nothing, and if two people shoot the same square the first shot to reach the server counts. Under the board is your own fleet by ship length, with sunk ships dimmed.
- **It needs two players:** on your own, a bot joins (see Bots above) and plays against you: it hides ships on the same board, shoots at squares (going after the ones beside its hits, and never at its own ships), and you shoot at its.
- **Controls:** the board is the controller, so tap or click. There is no keyboard control for this game yet.

## Randomness and secrets

Anything a game decides at random and players are not meant to know is a secret, and a secret must not be guessable.

- **Seeds come from a cryptographic source, never `Math.random`.** Every game builds its course from a seed. `Math.random` in Node can be worked out from a few of its outputs, and the seeds of the client-run games (Runner, Flappy, Dodge, Jump rope) are sent to every player. Someone collecting those could predict a later round: where Battleships ships are, which coins fall next. The same goes for the pick of the next game and the bots' choices.
- **A seed that is sent to players is public.** Never use it, or anything worked out from it, for something hidden. A game with hidden state keeps its own seed on the server and never puts it in a snapshot.
- **Hidden things stay on the server.** Ship positions, light timings and upcoming items are never in a snapshot (except to their owner, for ships), and must not be derivable from one.
- **Tests inject the random source** (`seedSource`), so they stay repeatable. Do not make the default `Math.random` to save a line.

The source is `secureRandom` (`packages/shared/src/lobbyGames/roundGame.ts`).

## Keeping the motion consistent

Scrolling games (Runner, Flappy, Dodge, Catch the coins, Obstacle race, Gravity flip, Laser gaps) all follow one rule so the world never slides at two speeds:

- **Everything on the course moves at the course's speed.** Obstacles, pickups and the marks on the ground (the Runner's pale ticks and accent dashes, for example) all move by the same distance every second: the speed shown in the game's own description above, in screens per second. A ground mark must never look faster or slower than the obstacles it sits under.
- **Only the faint dot grid in the background is slower**, at a quarter of the course speed, as distant parallax. It is drawn by the arena for every game; a game never adds its own.
- **A game where nothing scrolls** (Jump rope) reports a speed of 0, so the background stays still.
- **How it is kept true in code:** repeating patterns on the course use the shared `courseOffset` helper, which wraps the distance the course has travelled by the pattern's own spacing. Never scale an offset that has already been worked out (`offset * 2`): that changes the pattern's speed. The helper has a test, and `web/src/lobbyGames/README.md` lists the check a new scrolling game needs before a pull request.

(The Runner's accent dashes used to move at twice the course speed because of exactly that mistake.)

## Adding a game

Mini games are small, self-contained modules, and new ones are welcome as pull requests. See [`web/src/lobbyGames/README.md`](../web/src/lobbyGames/README.md) for how a game is built, the controls rule and the graphics standard, and file ideas with the **Mini game idea** issue template.
