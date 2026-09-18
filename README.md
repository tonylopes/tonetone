# Tone Boom

**Tone Boom** is a physics-based arcade game combining classic billiards mechanics with emergent color-bonding chemistry, rigid-body cluster physics, and procedural Web Audio synthesis. Built with TypeScript and Vite, and packaged for iOS and Android via Capacitor.

## Getting Started

```bash
npm install
npm run dev      # start the dev server
npm test         # run the test suite
npm run build    # type-check and produce a production build in dist/
npm run verify   # full gate: type-check, tests, and the simulation gates
```

## Simulation harness

The game ships with a headless simulation tool for verifying what a change does to
physics and balance. It runs real matches under `node` with a seeded RNG, so results
are exact and reproducible.

```bash
npm run sim -- run --mode ai --seconds 120        # play a match and report on it
npm run sim -- sweep burst=0.2,0.4,0.6 --runs 10 # what does this knob do?
npm run sim -- compare --a kickout=0.5 --b kickout=1.0 --runs 30 --mode duel
npm run sim:physics                              # textbook collision-solver results
npm run sim:invariants                           # geometry, checked every frame
npm run sim:baseline                             # did behaviour change?
npm run sim -- help
```

Add `--json` for machine-readable output (with `npm run --silent`, so npm's banner
stays off stdout).

See [`docs/simulation.md`](docs/simulation.md) for the guide.

## Documentation

See [`docs/design_overview.md`](docs/design_overview.md) for the full architecture overview, with links to detailed docs on the physics engine, audio engine, rendering, UI, and mobile packaging.
