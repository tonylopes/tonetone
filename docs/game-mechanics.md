# Game Mechanics & Rules

Source: [`src/game/GameState.ts`](../src/game/GameState.ts), [`src/game/Rules.ts`](../src/game/Rules.ts), [`src/game/AI.ts`](../src/game/AI.ts), [`src/game/Settings.ts`](../src/game/Settings.ts)

## Core Rules

- **Launching**: Each player has a launcher bay (`LauncherPlayer`) at the bottom (P1, `side: 1`) or top (P2, `side: -1`, rotated 180°). Aim angle (`aimDeg`, −90°..90°) and `strength` (0..1) are set via sliders, a draggable strip area, or by dragging directly on the canvas.
- **Color bonding**: When two balls of the same `kind` collide, they bond (`bonds` sets on both balls) and become part of one rigid `Group`.
- **Mismatched hits**:
  - Below the shatter threshold → `detach` peels one ball off the struck cluster.
  - At or above the shatter threshold (and the cluster has at least `PhysicsConfig.MIN_BURST` members) → `explode` bursts the whole cluster into ghost balls.
- **Special balls** (`SpecialBallType`, `Rules.drawFor`):
  - **Black** — only drawn by the player currently *ahead* in score, at twice the frequency of any single color (`2 / (COLORS + 2)`); bonds to a ball of *any* color.
  - **White** — only drawn by the player currently *behind*, at half the frequency of any single color (`1 / (2 * (COLORS + 1))`); on impact it bursts whatever cluster it strikes, then itself becomes a ghost that can chain into a second cluster.
  - Handing black to the trailer and white to the leader instead snowballed matches: the player behind at half-time won 4% of them. See [scoring.md](./scoring.md#9-special-balls-and-catch-up).
  - Both are disabled while `SPECIALS` is off, in non-two-player games, or when scores are tied/zero (see the guard in `drawFor`).
- **Ghost balls** — transient, non-bonding remnants left after a burst or a spent special ball. They carry residual velocity, can knock into solid clusters to trigger further bursts/peels (handled as `ghostHits` in `CollisionSolver.collide`), and are removed after `PhysicsConfig.GHOST_LIFE` (9s) via `ageGhosts`.
- **Ball rain**: If the on-screen ball density drops below a threshold (`isLowBallDensity`) and no manual `rainInterval` is set, `spawnRainBall` periodically drops a fresh ball at a random empty spot so idle boards stay lively; freshly spawned rain balls fade in over ~1s (`getRainBallAlpha`).

## Modes

`Game.twoPlayer` and `Game.aiOn` (set from `main.ts#setPlayers`) select between:
1. **1 Player** — single bottom launcher, `matchLen`-second (or endless) score attack.
2. **2 Players** — alternating turns between the bottom and top launcher, split by a `turnT` countdown (`turnLength`).
3. **vs AI** — same as 2-player, but player 2's aim is driven by [`AI.ts`](../src/game/AI.ts) every frame instead of input.

## Turn & Match State Machine

`GameState.ts` owns:
- `startTurns` — resets `turnIndex`/`turnT`.
- `throwBall` — validates reload cooldown, finds a clear spot near the launcher mouth (`launchSpot`), spawns the loaded ball with launch velocity, advances the 3-ball deck (`loaded`/`nextUp`/`then`), and starts the reload timer.
- The frame loop in `main.ts` decrements `turnT`; at zero it throws for the active player, flips `turnIndex` (two-player), and resets `turnT` to `turnLength(game)` (two-player) or `reloadTime` (solo/AI feed rate).
- `matchT`/`matchLen` track elapsed time; when `matchT >= matchLen` the match ends (`HUD.endMatchUI`) and freezes physics stepping until `resetField`/`startTurns` runs again for a new match.

`toCollisionState`/`syncFromCollisionState` are a thin adapter that exposes the mutable parts of `Game` as a `CollisionState` for [`CollisionSolver.stepPhysics`](./physics-engine.md) to operate on and write back into, keeping the physics module decoupled from the game/turn bookkeeping.

## Scoring (`Rules.ts` constants, applied in `CollisionSolver.award`)

Scoring pays for what a shot changed, not for the size of whatever it touched (`lockPay`, `burstPay` in `Rules.ts`):

$$\text{Lock Points} = \text{PAY\_LOCK (3)} \times \text{Balls Joined} \times \frac{1 + \text{Cluster Joined}}{2} \times \text{Black Multiplier}$$
$$\text{Burst Points} = \text{PAY\_BURST (5)} \times N \times \max(1,\ N / \text{BURST\_BONUS\_FROM (3)}) \times \text{White Multiplier}$$
$$\text{Peel Points} = \text{PAY\_PEEL (5)} \times \frac{1 + \text{Cluster Size}}{2}$$

Every event is then multiplied by $\text{SHOT\_DECAY}^k$, where k is how many events the same throw has already scored.

- **Balls joined** is the smaller side of the merge, and **cluster joined** the larger. Each ball added pays more the bigger the cluster it joins: two single balls pay 3, and one ball onto an 8-ball cluster pays 14. Earlier locks are not paid again.
- **Bursts** of more than 3 balls pay a growing per-ball bonus, so bursting a cluster pays more than building it did.
- **Peels** grow with the size of the cluster the ball was knocked off, counting that ball: 10 off a 3-ball cluster, 23 off an 8-ball cluster. They always pay less than bursting the same cluster.
- A lock made through one **black** ball pays **2×** (`PAY_BLACK`); a black ball locking onto another black ball pays **4×** (`PAY_BLACK_PAIR`).
- A burst made by a **white** ball, or by its spent ghost, pays normal points.
- **Shot decay:** every ball whose credit came from the same throw shares one `Shot` tally (`Ball.shot`). The k-th scoring event that throw causes pays `SHOT_DECAY^k`, set by the `shotdecay` knob (default 0.5).
- **Credit:**
  - A thrown ball is credited to its thrower.
  - A struck ball takes the hitter's credit and shot.
  - Burst debris carries the burster's credit.
  - Debris claims a live ball only when the debris is the one pushing.
  - A ball that comes to rest loses its credit.
- Points are tracked both in the running `score` and per-category (`lockPts`/`burstPts`/`peelPts`) for the end-of-match breakdown table (`HUD.endMatchUI`).

Who gets credited for an event, how much of the score comes from chain consequences rather than the shot, and proposals to make scoring reward intended play: see [scoring.md](./scoring.md).

## Color Palettes

`Rules.ts` maps a ball's integer `kind` to one of 6 fixed hex colors via `PALETTES` (a subset of `BALL_COLORS` selected by the "colours" tuning knob, 3–6). `colorOfKind`/`randomKind`/`toneOfKind`/`kindLabel` are the shared helpers used by spawning, rendering, and the settings panel when the palette size changes live (`SettingsModal`'s `colours` knob re-colors every existing ball in place).

## AI Opponent (`AI.ts`)

`aiAim` is called once per frame when `game.aiOn`. Each tick it:
1. Picks a target: the largest non-ghost cluster on the board (by member count), or failing that the nearest non-ghost ball to the launcher mouth, or failing that an idle angle chosen once per empty-board state (not re-randomized every frame).
2. Assigns a per-target random `strength` (0.35–1.0) the first time it acquires that target, so shots don't fluctuate mid-aim.
3. Smoothly interpolates the launcher's live `aimDeg`/`strength` 15% of the way toward the target each frame, so the aim indicator visibly sweeps rather than snapping.

## Settings Export (`Settings.ts`)

`settingsLine()` reads every tuning-panel input listed in `KNOB_IDS` plus the two derived physics thresholds (`SHATTER_SPEED`, `KICKOUT_MAX`) and serializes them into one space-delimited `key=value` string (e.g. `specials=1 colours=3 match=180 …`) for the "Copy these settings" button in the tuning panel, so a configuration can be shared as plain text.
