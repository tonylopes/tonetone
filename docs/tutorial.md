# Tutorial: Design

> **Status: design only, not implemented.** Nothing in `src/` refers to this
> document yet. Open decisions are listed in [§9](#9-open-questions).

The tutorial teaches the three rules a new player cannot guess, in about a
minute, using the real game. Everything else is left to play.

---

## Summary

1. **Three interactive steps on a scripted board: Aim, Lock, Burst.** Each one is
   a small goal the player completes with the real launcher, real physics and
   real sound. There are no slides to read before playing.
2. **The steps build on each other.** The player builds a cluster in step 2 and
   bursts that same cluster in step 3. "Build, then boom" is the lesson, and the
   player does it instead of reading about it.
3. **The tutorial never fails and never times out.** A miss just reloads. After
   a few misses a hint shows where to drag.
4. **Special balls are taught at the moment they appear.** The first time a black
   or white ball is loaded in a real match, a one-line tip appears. They are not
   part of the tutorial.
5. **Access:**
   - it is offered once, the first time the player starts any mode;
   - it can always be replayed from a new **How to play** menu item;
   - a static rules card is reachable from the pause screen during a match.

---

## 1. What the Player Must Learn, and What They Need Not

### Taught by the tutorial

| # | Mechanic | Why it cannot be left to play |
| :--- | :--- | :--- |
| 1 | **You steer; the launcher fires by itself.** Drag anywhere to aim. The distance from the launcher sets power. A ball fires every 3 s, whatever the aim is at that moment. | There is no fire button. A player waiting for one watches balls fly off in directions they never chose, and concludes the game is random. |
| 2 | **Same colours stick.** A ball that touches a ball of its own colour locks on, and the cluster moves as one body. | It is the core verb, and nothing on screen names it. |
| 3 | **A different colour, thrown hard, bursts the whole cluster.** Bigger bursts pay far more than building did. | Without it a player only builds, and the game plays as a slow puzzle instead of *Tone Boom*. |

### Learned by playing

These are left out on purpose. Each one either explains itself when it happens,
or only matters once the core loop is familiar.

| Mechanic | How the player finds it |
| :--- | :--- |
| **Peel:** a soft mismatched hit knocks one ball loose | Taught reactively in step 3 if it happens ([§3](#step-3--burst)), otherwise found in play. |
| **Ghosts:** burst debris that can burst other clusters | One sentence on step 3's success card; then seen constantly. |
| **Black and white balls** | First-time tips in real matches ([§5](#5-first-time-tips-in-real-matches)). |
| **Next-ball chips** in the bottom strip | Visible all the time; the tutorial's scripted deck makes them obviously predictive. |
| **Repeat hits pay less** (`SHOT_DECAY`) | Not mentioned. It is a balance rule, not a thing a player acts on directly. |
| **Credit:** who gets paid for caroms and debris | Not mentioned. |
| **Ball rain** | Self-evident: balls fade in when the table empties. |
| **Two players:** split screen, simultaneous fire | One line on the final card, and on the rules card. |

---

## 2. Game Facts the Design Relies On

Some of the existing docs have drifted from the code on exactly the points a
tutorial has to get right. These are the facts as the code has them on
2026-09-12. Re-check them before implementing.

| Fact | Code | Note |
| :--- | :--- | :--- |
| Every active launcher fires whenever its `reload` reaches 0, and reload is 3 s by default. In two-player mode both launchers fire **simultaneously**. | [`Frame.ts:135-141`](../src/sim/Frame.ts#L135-L141), [`GameState.ts:95-98`](../src/game/GameState.ts#L95-L98) | [`game-mechanics.md`](./game-mechanics.md) still describes alternating turns. |
| Aiming is a drag on the canvas: angle toward the touch point, power from its distance to the launcher mouth. There are no sliders in `index.html` any more. | [`LauncherBays.ts:39-45`](../src/physics/LauncherBays.ts#L39-L45), [`TouchControls.ts`](../src/ui/TouchControls.ts) | [`ui-controls.md`](./ui-controls.md) still describes sliders. |
| A ring fills around the launcher mouth while it reloads, and the aim arrow dims to 35% opacity. | [`Renderer.ts:261-302`](../src/graphics/Renderer.ts#L261-L302), [`:327`](../src/graphics/Renderer.ts#L327) | This ring is the "when does it fire" cue step 1 points at. |
| Player 1's aim arrow turns from cyan to **pink** when launch speed reaches `SHATTER_SPEED`. At default knobs that happens at `strength ≈ 0.35`, about a third of the drag range. | [`Renderer.ts:235`](../src/graphics/Renderer.ts#L235), [`:330-337`](../src/graphics/Renderer.ts#L330-L337) | It compares **launch** speed, not impact speed; see the risk in [§7](#7-risks). Player 2's arrow is always pink. |
| Match start shows a `3, 2, 1, Start!` countdown in the strip, and the first ball fires as it ends. | [`main.ts:128-142`](../src/main.ts#L128-L142), [`:283-298`](../src/main.ts#L283-L298) | |
| Same `kind`, or either ball black, bonds. A mismatched hit on a **bonded** ball bursts its cluster at or above `SHATTER_SPEED` with `MIN_BURST` (2) members, and otherwise peels it. A mismatched hit on a lone ball only knocks it. | [`CollisionSolver.ts:332-347`](../src/physics/CollisionSolver.ts#L332-L347), [`:377-383`](../src/physics/CollisionSolver.ts#L377-L383) | |
| Score pops show only `+N`. No event names are drawn. | [`CollisionSolver.ts:92`](../src/physics/CollisionSolver.ts#L92) | So the tutorial supplies the words "lock" and "burst". |
| Lock pays 3 per ball joined. A burst of N pays `5 × N × max(1, N/3)`: 4 balls pay 27, 6 pay 60. | [`Rules.ts:52-59`](../src/game/Rules.ts#L52-L59) | Building a 4-cluster from a pair pays 6; bursting it pays 27. |
| Nothing is persisted: there is no `localStorage` or Capacitor Preferences use anywhere in `src/`. | — | A "tutorial seen" flag is the first persisted value. |
| The menu has four items (Solo, 1 player, 2 players, Options), and `tests/ui/Menu.test.ts` asserts exactly that. `computeMenuLayout` sizes rows from the item count. | [`MenuScreen.ts:15-20`](../src/ui/MenuScreen.ts#L15-L20), [`:770-776`](../src/ui/MenuScreen.ts#L770-L776) | |

---

## 3. The Tutorial, Step by Step

**Target length:** 60–90 s for a player who succeeds first try. There are three
steps plus a closing card.

### Common layout

```
┌──────────────────────────────┐
│ How to play      ● ○ ○  Skip │  ← banner: title, step dots, skip
│                              │
│  Same colours stick.         │  ← one instruction, max two short lines
│  Lock one onto the pair.     │
│                              │
│           ◯◯                 │  ← scripted board, target pulsing
│                              │
│                              │
│         ╲                    │
│          ╲  aim arrow        │
│           ◉  launcher        │
├──────────────────────────────┤
│  SCORE 6    ● ●        —:—   │  ← normal strip; clock shows no time
└──────────────────────────────┘
```

- **Banner** at the top of the stage. In Solo layout that area is empty, since
  the top strip `#cue2` is hidden. The banner uses the pause and confirm card
  styling (dark glass, cyan/pink edge) so it reads as part of the game.
- **One instruction at a time**, in sentence case, never more than two lines on
  a 360 px-wide phone.
- **Target highlight:** a slow pulsing ring on the balls the step is about. The
  tutorial never names a colour ("gold", "purple"): colour names fail for
  colour-blind players. It says "same colour" and points with the ring. If
  **ball numbers** is on, the numbers show as usual.
- **The normal strip stays**, with score, loaded ball and next-ball chips, so
  the player learns the real HUD. The match clock shows `—:—`.
- **Skip** is always available. It ends the tutorial and marks it seen.

### Step 1 — Aim

| | |
| :--- | :--- |
| **Board** | One lone ball of a colour the deck never loads, placed about 40% up the field and off-centre, so a straight-up throw misses. |
| **Deck** | Any colour except the target's. |
| **Instruction** | *Drag anywhere to aim. Farther means harder.* Once the player touches: *It fires by itself when the ring fills. Hit the ball.* |
| **Goal** | The target ball is struck by a thrown ball. Detect it by the target's velocity becoming non-zero. |
| **Success** | *Nice.* A short beat, then step 2. |

**Launcher hold.** In this step only, the launcher does not start reloading
until the player's first touch. The ring is drawn empty with the banner's first
line, so the very first ball is always one the player aimed. After that the
normal 3 s cadence runs. The player has to learn that it keeps firing.

### Step 2 — Lock

| | |
| :--- | :--- |
| **Board** | A bonded pair of one colour (colour A), roughly central. Stray balls from step 1 fade out. |
| **Deck** | A, A, A. The chips show it, so the player can see more of the same is coming. |
| **Instruction** | *Same colours stick. Lock one onto the pair.* After the first lock: *Keep building. Make it four.* |
| **Goal** | The highlighted cluster reaches 4 balls. Watch `players[0].locks` and the cluster's member count. |
| **Hint text** | If the arrow is pink when a throw leaves: *Gently — a soft throw sticks better.* A hard same-colour hit still locks, but it can bounce the cluster into a wall and away. |
| **Success** | *A cluster.* Then step 3, with the cluster kept exactly where it is. |

### Step 3 — Burst

| | |
| :--- | :--- |
| **Board** | The cluster from step 2. If it did not survive, respawn a scripted 4-cluster of colour A in the same place. |
| **Deck** | B, B, B (a different colour). |
| **Instruction** | *A different colour, thrown hard, bursts the whole cluster.* Second line: *Drag farther until the arrow turns pink.* |
| **Goal** | `players[0].bursts` increases. |
| **Reactive peel lesson** | If `players[0].peels` increases first: *Too soft — that only knocked one loose. Pull farther.* If the cluster drops below 2, respawn it. |
| **Success card** | Shows the burst's own `+N` next to what building earned: *Bursting 4 paid +27. Building it paid +6. Bigger clusters pay much more.* Then, smaller: *The pieces fly off and can burst other clusters.* |

The success card reads the real numbers from `lockPts` and `burstPts`. It does
not quote a fixed figure, so it stays true if the pay table changes.

### Closing card

```
┌──────────────────────────────┐
│          You're ready        │
│                              │
│  Aim — it fires by itself    │
│  Same colours lock           │
│  Different colour, hard,     │
│  bursts                      │
│                              │
│  Most points in 3:00 wins.   │
│                              │
│  [    Play Solo    ]         │  ← primary
│  [ Play vs AI ] [ Menu ]     │
└──────────────────────────────┘
```

If the tutorial was entered from the first-play prompt ([§4](#4-how-the-player-gets-to-it)),
the primary button is **the mode they originally picked**, not Solo. They were
on their way somewhere; send them there.

### When a step is not going well

| Situation | Response |
| :--- | :--- |
| 3 throws in a step with no progress | **Hint hand:** a translucent fingertip loops a drag from the launcher to a known-good aim point for the current target. It is computed by the tutorial controller, not stored. It keeps looping until the player next touches. |
| The target was knocked into an unusable spot (a wall, the launcher mouth, off in a corner) | Fade the board and respawn the step's layout. No message. |
| Many stray balls on the board | Fade out every ball that is not part of the step's layout after each success, and whenever the count exceeds a small cap. |
| Player switches away or pauses | The existing pause overlay works as normal. |

---

## 4. How the Player Gets to It

### First time: offered, not forced

The menu is the attract screen and should stay untouched on first launch.
The offer appears at the moment of intent: the first time any of **Solo**,
**1 player** or **2 players** is tapped while the tutorial has never been seen or
skipped.

```
┌──────────────────────────────┐
│     New to Tone Boom?        │
│                              │
│  A one-minute lesson on the  │
│  three things to know.       │
│                              │
│  [   Show me   ]  [ Skip ]   │
└──────────────────────────────┘
```

- **Show me** runs the tutorial. The closing card's primary button then starts
  the mode originally tapped.
- **Skip** starts the mode immediately and marks the tutorial seen. The prompt
  never appears again.
- **For 2 players**, the prompt still appears, since two new players benefit
  most. The tutorial itself is single-seat, played on the bottom launcher.
- The prompt reuses the `confirm-card` component and its slide transition, so it
  adds no new visual language.

### Any time: a menu item

Add **How to play** to the main menu, between *2 players* and *Options*. It runs
the tutorial and the closing card offers Solo, vs AI or Menu.

- `menuItems` gains a fifth entry, and `tests/ui/Menu.test.ts` must be updated to
  expect it.
- **Check the smallest layout.** `computeMenuLayout` clamps rows to 38–50 px, and
  the menu was tuned for four. Look at a 320×568 phone in portrait before
  accepting.

### During a match: a rules card, not the tutorial

Leaving a match to run a sandbox would throw the match away. Instead the
**pause overlay** gets a small **How to play** link under *Tap anywhere to
resume*. It opens a static one-screen card:

| Row | Text |
| :--- | :--- |
| Aim | Drag to aim; farther is harder. It fires every few seconds. |
| Lock | Same colours stick together. |
| Burst | A different colour, hard (pink arrow), bursts the cluster. Bigger bursts pay more. |
| Knock loose | Too soft, and only one ball comes off. |
| Black ball | Sticks to any colour. Survives bursts. |
| White ball | Bursts whatever it touches, then its ghost can burst one more. |
| Two players | Each of you owns your half. Both launchers fire together. |

Implementation note: the pause overlay resumes on **any** click today
([`main.ts:112-118`](../src/main.ts#L112-L118)). The link must stop propagation,
and closing the rules card returns to the paused state rather than resuming.

### Persistence

- **Key:** `toneboom.tutorial = "done"`, set on completion or on Skip, whichever
  comes first.
- **Store:** `localStorage`. It works in the Capacitor WebView, and adds no
  runtime dependency; the project keeps its runtime dependencies to the native
  shims.
- **If storage is unavailable or wiped** (a private window, or iOS purging
  WebView storage under pressure), the player is simply offered the tutorial
  again. Wrap reads and writes in `try/catch`.
- **First-time tips** use the same store under their own keys ([§5](#5-first-time-tips-in-real-matches)).

---

## 5. First-Time Tips in Real Matches

The two special balls appear only once a score exists, and are drawn by score
gap ([`Rules.ts:93-123`](../src/game/Rules.ts#L93-L123)). Taught in the
tutorial, they would be forgotten by the time they show up. Taught when they
first show up, the ball is right there.

| Trigger | Tip |
| :--- | :--- |
| A **black** ball becomes `loaded` for a human player for the first time | *Black sticks to any colour — and survives bursts.* |
| A **white** ball becomes `loaded` for a human player for the first time | *White bursts whatever it hits.* |

- **Placement:** a small toast just above that player's launcher, with an arrow
  pointing at the loaded ball. For player 2 in split screen it is rotated 180°,
  as their pops are.
- **It does not pause the game.** It stays until that ball is thrown, plus 1.5 s.
- **Once per device per tip**, keyed `toneboom.tip.black` and `toneboom.tip.white`.
- **No tips for the AI's deck.**

---

## 6. How It Is Built

This section is guidance for the implementer. It is not a finished plan.

### Structure

- **A tutorial controller** in `src/ui/Tutorial.ts` owns the step state. Each
  frame it reads game state and edits it: deck, board and reload. It never
  steps physics itself.
- **The game loop is not copied.** `main.ts` keeps calling `advanceFrame` exactly
  as now. The controller runs beside it, before and after that call, the same
  way the countdown and results effects already do. A tutorial with its own
  loop would teach a game that does not ship (see CLAUDE.md).
- **Scripted board.** A small layout description per step: ball positions as
  fractions of the field, a `kind` per ball, and which balls start bonded. The
  controller spawns it through `spawn`, then bonds the pairs. Fractions keep a
  layout valid across phone portrait, tablet and desktop.
- **Scripted deck.** After each throw the controller overwrites
  `loaded`/`nextUp`/`then` for player 1. `drawFor` is not modified, so the
  normal game's draw is untouched.
- **Progress detection** reads counters the solver already maintains
  (`locks`, `bursts`, `peels`, `lockPts`, `burstPts`), plus the target group's
  member count. No new event hooks are needed in `src/physics/`.

### Game settings during the tutorial

A player who has moved sliders in Options could make a step impossible. With
**burst at** at 100%, the arrow never turns pink.

- **On entry**, `snapshotConfig`, then force these defaults: `colours` 3,
  `specials` off, `minburst` 2, `burst` 0.4, rain off, reload 3 s, and no match
  clock.
- **On exit**, however the tutorial is left, `restoreConfig`, including the
  `index.html` slider values.

### Verification

The tutorial changes no physics or rules, so `npm run sim:baseline` must show
**no diff**. A diff means the scripted deck or board has leaked into normal play.

Add a solvability test (`tests/ui/Tutorial.test.ts`) that runs each step headlessly:

- **Load the step's layout** at 380×620, 768×1024 and 1280×720.
- **Sweep aim angle and strength** on a grid, stepping with `advanceFrame` until
  rest.
- **Assert that a success window exists** and is at least a few degrees wide.
  Report its width.
- **Check the hint:** assert that the hint hand's computed aim point lies inside
  the window.

That test is what keeps a later tuning change from silently making step 3 unwinnable.

---

## 7. Risks

| Risk | Detail | Mitigation |
| :--- | :--- | :--- |
| **"Pink means burst" is only approximately true.** | The arrow compares **launch** speed to `SHATTER_SPEED`. The ball loses speed rolling (`DRAG` 0.45 per second), so a far target needs more than just-pink. **Not measured.** | The step 3 layout places the cluster close enough that a just-pink throw still bursts. The solvability test asserts it: the minimum pink strength must succeed. If it cannot, the instruction becomes *Drag well past pink.* |
| **The 3 s cadence may rush reading.** | New players read the banner while balls keep firing. | The step 1 launcher hold; instructions of two lines at most. Watch real first-time players before changing the reload. |
| **Player 2's arrow is always pink.** | "Arrow turns pink" is untrue for the top seat in 2-player mode. The tutorial is bottom-seat only, so it is not wrong there, but the rules card says it. | Either word the rules card "pink arrow (bottom player)", or give player 2 a distinct burst colour. See [§9](#9-open-questions). |
| **Five menu items on a small phone.** | Untested layout. | Check at 320×568 before merging. |

---

## 8. Out of Scope

- Voice-over, video or animated story intros.
- A tutorial for the Options/tuning panel.
- Teaching scoring detail beyond "bigger bursts pay more".
- Achievements or rewards for completing it.
- A two-seat tutorial.

---

## 9. Open Questions

1. **Offer on first play, or auto-start on first launch?** This design offers it
   at first mode selection, so the menu stays the first impression. Auto-start
   reaches more players but delays the menu.
2. **Menu label:** *How to play* or *Tutorial*? *How to play* also fits the
   rules card, so one label covers both entry points.
3. **Player 2's burst cue.** Give the top seat's arrow a distinct burst state, or
   accept the inconsistency and word around it?
4. **First-time tips for black and white:** include them, or leave specials to
   discovery entirely?
