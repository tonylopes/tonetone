# Physics & Rigid-Body Engine

Source: [`src/physics/Types.ts`](../src/physics/Types.ts), [`src/physics/Config.ts`](../src/physics/Config.ts), [`src/physics/RigidBody.ts`](../src/physics/RigidBody.ts), [`src/physics/CollisionSolver.ts`](../src/physics/CollisionSolver.ts), [`src/physics/LauncherBays.ts`](../src/physics/LauncherBays.ts)

A custom 2D rigid-body engine simulates every ball and bonded cluster from scratch — no physics library is used.

## Data Model (`Types.ts`)

- **`Ball`** — position, `kind` (color index), `special` (`'black' | 'white' | null'`), `color`, `credit` (which player is currently responsible for it, for scoring attribution), `bonds` (a `Set<number>` of bonded ball ids), and a back-reference to its `group`. Transient fields (`ghost`, `age`, `pure`, `exempt`, `rainTime`, `_vx/_vy/_av/_pg`) drive ghost lifetime, launcher-bay exemption on spawn, rain fade-in, and the velocity handoff during `rebuildGroups`.
- **`Group`** — a rigid body: `members`, per-member `offsets` from the center of mass, `com`, orientation `ang`, angular velocity `av`, linear velocity `vx`/`vy`, `mass` (member count), `inertia`, and a display `color` (set only for multi-member groups).
- **`LauncherPlayer`** — per-player launcher state: `side` (±1), `aimDeg`, `strength`, the 3-ball deck (`loaded`/`nextUp`/`then`), `reload` cooldown, and running score/stat counters.

## Config (`Config.ts`)

`PhysicsConfig` is a single mutable object holding every tunable (ball radius `R`, drag, restitution, throw speed range, burst/kickout fractions, speed caps, ghost lifetime, etc.) — the tuning panel (`ui/SettingsModal.ts`) writes directly into this object for live reload.

`recalcThresholds(height)` derives two screen-scale-dependent thresholds whenever the viewport resizes or a relevant knob changes:
- `SHATTER_SPEED` — the impact speed above which a mismatched hit bursts a cluster instead of peeling one ball.
- `KICKOUT_MAX` — the ceiling on ejection speed for peeled/burst balls.

`chainPercent()` reports where `SHATTER_SPEED` sits within the `[KICKOUT_MIN, KICKOUT_MAX]` band, as a percentage, purely for the tuning panel's "breakout / chain" readout.

## Rigid Bodies (`RigidBody.ts`)

- **`makeGroup(members, vx, vy)`** — computes the center of mass, per-member offsets, and moment of inertia:
  $$\mathbf{r}_{\text{com}} = \frac{1}{N}\sum \mathbf{r}_i \qquad I = \sum_i \left(o_{i,x}^2 + o_{i,y}^2 + \frac{R^2}{2}\right)$$
  (the `R²/2` term is each ball's own disc inertia, added to its point-mass contribution about the group's COM).
- **`syncGroup` / `shiftGroup`** — re-derive member positions from `(com, ang)`, or translate a whole group rigidly.
- **`rebuildGroups(balls, byId)`** — the core "what's connected to what" step. It first snapshots each existing group's linear/angular velocity onto its members (`_vx/_vy/_av`), then does a DFS over the `bonds` graph to find connected components, builds a fresh `Group` for each, and **redistributes momentum** into the new group's `vx/vy/av` by mass/angular-momentum-weighted averaging of the members' prior velocities — this is what makes a burst/peel/bond feel physically continuous rather than resetting velocity to zero. Called after every bond, break, burst, or ghost expiry.
- **`clampWalls`** — pushes a group back inside `[0,width]×[0,height]` (a hard safety clamp; `resolveWalls` in the solver handles actual bounce).
- **`separateGroups(A, B, nx, ny)`** — before two clusters are allowed to bond, this computes, via an interval-sweep over every member-pair overlap window along the collision normal, the minimum separation needed so no two balls end up overlapping post-bond; if that separation exceeds `2R` it refuses the bond (returns `false`) rather than teleporting the clusters apart visibly.

## Collision Solver (`CollisionSolver.ts`)

### Broadphase (`forEachPair`)
A uniform spatial hash keyed by `⌊x/cell⌋,⌊y/cell⌋` with `cell = 2R + 2`. For each occupied cell it only checks the cell itself plus 4 forward-neighbor offsets (`[0,1],[1,-1],[1,0],[1,1]`), which visits every unordered pair exactly once in expected `O(N)` time for a roughly uniform ball density.

