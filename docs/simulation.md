# Simulation Harness

A headless simulation tool for verifying what a change actually does to the game.
It runs real matches under `node` — no browser, no canvas, no audio — with a
seeded random number generator, and reports what happened.

Use it to answer three different questions:

| Question | Command |
| :--- | :--- |
| Did I break the physics? | `npm run sim:physics`, `npm run sim:invariants` |
| Did my change alter how the game plays? | `npm run sim:baseline` |
| What does this knob actually do? | `npm run sim -- sweep <knob>=<values>` |

For the full gate, `npm run verify` runs the type-check, the unit tests, and all
three simulation gates in order.

---

## Design: one loop, not two

The harness does **not** re-implement the frame loop. That is the single most
important thing about it.

The game loop lives in [`src/sim/Frame.ts`](../src/sim/Frame.ts) as
`advanceFrame`, and both callers use it:

```
src/main.ts      → advanceFrame(...) → then draws to canvas
src/sim/Harness  → advanceFrame(...) → then measures
```

Substepping, the hitch guard on `dt`, the turn timer, the ball-rain cadence and
the match clock therefore exist in exactly one place. A change to game feel
cannot land in the browser while the simulation quietly keeps measuring the old
behaviour — the failure mode that made the previous generation of harnesses
untrustworthy.

The same principle applies to knobs. Every tunable is declared once in
[`src/sim/Knobs.ts`](../src/sim/Knobs.ts), and both the in-game tuning panel and
the harness drive those declarations by name. `tests/sim/Knobs.test.ts` asserts
the registry still matches the `min`/`max`/`step`/`value` attributes in
`index.html`, in both directions — so a knob cannot mean one thing to a player
dragging a slider and another to a simulation measuring its effect.

### Determinism

[`src/sim/Rng.ts`](../src/sim/Rng.ts) replaces `Math.random` itself for the
duration of a run, rather than threading a generator through the dozen call sites
that need one. That is deliberate: code the harness has never heard of still
becomes reproducible, so a `Math.random` added to the game later cannot silently
reintroduce nondeterminism.

The same seed reproduces a run exactly. This is what makes the baseline
comparison below possible.

---

## Commands

All commands take `--json` for machine-readable output, and exit `0` on pass,
`1` on a failed measurement, `2` on a usage error.

When consuming `--json`, use `npm run --silent`, or npm's own banner lands on
stdout ahead of the JSON:

```bash
npm run --silent sim -- run --seconds 60 --json | jq .killGroups
```

### `run` — one configuration, reported

```bash
npm run sim -- run --mode ai --seconds 120
npm run sim -- run --set burst=0.8,minburst=4 --seed 7
```

Options: `--mode solo|duel|ai|idle`, `--seed`, `--seconds`, `--width`,
`--height`, `--set`, `--policy`, `--runs`.

### `sweep` — a knob across values, with error bars

```bash
npm run sim -- sweep burst=0.2,0.4,0.6,0.8,1.0 --runs 10 --mode ai
```

```
knob            bursts   burstSize            score     ballsAvg   clusterMax
burst=0.2  25.67 ±1.89  3.09 ±0.18   1669.00 ±59.95  23.31 ±0.41  10.50 ±0.96
burst=0.4  18.50 ±2.36  3.92 ±0.42  2549.33 ±262.28  25.60 ±1.85  11.17 ±0.87
burst=0.8  14.50 ±1.36  4.26 ±0.27  3473.67 ±345.61  30.84 ±2.29  13.17 ±1.30
```

Choose what to report with `--metrics`; `npm run sim -- metrics` lists the
options.

### `compare` — two configurations, paired

```bash
npm run sim -- compare --a kickout=0.5 --b kickout=1.2 --runs 30 --mode duel
```

Reports each metric as `mean ± standard error`, plus a verdict that stays
`inside the noise` unless the difference clears twice its own standard error.

In `duel` and `ai` modes it also reports the **paired catch-up statistic**:
instead of comparing final scores across configurations, it measures each match
against itself — how much ground the half-time trailer recovered by the end.
Positive is rubber banding, negative is snowballing. Comparing final scores
directly drowns in match-to-match variance; this does not.

### `invariants` — geometry, every frame

```bash
npm run sim:invariants
```

Runs every baseline scenario and checks three things on **every frame**:

| Invariant | Tolerance | Why |
| :--- | :--- | :--- |
| `frozen` — overlap within one group | **exactly 0** | Group members hold fixed offsets, so overlap baked in at bond time never resolves. It is permanent and visible forever. |
| `overlap` — overlap between groups | ≤ 0.05px | The relaxation pass leaves at most its own slop of 0.02px. A healthy build measures 0.0199px across every mode and seed. |
| `outside` — penetration past a rail | ≤ 0.05px | Rounding at the walls, nothing more. |

Sampling every frame is the point: a 5.9px overlap lasting a single frame is
visible to a player and invisible to a check that samples every few hundred.

**Balls still fading in are excluded**, because the collider excludes them too. A
rain ball is intangible for its first second and is *expected* to appear inside a
resting cluster; those pairs routinely reach 22px and would drown out the 0.02px
signal that actually matters. The count of excluded balls is reported as `fading`
rather than hidden.

### `physics` — textbook results

