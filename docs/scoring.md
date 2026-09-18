# Scoring: How Points Are Earned, and How Much of It Is Chaos

Source: [`src/physics/CollisionSolver.ts`](../src/physics/CollisionSolver.ts) (`award`, `collide`, `explode`, `detach`), [`src/game/Rules.ts`](../src/game/Rules.ts) (pay constants, `drawFor`), [`src/game/GameState.ts`](../src/game/GameState.ts) (`throwBall`)

The short reference for the pay table lives in [game-mechanics.md](./game-mechanics.md#scoring-rulests-constants-applied-in-collisionsolveraward). This document goes deeper. It covers who gets paid for what, where consequences stop being connected to the shot that caused them, how much of the score comes from those consequences, and which rule changes would make the score reward intended play.

> **Status: applied on 2026-09-12.**
> - Proposals P1–P4 are in the game.
> - P5 is applied in part: black locks now pay per ball joined.
> - §1–§5 describe and measure the rules **before** that change.
> - [§8](#8-after-the-change) has the before/after measurements and what is still open.

**Measured against:** the build of 2026-09-12 before the scoring change, with `PAY_BLACK = 4` and black drawn at `2 / (COLORS + 2)`. Field 380×620, default knobs, 3 colours, 180 s matches. 30 seeds per configuration; duels ran 30 per seat, so 60 matches.

---

## Summary

1. **About 42% of points in a default duel come from consequences rather than from the thrown ball.** 21.5% arrive through contact caroms, 17.8% through burst debris, and 2.5% from balls that had already stopped. The other 58% is the thrown ball itself, which can roll for up to about 9 seconds.
2. **The biggest chaos channel is multiplicity: one throw scoring many times.** Against a solo score attack, **random aim outscores every aimed policy we tested.** Random scores 3382 ±179, against 2072 ±60 for the colour-aware builder and 1441 ±30 for the greedy planner. 85% of random's points come from a throw's second or later scoring event.
3. **Locks pay for whole clusters, not for shots.** Locks are 88% of all points with specials on. Black-ball locks are 84% of lock points, and about 77% of lock points pay for balls that were already bonded. Only about 44% of lock points are for balls the scorer threw.
4. **Burst debris re-credits every live ball it touches, regardless of direction.** That accounts for 18% of all points. 7.4% of all points were taken this way from a ball the opponent held credit on.
5. **Tightening attribution alone does not help intended play.** Expiring stale credit, removing debris credit, or halving chain payouts leaves the solo ranking unchanged. Removing debris credit makes the deliberate planner *lose* to `engine-ai`: 25% wins instead of 58%.
6. **Per-throw diminishing returns is the one change that makes intended play win.** It is the only single rule that flips the solo ranking. Combined with paying for what a shot changed, the builder beats random in solo by d = 3.2, and the planner beats `engine-ai` in 88% of duels.
7. **Between equal players the result is close to a coin flip, and no scoring rule changes that.** A 0.06° aim nudge flips the winner in 33 ±9% of matches, under every rule tested. Scoring cannot remove physical chaos. Its job is to make the better player win more often.

---

## 1. How Scoring Works

### Who gets the credit

Every ball carries `credit`, a player index or `-1`. Points go to whatever `credit` the *hitting* ball carries at the moment of the event.

| Rule | Code |
| :--- | :--- |
| A thrown ball is credited to its thrower. Rack balls and rain balls start at `-1`. | [`GameState.ts:308`](../src/game/GameState.ts#L308), [`:232`](../src/game/GameState.ts#L232) |
| On a qualifying contact between two live balls, the ball pushing harder along the normal is the hitter. The struck ball takes the hitter's credit if the hitter has one. **Credit never expires.** | [`CollisionSolver.ts:310-312`](../src/physics/CollisionSolver.ts#L310-L312) |
| When debris touches a live ball, the live ball takes the debris's credit **unconditionally**: no speed threshold, no cooldown, no check of who moved into whom. | [`CollisionSolver.ts:296-303`](../src/physics/CollisionSolver.ts#L296-L303) |
| Every ball destroyed in a burst becomes debris credited to the burster. | [`CollisionSolver.ts:117`](../src/physics/CollisionSolver.ts#L117) |
| A lock pays the hitter's credit at detection. A break pays the hitter. A debris burst pays the debris. A white burst pays the white ball. | [`:324`](../src/physics/CollisionSolver.ts#L324), [`:328`](../src/physics/CollisionSolver.ts#L328), [`:389`](../src/physics/CollisionSolver.ts#L389), [`:370`](../src/physics/CollisionSolver.ts#L370) |

A ball struck at t = 10 s still pays its striker at t = 60 s if something else sets it moving into a cluster.

### What each event pays

| Event | Pays | Code |
| :--- | :--- | :--- |
| **Lock:** same colour, or via a black ball | `3 × size of the merged cluster`, `×4` via black | [`:350-355`](../src/physics/CollisionSolver.ts#L350-L355) |
| **Burst:** mismatched hit at or above `SHATTER_SPEED` into `MIN_BURST`+ balls | `5 × balls destroyed` (black survivors excluded), `×0.5` for white | [`:108`](../src/physics/CollisionSolver.ts#L108) |
| **Peel:** mismatched hit below the burst conditions | `2 × cluster size before the ball leaves` | [`:162`](../src/physics/CollisionSolver.ts#L162) |
| Peel caused by debris | nothing, but the live ball already took the debris's credit | [`:390`](../src/physics/CollisionSolver.ts#L390) |

Three consequences of this pay table:

- **Building is quadratic, bursting is linear.** Building an 8-ball cluster one ball at a time pays `3 × (2+3+…+8) = 105`, and bursting it pays `40`. Every lock re-pays every ball already in the cluster.
- **A peel on a big cluster outpays a burst of a small one.** A weak, failed hit on a 10-ball cluster pays 20, the same as bursting 4 balls.
- **Bonds formed in the same substep each pay the cluster size at that moment,** so the payout depends on the order the pairs were found.

### Special balls and the score gap

`drawFor` ([`Rules.ts:62-92`](../src/game/Rules.ts#L62-L92)) hands special balls out by score gap:

- In a duel, the trailing player draws **black 40%** of the time at 3 colours. The leader draws **white 12.5%**. Both players need a score above zero and scores must differ.
- In solo, specials are **on** once the score is above zero. Each draw flips a coin between the black branch (40%) and the white branch (12.5%), so about 20% of draws are black. (`game-mechanics.md` says specials are off outside two-player games. The code and the measurements below say otherwise.)

Black bonds to any colour and survives bursts, and its ×4 multiplies the *whole* cluster size. Scores feed the draw, and the draw feeds the scores. Any chaotic swing in score changes who gets the most valuable ball in the game.

---

## 2. Where Consequences Detach From the Shot

| Channel | Mechanism | Code |
| :--- | :--- | :--- |
| **One throw, many events** | A full-power throw leaves at 3200 px/s and, at `DRAG` 0.45, rolls for up to about 9 s before it parks. Every same-colour contact along the way is a lock, and every mismatched bonded contact is a peel or burst. | [`Config.ts`](../src/physics/Config.ts), [`LauncherBays.ts:47-54`](../src/physics/LauncherBays.ts#L47-L54) |
| **Credit spreads by contact** | Credit hops ball to ball and never expires. Whoever touched a ball last owns everything it does next. | [`:310-312`](../src/physics/CollisionSolver.ts#L310-L312) |
| **Debris re-credits live balls** | Unconditional, and blind to direction. A live ball the opponent just threw is re-credited by rolling through your debris. | [`:299`](../src/physics/CollisionSolver.ts#L299) |
| **Random debris and peel directions** | Debris leaves at a uniformly random angle, and 10% of it is not speed-capped. A peeled ball flies off at a random angle carrying the hitter's credit. | [`:144-155`](../src/physics/CollisionSolver.ts#L144-L155), [`:174`](../src/physics/CollisionSolver.ts#L174) |
| **Cluster-size multipliers** | Locks and peels pay for the size of whatever cluster was touched, not for what the shot changed. | [`:355`](../src/physics/CollisionSolver.ts#L355), [`:162`](../src/physics/CollisionSolver.ts#L162) |
| **Spent white ghost** | Bursts any group it touches, singletons included, ignoring `MIN_BURST` and speed. | [`:386-389`](../src/physics/CollisionSolver.ts#L386-L389) |
| **Black feedback loop** | ×4 on cluster size, handed 40% of the time to whoever is behind. | [`Rules.ts:81-88`](../src/game/Rules.ts#L81-L88) |

---

## 3. Method

### Attribution probe

A probe script wrapped `runSim` without changing any game code:

- **Lineage tokens.** Every thrown ball's `credit` carried a lineage token in its fractional part (`player + id / 1e7`). The solver only ever tests `credit >= 0` and uses it to index `players`, so the token passes through the game logic untouched.
- **Decoding at award time.** A `Proxy` on `game.players` decoded the token at the exact moment `award` paid out.
- **Tracking transfers.** An accessor on `ball.credit` caught every transfer and recorded its kind: contact, debris spawn, or debris contact.
- **Detecting rest.** Each frame, the probe noted any ball whose group had come to rest (`vx = vy = 0`).

**Exactness.** The probe was checked against plain runs. On the same seeds, final scores, bursts, balls destroyed and throws were identical. Probe events summed to the scoreboard. No award went unattributed.

Each scoring event is classified by its credit chain:

| Class | Meaning |
| :--- | :--- |
| **direct** | The thrown ball itself scored, and it had never stopped. |
| **carom** | Credit reached the scoring ball through one or more live contacts; nothing in the chain had stopped. |
| **chain** | Debris is in the chain: debris burst a cluster, or re-credited a live ball that then scored. |
| **stale** | Some ball in the chain had come to a complete stop before passing credit on or scoring. Something other than the throw restarted it. |

"Direct" is not the same as "deliberate". A thrown ball that bounces off three rails and locks 6 s later is still direct.

### Policies

These are proxies for a player, and each has limits worth naming:

| Policy | What it does | Limit |
| :--- | :--- | :--- |
| `engine-ai` | The shipped AI: aims at the biggest cluster at a random power. | Ignores the loaded colour and never checks the line. |
| `random` | Random aim and power on every throw. | The no-intent baseline. |
| `fixed` | Straight up the middle at 0.55 power. | Never adapts. |
| `planner` (scratch) | Colour-aware and greedy. Locks the loaded colour softly onto the most valuable matching cluster, or bursts the most valuable mismatched cluster at full power. Prefers clear lines. | Bursts every mismatched pair (`MIN_BURST` = 2), so it destroys clusters as soon as they form. |
| `builder` (scratch) | Same as the planner, but only bursts clusters of 5+ and otherwise grows clusters. | Greedy, no bank shots, no power finesse. |

None of these is a human. The planner and builder are the closest to what the game is designed to reward: colour-aware building and deliberate bursting.

### Re-scoring the same matches

Physics does not read the score, except through the special-ball draw. **With `specials=0`, re-scoring a match's event log under a different pay rule is exact:** the same matches, paid differently. All skill comparisons below are specials-off for that reason. With specials on, re-scored shares are approximate.

The `incr-lock` rule uses cluster sizes captured at contact detection, before earlier bonds in the same substep merge. That is a close but not exact estimate of the balls a lock joined.

---

## 4. Findings

Values are `mean ± standard error`. Differences inside 2× their error are reported as noise.

### 4.1 Where points come from

| | duel, specials on | duel, specials off | solo `engine-ai`, specials on | solo planner, specials on |
| :--- | ---: | ---: | ---: | ---: |
| total points / match | 9138 ±419 | 2933 ±41 | 5698 ±307 | 3863 ±149 |
| **direct** | 58.2 ±1.4% | 43.9 ±0.6% | 54.0 ±1.4% | 56.6 ±1.1% |
| **carom** | 21.5 ±1.0% | 34.9 ±0.7% | 23.9 ±1.2% | 14.4 ±0.8% |
| **chain** | 17.8 ±0.8% | 19.4 ±0.4% | 14.6 ±0.8% | 20.7 ±1.1% |
| **stale** | 2.5 ±0.3% | 1.9 ±0.2% | 7.5 ±0.8% | 8.3 ±0.9% |
| lock points | 88.4 ±0.5% | 60.1 ±0.3% | 87.2 ±0.6% | 86.2 ±0.6% |
| burst points | 7.9 ±0.3% | 25.8 ±0.3% | 7.3 ±0.4% | 10.5 ±0.5% |
| peel points | 3.7 ±0.2% | 14.1 ±0.3% | 5.4 ±0.3% | 3.3 ±0.2% |
| top 10% of events carry | 38.8 ±0.5% | 24.0 ±0.3% | 41.0 ±0.6% | 39.3 ±0.8% |

Share of points by time since the throw that started the chain:

| age | duel, specials on | duel, specials off | solo, specials on |
| :--- | ---: | ---: | ---: |
| < 1 s | 74.7 ±1.1% | 72.7 ±0.5% | 67.2 ±1.0% |
| 1–3 s | 11.0 ±0.7% | 17.7 ±0.5% | 11.8 ±0.6% |
| 3–9 s | 11.6 ±0.7% | 8.3 ±0.4% | 12.2 ±1.0% |
| ≥ 9 s | 2.7 ±0.3% | 1.2 ±0.2% | 8.8 ±0.9% |

Specials roughly triple the score economy: 9138 against 2933 points per match. They turn the game into a lock game, and they concentrate points into fewer, larger events.

### 4.2 "Chain" points are debris re-crediting live balls

| | duel, specials on | duel, specials off |
| :--- | ---: | ---: |
| debris re-credited a live ball that then scored | 18.2 ±0.9% | 18.8 ±0.4% |
| debris burst a cluster directly | 0.6 ±0.0% | 1.2 ±0.1% |
| debris took credit off a ball the opponent held | 7.4 ±0.6% | 7.6 ±0.3% |

Chain *bursts* are rare. The chain effect that matters is debris flying at random angles, taking ownership of live balls, and those balls then locking.

### 4.3 Locks pay for clusters, and often for the opponent's balls

| | duel, specials on | duel, specials off |
| :--- | ---: | ---: |
| lock points made via black | 83.7 ±0.7% | — |
| lock points into clusters of 6+ | 58.0 ±2.6% | 11.0 ±1.0% |
| lock points paid for balls already bonded (approx.) | 77.0 ±0.8% | 62.6 ±0.3% |
| lock points for balls the **opponent** threw | 35.8 ±0.8% | 27.8 ±0.5% |
| lock points for rack and rain balls | 20.6 ±1.2% | 33.1 ±0.9% |

With specials on, black-ball locks carry 79.2 ±1.3% of solo lock points too.

### 4.4 In solo, random aim outscores intended play

Solo score attack, specials off, 30 seeds per policy:

| | planner | builder | `engine-ai` | fixed | random |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **score** | 1441 ±30 | 2072 ±60 | 2120 ±64 | 2387 ±135 | **3382 ±179** |
| scoring events / match | 158 ±3 | 211 ±6 | 231 ±6 | 266 ±13 | 339 ±14 |
| points from a throw's 2nd+ event | 51.7 ±1.0% | 61.6 ±1.1% | 66.5 ±0.8% | 84.4 ±0.9% | 85.0 ±0.7% |
| direct | 52.7 ±1.0% | 42.3 ±1.2% | 38.3 ±0.8% | 16.4 ±0.9% | 17.9 ±0.8% |
| stale | 3.4 ±0.4% | 13.4 ±0.8% | 7.3 ±0.7% | 18.0 ±1.0% | 23.3 ±1.8% |
| bursts / match | 33.1 ±0.5 | 14.2 ±0.4 | 25.8 ±0.6 | 8.4 ±0.3 | 12.7 ±0.6 |

Random scores 1.6× the builder and 2.3× the planner; both differences are well outside the noise. The mechanism is structural:

- A randomly aimed ball, often sent sideways at high power, rolls for seconds and touches many balls.
- With three colours, roughly a third of those contacts bond. Each lock pays the whole cluster, and each peel pays the whole cluster.
- A deliberate soft lock shot scores once and stops. Nothing in the pay table rewards precision over volume.

### 4.5 In a duel, cluster-building is harvested

Duels, specials off, both seats:

| matchup | aimed player's share | aimed player wins | margin |
| :--- | ---: | ---: | ---: |
| `engine-ai` vs random | 64.3 ±0.6% | 100% | +1012 ±42 |
| planner vs random | 62.6 ±0.6% | 100% | +667 ±33 |
| planner vs `engine-ai` | 50.5 ±0.6% | 58.3 ±6.4% | +24 ±29, inside the noise |
| builder vs random | 52.1 ±0.7% | 60.0 ±6.4% | +161 ±60 |
| builder vs `engine-ai` | 37.6 ±0.5% | **0%** | −809 ±37 |

Deliberate play beats random aim in a duel. Building clusters, though, is punished: 28–36% of lock points are paid for balls the *opponent* threw (§4.3), and an opponent who keeps bursting and locking the biggest cluster collects them. A colour-aware greedy player is only level with the colour-blind shipped AI.

### 4.6 The chaos horizon

**Twin test:** 30 duel seeds (`engine-ai` against `engine-ai`, specials off), each run twice. The only difference is player 1's aim, nudged by about 0.06°.

- The first scoring event that differs arrives at **3.8 ±0.1 s**, the second throw.
- The final margin changes by an RMS of 279 points, against a between-seed standard deviation of 232. That ratio of 0.85 means the margin is almost fully decorrelated from the nudge.
- **The winner flips in 33 ±9% of matches.** Under every re-scoring rule in §5 the flip rate stays between 30% and 43% (±9%), inside the noise.

Between equal players, the result is set by physical chaos within one throw. Pay rules cannot change that. What they can change is how reliably the *better* player wins, which is what §5 measures.

### 4.7 Lead volatility

Duel, `engine-ai` against `engine-ai`:

| | specials on | specials off |
| :--- | ---: | ---: |
| lead changes / match | 12.0 ±1.5 | 6.5 ±1.3 |
| leader at 150 s went on to lose | 20 ±7% | 13 ±6% |

Specials nearly double lead changes (+5.5 ±2.0). The late-comeback rate difference is inside the noise.

---

## 5. Re-scoring the Same Matches

Each rule below re-pays the exact same specials-off matches:

| Rule | Change |
| :--- | :--- |
| `no-stale` | A ball's credit clears when it comes to rest. |
| `window-3s` | Credit lapses 3 s after the throw that started the chain. |
| `no-ghost-paint` | Debris no longer re-credits live balls; debris bursts still pay. |
| `chain-half` | Each debris hop in the chain halves the payout. |
| `carom<=1` | Credit survives at most one contact hop. |
| `incr-lock` | A lock pays `3 ×` the balls it joined, not the merged size. |
| `burst-superlinear` | A burst pays `5 × N × max(1, N/3)`. |
| `peel-flat` | A peel pays 2 flat. |
| `throw-decay` | The k-th scoring event from the same throw pays `× 0.5^k`. |
| **A** | `no-stale` + `no-ghost-paint` + `chain-half` (attribution only) |
| **B** | A + `incr-lock` |
| **C** | B + `burst-superlinear` + `peel-flat` (attribution plus economy) |
| **D** | C + `throw-decay` |

**Reading the table.** `d` is the standardized difference (Cohen's d). Positive means the first policy scored more. A verdict of `noise` means the gap is inside 2× its standard error. Win columns are the first-named policy's win rate over 60 duels.

| rule | points kept (duel) | solo: planner − random, d | solo: builder − random, d | planner vs `engine-ai` wins | builder vs `engine-ai` wins | builder vs random wins |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| current | 100% | −2.77 | −1.80 | 58.3 ±6.4% | 0% | 60.0 ±6.4% |
| no-stale | 98.1 ±0.2% | −2.99 | −1.85 | 56.7 ±6.5% | 0% | 63.3 ±6.3% |
| window-3s | 90.5 ±0.5% | −2.96 | −1.85 | 64.2 ±6.2% | 0% | 70.0 ±6.0% |
| no-ghost-paint | 81.2 ±0.4% | −2.85 | −1.80 | **25.0 ±5.6%** | 0% | 43.3 ±6.5% |
| chain-half | 85.2 ±0.3% | −2.83 | −1.81 | 30.0 ±6.0% | 0% | 50.0 ±6.5% |
| carom<=1 | 75.9 ±0.6% | −1.66 | −0.29 (noise) | 80.0 ±5.2% | 1.7 ±1.7% | 90.0 ±3.9% |
| incr-lock | 62.4 ±0.3% | −2.74 | −1.98 | 71.7 ±5.9% | 0% | 57.5 ±6.4% |
| burst-superlinear | 109.5 ±0.5% | −2.75 | −1.54 | 63.3 ±6.3% | 1.7 ±1.7% | 75.0 ±5.6% |
| peel-flat | 91.1 ±0.2% | −2.67 | −1.63 | 66.7 ±6.1% | 0% | 66.7 ±6.1% |
| **A** | 79.4 ±0.4% | −3.52 | −2.16 | 23.3 ±5.5% | 0% | 40.8 ±6.3% |
| **B** | 51.1 ±0.3% | −3.13 | −2.51 | 53.3 ±6.5% | 0% | 40.0 ±6.4% |
| **C** | 53.6 ±0.5% | −1.00 | +0.29 (noise) | 76.7 ±5.5% | 5.0 ±2.8% | 98.3 ±1.7% |
| **throw-decay** | 54.6 ±0.5% | **+0.57** | **+2.19** | 86.7 ±4.4% | 1.7 ±1.7% | 100% |
| **D** | 40.7 ±0.7% | **+2.32** | **+3.18** | 88.3 ±4.2% | 28.3 ±5.9% | 98.3 ±1.7% |

Solo scores under D: builder 803 ±19, planner 693 ±16, `engine-ai` 736 ±22, random 477 ±18, fixed 337 ±24.

Points mix in the duel, specials off:

| | lock | burst | peel |
| :--- | ---: | ---: | ---: |
| current | 60.1% | 25.8% | 14.1% |
| C | 30.0% | 63.1% | 6.9% |
| D | 20.3% | 76.1% | 3.5% |

What the table says:

- **Cleaning up attribution does not reward intended play.** `no-stale`, `window-3s` and A leave the solo ranking where it was. Stale credit is only 2–8% of points; clearing it is a fairness and legibility fix, not a balance lever.
- **Debris credit is partly earned.** A deliberate burst is what creates the debris, so removing debris credit hurts the player who bursts on purpose: planner wins against `engine-ai` fall from 58% to 25%. The defect is that it ignores direction and can take the opponent's balls, not that it exists.
- **Multiplicity is the channel that matters.** `throw-decay` alone flips the solo ranking, and gives the best single-rule duel separation against `engine-ai` (d = 1.11 for the planner).
- **Paying for what a shot changed** (C) is the other half. It lets the builder beat random, and it moves points from locks to bursts, matching a game called *Tone Boom*.
- **D combines both and is the only configuration where every intended-play proxy beats every non-intended one in solo.** The builder still loses most duels against `engine-ai` (28%), so harvesting on a shared table remains unsolved (§6, P5).
- **D may overshoot.** Bursts become 76% of points. `N/3` and `0.5^k` are single points on two curves, not tuned values.

---

## 6. Proposals

Ranked by measured effect on intended play. Every one of these changes `src/physics` or `src/game`: run `npm run verify`, and re-save the baseline in the same commit (see [simulation.md](./simulation.md)).

### P1. Diminishing returns per throw — applied

Give each throw an id that travels with its credit (for example `Ball.throwId`, copied wherever `credit` is copied). Keep a per-throw event counter, and pay `base × DECAY^k` for the throw's k-th scoring event.

- **Measured** at `DECAY = 0.5`: flips solo from random-favoured to intended-favoured (builder − random d from −1.80 to +2.19). Planner beats `engine-ai` in 86.7 ±4.4% of duels, against 58.3 ±6.4% today.
- **Trade-off:** combos pay less. A 3-event combo still pays 175% of its first event.
- **Next step:** make `DECAY` a knob in [`Knobs.ts`](../src/sim/Knobs.ts) and `index.html`, then sweep 0.3–1.0 with a planner-type policy.

### P2. Pay for what the shot changed — applied

- **Incremental locks:** `PAY_LOCK × balls joined` (the smaller side of the merge). Both group sizes are known in the bond loop before `separateGroups` merges them ([`:336-356`](../src/physics/CollisionSolver.ts#L336-L356)). This removes the quadratic re-pay of cluster building.
- **Superlinear bursts:** reward the build-then-boom arc, so a burst pays more than the locks that built the cluster. `5 × N × max(1, N/3)` is a first curve, not a tuned one.
- **Flat peels:** a failed burst should not pay by the size of the cluster it failed on.
- **Measured** as C: the builder beats random in 98.3 ±1.7% of duels (from 60 ±6%); solo builder − random goes from d −1.80 to inside the noise. With P1 (as D), every intended proxy beats every unintended one in solo.

### P3. Make debris credit direction-aware; don't remove it — applied

Apply the existing hitter rule ([`:310-312`](../src/physics/CollisionSolver.ts#L310-L312)) to debris contacts: re-credit a live ball only when the debris is the one pushing harder. Never let debris take a ball carrying the other player's live throw.

- **Upper bound on effect:** 7.4 ±0.6% of points were taken this way.
- **Not measured directly:** the probe did not record push direction on debris contacts. Removing debris credit entirely was measured, and it hurts deliberate bursting (§5).

### P4. Clear credit when a ball comes to rest — applied

Where `stepPhysics` parks a group ([`:471`](../src/physics/CollisionSolver.ts#L471)), set its members' `credit` to `-1`. "The ball you threw stops being yours when it stops" is legible to a player.

- **Measured:** 2–8% of points, with no skill-signal effect beyond noise. Do it for fairness, not balance.

### P5. Rein in the black ball — partly applied (black pays per ball joined; draw odds unchanged)

Today black multiplies the *whole* cluster by 4 and is drawn 40% of the time by whoever trails. It carries 84% of lock points, triples total scoring, and nearly doubles lead changes (12.0 ±1.5 against 6.5 ±1.3).

- **Options:** apply `PAY_BLACK` only to balls joined (it falls out of P2), or keep the catch-up role in the draw odds rather than in a multiplier.
- **Shared-table harvesting** (§4.5) belongs to the same question: who should be paid when a cluster made of your balls is burst by someone else? A burst that pays each ball to its thrower would be one answer. It is unmeasured.
- **Must be measured with specials on,** where re-scoring is not exact. Implement it, then run `npm run sim -- compare --mode duel --runs 30` and read the paired catch-up statistic.

### P6. Make consequences learnable (physics, unmeasured)

Peel kick direction and debris spread come from `Math.random` ([`:145`](../src/physics/CollisionSolver.ts#L145), [`:174`](../src/physics/CollisionSolver.ts#L174)).

- **Change:** derive them from the impact normal with a bounded spread. Chains would stay dramatic but become something a player can aim for.
- **Measure:** use the twin test (§4.6). This changes physics, so re-save the baseline.

### P7. Keep the measurement in the harness

The probe, planner and builder in this analysis were scratch code. Landing them in `src/sim/` would let P1–P6 be measured against the shipped game instead of re-derived:

- scoring events with lineage in `RunResult`;
- `planner` and `builder` as `PolicyName`s;
- attribution shares in `run`.

The token trick needs no changes to game code.

---

## 7. Limits of This Analysis

- **Proxies, not players.** No policy here plays like a human. The planner and builder are greedy one-shot evaluators with no bank shots, timing or defence. The solo ranking in §4.4 says nothing in the pay table rewards precision over volume. It does not say a skilled human would lose to random aim.
- **Approximations.**
  - `incr-lock` uses cluster sizes captured at contact detection.
  - Black-lock detection uses the contact pair; 5 lock events, out of about 9,000 scoring events across the 30 specials-on duels, had points that disagreed with it.
  - Specials-on re-scored shares ignore the score-to-draw feedback.
- **One field size** (380×620), default knobs, 3 colours.
- **The twin test used 30 pairs.** Flip rates are ±9%.
- **The rules changed on the day of this analysis** (`PAY_BLACK` 2 → 4, and black draw weight doubled). All specials-on numbers reflect the new values. Specials-off numbers are unaffected.

---

## 8. After the Change

### What shipped

| Proposal | Where |
| :--- | :--- |
| **P1** per-throw decay | `Shot` in [`Types.ts`](../src/physics/Types.ts), shared by every ball whose credit came from the same throw and copied wherever `credit` is copied. `award` pays `× SHOT_DECAY^k`. Knob `shotdecay` ("repeat hits pay"), default 0.5. |
| **P2** pay for change | `lockPay(joined, viaBlack)` and `burstPay(count, payScale)` in [`Rules.ts`](../src/game/Rules.ts). Peels pay `PAY_PEEL` flat. The lock's `joined` is the smaller side of the merge, taken in the bond loop of `collide` before bonds are added. |
| **P3** direction-aware debris | The debris branch of `collide` hands credit over only when the debris is pushing harder. Regression guard: `tests/game/BugDetections.test.ts`, Bug 12. |
| **P4** credit clears at rest | `stepPhysics` clears `credit` and `shot` on any group with no linear or angular velocity. |
| **P5** (part) | Falls out of P2: `PAY_BLACK` multiplies balls joined, not cluster size. |

`npm run verify` passes: 237 tests, the physics checks, and every invariant. The baseline was re-saved, and the movement was exactly the expected set:

- **idle:** unchanged, as it must be, since nobody throws.
- **Solo scenarios:** only scores moved, plus a few credited lock and peel *counts*. Clearing credit at rest changes which events have a player to count against. Physics is identical.
- **Duel and AI scenarios:** physics metrics moved too, because special-ball draws follow the score gap. Invariants stayed within tolerance.

### Measured before and after

Same scratch policies and seeds as §4: 30 seeds per policy, 180 s. Duels are 60 matches, both seats. `d` is standardized against random; "noise" means inside 2× the standard error.

**Solo score attack, specials off**

| policy | before | after |
| :--- | ---: | ---: |
| planner | 1441 ±30 (d −2.77) | 749 ±16 (d **+2.62**) |
| builder | 2072 ±60 (d −1.80) | 843 ±20 (d **+3.19**) |
| `engine-ai` | 2120 ±64 (d −1.72) | 784 ±22 (d **+2.52**) |
| fixed | 2387 ±135 (d −1.15) | 357 ±24 (d −1.34) |
| random | 3382 ±179 | 511 ±17 |

**Solo score attack, specials on (the shipped configuration)**

| policy | before | after |
| :--- | ---: | ---: |
| planner | 3863 ±149 (d −1.46) | 1050 ±25 (d +0.05, noise) |
| builder | 4614 ±216 (d −0.91) | 1174 ±34 (d +0.39, noise) |
| `engine-ai` | 5698 ±307 (d −0.22, noise) | 1257 ±44 (d **+0.59**) |
| fixed | 3115 ±192 (d −1.86) | 689 ±56 (d −0.84) |
| random | 6111 ±368 | 1030 ±89 |

**Duels: the first-named player's win rate**

| matchup | specials off, before | specials off, after | specials on, before | specials on, after |
| :--- | ---: | ---: | ---: | ---: |
| planner vs `engine-ai` | 58.3 ±6.4% | **88.3 ±4.2%** | 56.7 ±6.5% | **66.7 ±6.1%** |
| builder vs `engine-ai` | 0% | 21.7 ±5.4% | 38.3 ±6.3% | 55.0 ±6.5% |
| planner vs random | 100% | 100% | 96.7 ±2.3% | 98.3 ±1.7% |
| builder vs random | 60.0 ±6.4% | **100%** | 95.0 ±2.8% | 98.3 ±1.7% |
| `engine-ai` vs random | 100% | 100% | 96.7 ±2.3% | 93.3 ±3.2% |

In duels with specials on:

- The planner's margin against `engine-ai` went from 78 ±80 (inside the noise) to 206 ±62.
- The builder's went from −214 ±95 to +74 ±62, which is inside the noise.

**Points mix**, solo `engine-ai` with specials on:

| | lock | burst | peel |
| :--- | ---: | ---: | ---: |
| before | 87.2% | 7.3% | 5.4% |
| after | 39.1% | 59.1% | 1.8% |

Scores are about 4–5× smaller than before; solo `engine-ai` with specials on went from 5698 to 1257.

### `shotdecay` sweep, specials on

| `shotdecay` | planner vs `engine-ai` wins | builder vs `engine-ai` wins | solo builder − random, d | solo planner − random, d |
| ---: | ---: | ---: | ---: | ---: |
| 0.3 | 73.3 ±5.8% | 61.7 ±6.3% | +0.49 (noise) | +0.15 (noise) |
| **0.5** | 66.7 ±6.1% | 55.0 ±6.5% | +0.39 (noise) | +0.05 (noise) |
| 0.7 | 66.7 ±6.1% | 48.3 ±6.5% | +0.25 (noise) | −0.09 (noise) |
| 1.0 (off) | 63.3 ±6.3% | 40.0 ±6.4% | −0.30 (noise) | −0.75 (lower) |

Stronger decay favours intended play. The step from 0.5 to 0.3 is inside the noise, so the default stays at 0.5. At 1.0, which is P2–P4 without P1, random beats the planner in solo again, so the decay is doing real work.

### Follow-up: special-ball pay

Applied after the measurements above:

| Event | Before | After |
| :--- | :--- | :--- |
| Lock through one black ball | ×4 | **×2** (`PAY_BLACK`) |
| Black ball locking onto a black ball | ×4 | **×4** (`PAY_BLACK_PAIR`) |
| Burst by a white ball, or by its spent ghost | ×0.5 | **normal points** (`PAY_WHITE` removed) |

`lockPay(joined, blacks)` takes the number of black balls in the contact pair.

The baseline was re-saved:

- In every scenario except `ai/380x620/s1`, only scores moved.
- In `ai/380x620/s1`, physics metrics moved too, because the new scores changed which special balls were drawn.
- `solo/380x620/s1` and `idle` did not move at all.

### Still open

- **Solo with specials on.** Intended play has gone from losing to random (random 1.3–1.6× ahead) to level with it, not clearly ahead. With specials off it is clearly ahead, so the remaining gap is the special balls: black is still drawn 40% of the time by the trailer (20% in solo) and still bonds to anything. That is P5's draw-odds half. (These measurements used black ×4; the follow-up below lowered it.)
- **Shared-table harvesting.** The builder is only level with `engine-ai` in specials-on duels, and still loses with specials off.
- **P6** (physics randomness) and **P7** (keeping the probe and policies in the harness) are not done.
- **Proxy limits** (§7) still apply: these are scratch policies, not players.

---

## 9. Special Balls and Catch-Up

**The question:** does handing black to the leader and white to the trailer help the player who is behind more than the shipped assignment does? The shipped assignment gives black to the trailer and white to the leader.

### Method

- **Setup:** measured with the follow-up pay rules (black ×2, black on black ×4, white at full points), in duels.
- **Isolation:** each option was patched into a scratch copy of `src`. With the shipped option selected, the copy reproduced the repo's duel scores exactly.
- **Matches:** equal players were `engine-ai` against `engine-ai`, 60 seeds. Skill gaps were the planner against `engine-ai` and the planner against random, 60 matches each, both seats.

| Metric | Meaning |
| :--- | :--- |
| trailer's second-half share | Points scored after half-time by the player behind at half-time, as a share of all second-half points. Among equal players with no mechanic, this should sit near 50%. |
| half-time trailer won | How often the player behind at half-time won the match. |
| planner wins | Whether skill still decides matches. A catch-up mechanic that lets random aim beat deliberate play is rewarding being behind, not playing well. |

### Options measured

| Option | Trailer draws | Leader draws |
| :--- | :--- | :--- |
| off | — | — |
| current (shipped) | black 40% | white 12.5% |
| swap | white 12.5% | black 40% |
| swap-odds | white 40% | black 12.5% |
| white-trailer | white 40% | nothing |
| underdog | shipped assignment, plus the trailer's points ×1.5 | |
| tempo | shipped assignment, plus the trailer reloads in 2 s instead of 3 s | |

Percentages are at 3 colours.

### Results

| Option | Trailer's 2nd-half share | Half-time trailer won | Final margin / total | Planner vs `engine-ai` wins | Planner vs random wins |
| :--- | ---: | ---: | ---: | ---: | ---: |
| off | 52.7 ±1.1% | 25.0 ±5.6% | 9.2 ±1.0% | 88.3 ±4.2% | 100% |
| **current** | **33.2 ±1.7%** | **3.3 ±2.3%** | 34.0 ±1.8% | 60.0 ±6.4% | 96.7 ±2.3% |
| swap | 56.1 ±1.2% | 50.0 ±6.5% | 7.9 ±0.9% | 63.3 ±6.3% | 78.3 ±5.4% |
| swap-odds | 55.1 ±0.9% | 54.2 ±6.5% | 5.1 ±0.6% | 80.8 ±5.1% | 96.7 ±2.3% |
| white-trailer | 54.1 ±1.0% | 55.0 ±6.5% | 5.5 ±0.6% | 90.0 ±3.9% | 100% |
| underdog | 44.9 ±1.6% | 11.7 ±4.2% | 19.1 ±1.3% | 71.7 ±5.9% | 96.7 ±2.3% |
| tempo | 38.1 ±1.7% | 8.3 ±3.6% | 29.6 ±1.5% | 68.3 ±6.1% | 100% |

Specials thrown per match, trailer / leader at the time of the throw:

| Option | Specials |
| :--- | :--- |
| current | 21.4 / 7.9 |
| swap | 10.5 / 19.6 |
| swap-odds | 18.9 / 9.1 |
| white-trailer | 18.4 / 3.3 |

Draws are made up to three throws before the ball leaves, so a "leader" can still throw a ball drawn while trailing.

### Reading

- **The shipped assignment snowballs.** The half-time trailer scores a third of the second half and almost never comes back: 3% of matches, against 25% with specials off. The mechanism is not isolated. A likely explanation is that under burst-weighted scoring, black clusters built by the trailer are burst by the leader, who is also drawing white.
- **The plain swap produces catch-up, but it overshoots.** The trailer's second-half share is 3.4 ±1.6 points above `off`. The half-time leader loses half the time, and random aim beats the planner in 21.7% of matches (3.3% with the shipped assignment).
- **swap-odds and white-trailer** give the same comeback rate, and preserve skill: the planner wins 81–90% against `engine-ai` and 97–100% against random. white-trailer removes black from duels entirely; swap-odds keeps it as a rare ball for the leader.
- **Paying or speeding up the trailer** (underdog, tempo) only partly offsets the shipped assignment's snowball.

### The two swaps in depth

A second run compared the two swaps against `current` and `off`: 120 equal-player matches at 3 colours, 60 at 6 colours, and three skill pairings of 60 matches each, both seats.

**No difference between swap and swap-odds (inside the noise):**
- the trailer at 60 s, 90 s or 150 s went on to win;
- lead changes per match: 4.9 ±0.2 against 5.4 ±0.3 (`current` 1.6, `off` 3.4);
- the eventual winner's time spent behind: about 40%;
- the trailer's second-half share.

At 6 colours both swaps still beat `current`, and still do not differ from each other.

**Where they clearly differ:**

| Metric | swap | swap-odds |
| :--- | ---: | ---: |
| whites thrown per match / points per white | 6.8 / 88 | 21.5 / 19 |
| blacks thrown per match | 22.5 | 6.9 |
| black lock share of points | 22.1% | 8.0% |
| black-on-black share of points | 5.2% | 0.4% |
| largest single event / match total | 13.4% | 7.9% |
| total points per match | 2077 | 1362 |
| close finishes (margin < 5%) | 29.2 ±4.2% | 50.8 ±4.6% |
| blowouts (margin ≥ 25%) | 5.0 ±2.0% | 0% |
| special-ball points scored while trailing | 62.4% | 73.4% |
| planner beats `engine-ai` | 63.3 ±6.3% | 80.8 ±5.1% |
| planner beats random | 78.3 ±5.4% | 96.7 ±2.3% |
| random wins from behind at half-time | 20.0 ±5.7% | 3.5 ±2.5% |
| builder beats `engine-ai` (builder is the weaker bot: 21.7% with specials off) | 53.3 ±6.5% | 31.7 ±6.1% |

**swap** plays as big moments. The leader collects black and builds large clusters, and the trailer's rare white bursts them for about 88 points each. It equalises harder: weaker players, random aim and the builder alike, win more often.

**swap-odds** plays as a grind. The trailer gets frequent small white bursts, finishes are tight, and skill decides more matches. Black nearly disappears from duels.

**Shipped: swap.**
- Black goes to the leader at `2 / (COLORS + 2)`, and white to the trailer at `1 / (2 * (COLORS + 1))`.
- Chosen over swap-odds for its bigger special-ball moments, accepting a weaker skill signal.
- Solo draws are unchanged: the solo coin flip is mapped so the same random draws produce the same balls.

---

## 10. Lock Growth

After the swap shipped, bursts earned about 69% of all points. A lock paid 3 per ball added, however big the cluster it joined.

Four lock curves were measured, where *t* is the size of the cluster being joined (the larger side of the merge):

| Curve | Pay per ball joined |
| :--- | :--- |
| base | 3 |
| t/3 | 3 × max(1, t/3), the same curve as the burst bonus |
| (1+t)/2 | 3 × (1 + t) / 2 |
| t | 3 × t |

**Setup:** measured on the scratch copy (which reproduced the shipped game exactly), with specials on. Equal-player duels ran 60 matches, solo runs used 30 seeds per policy, and each skill pairing ran 60 matches over both seats.

| Metric | base | t/3 | **(1+t)/2** | t |
| :--- | ---: | ---: | ---: | ---: |
| lock share of points (equal duel) | 29.6 ±0.4% | 40.1 ±0.6% | **52.4 ±0.8%** | 64.1 ±0.7% |
| burst share of points | 68.9 ±0.4% | 58.7 ±0.6% | **46.6 ±0.8%** | 35.1 ±0.7% |
| total points per match | 2096 | 2583 | **3290** | 4066 |
| half-time trailer won | 50.0 ±6.5% | 65.0 ±6.2% | **51.7 ±6.5%** | 37.3 ±6.3% |
| blowouts (margin ≥ 25%) | 5.0 ±2.8% | 0% | **0%** | 0% |
| largest single event / total | 13.2% | 12.3% | **10.1%** | 7.2% |
| planner vs `engine-ai` wins | 63.3 ±6.3% | 66.7 ±6.1% | **65.0 ±6.2%** | 67.5 ±6.0% |
| builder vs `engine-ai` wins | 53.3 ±6.5% | 63.3 ±6.3% | **55.8 ±6.4%** | 43.3 ±6.5% |
| planner vs random wins | 78.3 ±5.4% | 78.3 ±5.4% | **91.7 ±3.6%** | 93.3 ±3.2% |

**Solo score attack** (specials on): planner and builder against random stayed inside the noise on every curve, neither better nor worse. `engine-ai` against random cleared the noise at (1+t)/2 (d 0.56) and at t (d 0.55).

**Shipped: (1+t)/2**, as `lockPay(joined, blacks, target)`.

- Locks and bursts now earn about half of all points each.
- The planner's win rate against random rose from 78% to 92%, which clears the noise.
- The comeback rate is unchanged: 52% against 50%, inside the noise.
- Building a cluster one ball at a time still pays less than bursting it. Building to 8 balls pays 54; bursting 8 balls pays 107.

t would push locks to 64% of points. The drop in comebacks at t (to 37%) is inside the noise.

---

## 11. Peel Growth

With lock growth shipped, peels ("knocked loose") earned 1% of points. Each paid peel paid 1.3 points on average. Three things kept it that low:

- **Flat pay:** a peel paid a flat 2.
- **Shot decay:** a peel is rarely a throw's first event, so the decay usually halved it to 1.
- **Uncredited debris peels:** peels caused by burst debris pay nobody.

Four peel curves were measured, where *s* is the size of the cluster the ball was knocked off, counting that ball. The setup matched §10: the scratch copy (which reproduced the shipped game), specials on, and the same match counts.

| Metric | flat 2 | 2(1+s)/2 | **5(1+s)/2** | 5s |
| :--- | ---: | ---: | ---: | ---: |
| peel share of points (equal duel) | 1.0% | 2.5% | **6.3 ±0.3%** | 9.1 ±0.4% |
| points per paid peel | 1.3 | 3.2 | **6.1** | 10.1 |
| half-time trailer won | 51.7 ±6.5% | 47.5 ±6.6% | **45.8 ±6.5%** | 46.7 ±6.5% |
| planner vs `engine-ai` wins | 65.0 ±6.2% | 64.2 ±6.2% | **55.0 ±6.5%** | 60.0 ±6.4% |
| planner vs random wins | 91.7 ±3.6% | 91.7 ±3.6% | **88.3 ±4.2%** | 85.0 ±4.6% |
| random's peel share of points, solo | 2.9% | 8.0% | **17.7%** | 25.5% |
| solo planner − random, d | −0.10 (noise) | −0.20 (noise) | **−0.39 (noise)** | −0.59 (**lower**) |

**Peels are mostly how random play scores.** As peel pay rises, random aim's peel income grows much faster than aimed play's. At 5s, random outscores the planner in solo beyond the noise.

**Shipped: 5(1+s)/2**, as `peelPay(size)` with `PAY_PEEL = 5`.

- Peels rise to about 6% of points, and a paid peel earns about 5× what it did.
- Every skill and catch-up measure stays inside the noise. The trend still favours random play, so this is the ceiling, not a step toward more.
