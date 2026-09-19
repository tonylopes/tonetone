# Tone Boom

**Tone Boom** is a physics-based arcade game combining classic billiards mechanics with emergent color-bonding chemistry, rigid-body group physics, and procedural Web Audio synthesis. Built with TypeScript and Vite, and packaged for iOS and Android via Capacitor.

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
npm run sim -- sweep boom=0.2,0.4,0.6 --runs 10 # what does this knob do?
npm run sim -- compare --a kickout=0.5 --b kickout=1.0 --runs 30 --mode duel
npm run sim:physics                              # textbook collision-solver results
npm run sim:invariants                           # geometry, checked every frame
npm run sim:baseline                             # did behaviour change?
npm run sim -- help
```

Add `--json` for machine-readable output (with `npm run --silent`, so npm's banner
stays off stdout).

Full guide: the [Simulation Harness](https://app.notion.com/p/3dfdc052afb1812e8a39e1bbf59cbf71)
page in Notion.

## Documentation

Documentation is maintained in Notion, not in this repository.

Start at **[Design Overview](https://app.notion.com/p/3dfdc052afb1815d89a1c285532baf68)**,
which carries the executive summary, project layout and architecture diagram, and
links to the detailed pages on game mechanics, scoring, the physics engine, the
audio engine, rendering, UI, the simulation harness, the tutorial design and
mobile packaging. The
[Documentation](https://app.notion.com/p/3dfdc052afb181d890bbcc0aa14c0ace) home
page indexes them all, and the project itself lives at
[Tone Boom](https://app.notion.com/p/3dfdc052afb181719a60ef22a9610f6a).
