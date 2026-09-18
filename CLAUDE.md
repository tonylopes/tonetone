# Tone Boom — working notes for code agents

A physics-based arcade billiards game: TypeScript + Vite, Canvas 2D and Web Audio
hand-written with no game-logic dependencies, packaged for iOS/Android via
Capacitor. Start at [`docs/design_overview.md`](docs/design_overview.md).

## Verify changes with the simulation harness

This project has a headless simulation tool. **Use it — do not reason about game
balance or physics from reading the code alone.** It runs real matches under
`node` with a seeded RNG, so results are exact and reproducible.

```bash
npm run verify          # type-check + unit tests + all three simulation gates
```

That is the full gate for any change to `src/physics/`, `src/game/` or
`src/sim/`. Run it before reporting a change as done. The individual gates:

```bash
npm test               # unit tests (182), including the harness's own
npm run sim:physics    # textbook solver results: momentum, energy, 90° separation
npm run sim:invariants # geometric invariants on every frame of 10 scenarios
npm run sim:baseline   # did this change alter how the game plays?
```

### When you change physics or rules

1. Run `npm run sim:baseline` **before** editing, to confirm a clean starting point.
2. Make the change.
3. Run `npm run verify`.
4. Read the baseline diff:
   - **No diff** means behaviour did not change. For a refactor, that is the
     result you want, and it is a strong one.
   - **A diff you intended** — re-save it in the same commit:
     `npm run sim -- baseline save`. Say in the commit message which metrics moved
     and why.
   - **A diff you did not intend** is the bug. Do not re-save the baseline to make
     it quiet.

Every command takes `--json`. Parse it with `npm run --silent`, or npm's banner
lands on stdout ahead of the JSON:

```bash
npm run --silent sim -- invariants --json
```

### When you change or add a knob

Knobs are declared once in [`src/sim/Knobs.ts`](src/sim/Knobs.ts) and consumed by
both the tuning panel and the harness. Add or change a knob in **both** the
registry and `index.html`; `tests/sim/Knobs.test.ts` fails if they disagree.

Then measure it rather than describing it:

```bash
npm run sim -- sweep <knob>=<v1,v2,v3> --runs 10
npm run sim -- compare --a <knob>=<old> --b <knob>=<new> --runs 30 --mode duel
```

### When you change the game loop

`advanceFrame` in [`src/sim/Frame.ts`](src/sim/Frame.ts) is the **only** game
loop; `main.ts` and the harness both call it. Keep it that way. Do not add a
second copy of the substep rule, the turn timer or the rain cadence to either
caller — a harness that mirrors the loop instead of sharing it ends up measuring a
simulation that no longer exists.

## Reporting results

- **Never report a difference that is inside the noise.** `sweep` and `compare`
  print `mean ± standard error` and withhold a verdict unless the difference
  clears 2x that error. Repeat the phrasing they use; do not upgrade
  "inside the noise" into an effect.
- **Quote the numbers**, with their error bars, not just the direction.
- **Name the proxy's limits.** `--policy engine-ai` is the shipped AI: it aims at
  the biggest cluster and never checks whether the line is clear. It cannot
  represent shot selection. If that is the skill in question, say so instead of
  reporting its number.
- Watch `mean burst size` next to `bursts per minute`. A high rate of 2-ball
  bursts is not the same game as occasional 9-ball bursts, and the rate alone
  cannot tell them apart.

Full guide: [`docs/simulation.md`](docs/simulation.md). Historical harnesses and
the measurement lessons behind the design:
[`docs/simulation-harnesses.md`](docs/simulation-harnesses.md).

## Conventions

- TypeScript strict mode; `tsc --noEmit` type-checks `src/` and `scripts/`.
- `tests/` mirrors `src/`. Regression repros for specific defects go in
  `tests/game/BugDetections.test.ts` as permanent guards.
- No game-logic runtime dependencies. Physics, audio synthesis and rendering are
  hand-written; the only runtime packages are the Capacitor native shims.
- `PhysicsConfig`, the `Rules` palette and `AudioStore` are module-level mutable
  singletons. Anything that tunes them must restore them — use `snapshotConfig` /
  `restoreConfig` from `src/sim/Knobs.ts`.
- For any field a slider controls, the `index.html` value wins at page load, so
  editing the literal in `physics/Config.ts` has no effect. Change the knob
  default instead.