### Narrowphase (`collide`)
For every candidate pair in different groups (same-group pairs are already rigidly connected and skipped):
1. Skip pairs where either ball is a freshly-rained ball still in its brief `rainTime > 0` fade-in window, so it doesn't collide the instant it appears.
2. Compute the contact normal and each group's point-velocity at the contact (linear + `ω × r`), then the relative normal velocity. Positive (separating) pairs are skipped.
3. Solve the classic angular impulse equation and apply it to both groups:
   $$j = \frac{-(1+e)\,v_{\text{rel},n}}{\frac{1}{m_A}+\frac{1}{m_B}+\frac{(\mathbf r_A\times\mathbf n)^2}{I_A}+\frac{(\mathbf r_B\times\mathbf n)^2}{I_B}}$$
4. **Ghost pairs** (exactly one ball is a ghost) are routed to `ghostHits` instead of the bond/break logic below — they only ever cause a *second* burst/peel on the struck cluster.
5. Hits below `RULE_SPEED` (a resting-contact threshold) don't trigger gameplay effects, just the impulse. A per-pair 0.2s debounce (`lastHit`) avoids re-triggering bond/break logic every physics substep while two clusters are still touching.
6. **White-ball hits** are diverted to `whiteHits` (they always burst the target, never bond/detach).
7. Otherwise: same `kind` (or either ball is `black`) → queued as a `bonds` candidate; a mismatched hit on an already-bonded ball → queued as a `breaks` candidate (further split into `explode` vs `detach` by impact speed and `MIN_BURST`); a mismatched hit on two loose singles → just a `knocks` sound event.

All queued bonds/breaks/ghostHits/whiteHits are then resolved in batches (bonds first, so a burst never fires against a pair that just got absorbed into a bigger, safer-to-bond cluster) — `award()` pushes score deltas and floating `+N` pop-text, `explode()`/`detach()` reassign group membership via `rebuildGroups` and fire the matching audio voice.

### Wall & Launcher-Bay Collision
`resolveWalls(g, width, height)` finds the single deepest-penetrating member against the four screen edges and resolves it with the same angular-impulse math (using `REST_WALL`). `LauncherBays.mouthCollide`/`mouthClamp` do the equivalent for the circular "keep-out" dome around each launcher mouth (radius `mouthRadius() + R`), so resting balls are pushed clear of the spawn point and freshly-launched balls (marked `exempt` for ~1.6s) can pass through it once without bouncing off their own launcher.

### Position Relaxation (`relax`)
After the impulse pass, `relax` runs up to 24 iterations of pairwise overlap correction (Gauss-Seidel style, using each group's mass as inverse weight) plus a wall/bay re-clamp each iteration, stopping early once nothing moved. This is what keeps large stacked clusters from visually interpenetrating without injecting extra velocity.

### Main Step (`stepPhysics`)
Per physics substep, in order: exponential drag decay + stop/speed-cap clamping → integrate `com`/`ang` (or straight-line translate if not spinning) → wall/bay collision → `collide` → `relax(24)` → rain-ball fade timers → `ageGhosts` (expires ghosts past `GHOST_LIFE`, prunes the `lastHit` debounce map once it grows past 150/500 entries) → age out flash ripples and score pops.

`main.ts` chooses the substep count adaptively each frame (`sub = clamp(2, 8, ceil(fastest_speed * dt / (R*0.3)))`) so fast-moving balls still get enough substeps to avoid tunneling through walls or other clusters.

## Launcher Bays (`LauncherBays.ts`)

- `launchPointOf` — the fixed mouth position for a player (`side > 0` → bottom-center inset by `bayInset()`; `side < 0` → top-center).
- `aimDirOf`/`aimAt` — convert between a launcher's `aimDeg`/`strength` and a world-space aim direction/drag distance; `aimAt` is what both the draggable slider strips and direct canvas-touch aiming call into.
- `throwSpeedOf` — maps `strength` through a power curve (`POWER_CURVE = 1.8`) onto the `[THROW_MIN, THROW_MAX]` range, then scales by `DUEL_POWER` and the screen-size factor `SC`.
- `mouthNormalAt`/`mouthClamp`/`mouthCollide` — the launcher-bay keep-out dome described above.
- `clearExempt` — decays each spawned ball's brief `exempt` window (used so a just-launched ball doesn't immediately bounce off its own launcher mouth) and clears it early once the ball has actually left the dome.