```bash
npm run sim:physics
```

With restitution 1 and no drag, an impulse solver has known correct answers.
[`src/sim/Scenarios.ts`](../src/sim/Scenarios.ts) builds each case with an **empty
`players` array**, so the launcher bays cannot clamp or bounce anything, and gives
every ball a distinct `kind`, so no bond can form and no cluster can break. What
remains is the impulse solver alone.

Current measurements on a healthy build:

| Check | Measured |
| :--- | :--- |
| Two equal balls head-on exchange velocities | exact |
| A glancing hit between equal masses separates at 90° | 90.0000° |
| Mass 1 into a rigid cluster of N moves in `(1-N)/(1+N)` : `2/(1+N)` ratio | exact for N=2, N=4 |
| Linear momentum conserved | 1.3e-14 % |
| Kinetic energy conserved | 0 % |
| Angular momentum conserved | 0.003 % |
| A spinning cluster's pairwise distances over 20s | drift 4e-13 px |

### `baseline` — did behaviour change?

```bash
npm run sim -- baseline save     # record current behaviour
npm run sim:baseline             # verify nothing moved
```

Because runs are seeded, ten fixed scenarios produce byte-identical numbers on an
unchanged build. That turns a vague question into an exact one:

- **A pure refactor reproduces the baseline exactly.** Silence is a real result.
- **A retune shows exactly which metrics moved, and by how much.** Re-save the
  baseline in the same commit, so the diff records the intended effect.
- **An accident shows movement where the author expected none.** That is the bug.

The default tolerance is `0` — exact. Pass `--tolerance <pct>` to allow drift.

The scenario list spans field sizes (380x620, 380x460, 768x1024) on purpose.
Speeds are written in px/s, so they behave differently on a shorter field, and a
whole class of feel bugs only appears when the same shot is measured at two
heights.

`baseline` is deliberately **not** part of `npm test`: the unit suite answers "is
it broken", and the baseline answers "did behaviour change". The second is a
question for a human to judge, not a build failure to be silenced.

---

## Reading the results honestly

**Watch the metric you are optimising drift from the one that matters.** Bursts
per minute can look healthy while the mean cluster size at burst is 2.9 — frequent
events, all of them trivial. `run` reports `mean burst size` next to
`bursts per minute` for exactly this reason, and warns when it drops below 3.

**Never report a difference inside the noise.** Match-to-match variance is large;
a handful of runs per configuration reliably produces differences that are pure
chance. Every comparison carries a standard error, and both `sweep` and `compare`
refuse a verdict inside 2x it. With that discipline, 30 runs can distinguish a
real catch-up effect (+28 ± 9) from no effect (+3 ± 9); without it, every
configuration looks the same.

**Know what the bots cannot do.** `--policy engine-ai` uses the shipped AI, which
aims at the biggest cluster at a random power and never checks whether the line is
clear. In a crowded field a shot bleeds most of its speed into whatever it clips:
an empty table delivers ~1009 px/s to the target, 60 balls in the way delivers
~283. A bot like this once concluded that *playing was worse than doing nothing* —
true of the bot, not of the game. Where the skill under test is shot selection, no
policy here represents it; say so rather than reporting the number as a finding.

**Check the success criterion before believing a result.** A shot once looked like
it was missing its target; it had connected, but the target was pinned against a
rail and could only move at 7 px/s, under the 20 px/s threshold the test used.

**A knob default beats a constant.** For any field a slider controls, the
`index.html` slider value wins at page load — so editing the literal in
`physics/Config.ts` changes nothing in the browser *or* in the harness. Change the
knob default in the registry (and the markup) instead. Fields with no slider, like
`GHOST_LIFE`, are set by the constant.

---

## Files

| File | Responsibility |
| :--- | :--- |
| [`src/sim/Frame.ts`](../src/sim/Frame.ts) | `advanceFrame` — the one game loop, shared with `main.ts` |
| [`src/sim/Harness.ts`](../src/sim/Harness.ts) | `runSim` / `runMany`, aim policies, metric extractors |
| [`src/sim/Knobs.ts`](../src/sim/Knobs.ts) | The knob registry, shared with the tuning panel; config snapshot/restore |
| [`src/sim/Metrics.ts`](../src/sim/Metrics.ts) | Invariants, tolerances, per-frame sampling |
| [`src/sim/Stats.ts`](../src/sim/Stats.ts) | Mean, standard error, noise-aware verdicts, catch-up |
| [`src/sim/Scenarios.ts`](../src/sim/Scenarios.ts) | Hand-built fields that isolate the solver |
| [`src/sim/PhysicsChecks.ts`](../src/sim/PhysicsChecks.ts) | The textbook assertions |
| [`src/sim/Baseline.ts`](../src/sim/Baseline.ts) | Scenario list, digest, diffing |
| [`src/sim/Rng.ts`](../src/sim/Rng.ts) | Seeded `Math.random` |
| [`scripts/sim.ts`](../scripts/sim.ts) | The CLI |
| `tests/sim/` | Vitest coverage of all of the above |
| `tests/sim/baseline.json` | The recorded baseline; commit changes to it deliberately |

[`simulation-harnesses.md`](./simulation-harnesses.md) records the earlier
single-file harnesses and the measurement lessons that shaped this design.
