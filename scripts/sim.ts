/**
 * The simulation CLI: `npm run sim -- <command>`.
 *
 * Every command exits non-zero on failure, so an agent or a CI job can gate on
 * it without parsing the output. `--json` prints machine-readable results for
 * anything that needs to be consumed rather than read.
 *
 * See docs/simulation.md for the guide.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  EXTRACTORS, Mode, PolicyName, RunResult, SimOptions,
  extract, extractorNames, runMany, runSim,
} from '../src/sim/Harness';
import { KNOBS, KnobValue, knobIds, parseKnobValue } from '../src/sim/Knobs';
import { TOLERANCE, violations } from '../src/sim/Metrics';
import { catchUp, compare, estimate } from '../src/sim/Stats';
import { runPhysicsChecks } from '../src/sim/PhysicsChecks';
import {
  BASELINE_SCENARIOS, BASELINE_VERSION, BaselineFile,
  diffBaseline, measureBaseline,
} from '../src/sim/Baseline';

const BASELINE_PATH = resolve(process.cwd(), 'tests/sim/baseline.json');

// ---------------------------------------------------------------- arg parsing

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (rest[i + 1] && !rest[i + 1].startsWith('--')) flags[a.slice(2)] = rest[++i];
      else flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

function num(flags: Args['flags'], key: string, fallback: number): number {
  const v = flags[key];
  if (v === undefined) return fallback;
  const n = parseFloat(String(v));
  if (!isFinite(n)) fail(`--${key} needs a number, got "${v}"`);
  return n;
}

function fail(message: string): never {
  console.error('error: ' + message);
  process.exit(2);
}

/** Parse `--set burst=0.6,roll=0.3` into knob values, validated against ranges. */
function parseSet(spec: string | boolean | undefined): Record<string, KnobValue> {
  if (!spec || spec === true) return {};
  const out: Record<string, KnobValue> = {};
  for (const part of String(spec).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) fail(`--set expects knob=value pairs, got "${trimmed}"`);
    const id = trimmed.slice(0, eq).trim();
    try {
      out[id] = parseKnobValue(id, trimmed.slice(eq + 1).trim());
    } catch (e) {
      fail((e as Error).message);
    }
  }
  return out;
}

function simOptionsFrom(args: Args): SimOptions {
  const mode = String(args.flags.mode ?? 'solo') as Mode;
  if (!['solo', 'duel', 'ai', 'idle'].includes(mode)) fail(`--mode must be solo, duel, ai or idle`);
  const policy = String(args.flags.policy ?? 'engine-ai') as PolicyName;
  if (!['engine-ai', 'fixed', 'random', 'sweep'].includes(policy)) {
    fail('--policy must be engine-ai, fixed, random or sweep');
  }
  return {
    mode,
    seed: num(args.flags, 'seed', 1),
    seconds: num(args.flags, 'seconds', 60),
    width: num(args.flags, 'width', 380),
    height: num(args.flags, 'height', 620),
    knobs: parseSet(args.flags.set),
    policies: [policy, policy],
    invariants: args.flags.invariants !== 'false',
  };
}

// ------------------------------------------------------------------- printing

function table(headers: string[], rows: (string | number)[][]): void {
  const cells = [headers, ...rows.map(r => r.map(String))];
  const widths = headers.map((_, i) => Math.max(...cells.map(r => (r[i] ?? '').length)));
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of cells.slice(1)) console.log(line(r));
}

function fixed(v: number, places = 2): string {
  return Number.isFinite(v) ? v.toFixed(places) : String(v);
}

function invariantLine(r: RunResult): string {
  const bad = violations(r.worst);
  const detail = `overlap ${fixed(r.worst.overlap, 4)}px, frozen ${r.worst.frozen.toExponential(1)}px, outside ${fixed(r.worst.outside, 4)}px`;
  return bad.length ? `FAIL at t=${fixed(r.worstAt)}s — ${bad.join('; ')}` : `ok (${detail})`;
}

// ------------------------------------------------------------------- commands

function cmdRun(args: Args): number {
  const opts = simOptionsFrom(args);
  const runs = Math.max(1, num(args.flags, 'runs', 1));
  const results = runs === 1 ? [runSim(opts)] : runMany(opts, runs, opts.seed);

  if (args.flags.json) {
    console.log(JSON.stringify(runs === 1 ? results[0] : results, (k, v) => (k === 'samples' ? undefined : v), 2));
    return results.every(r => violations(r.worst).length === 0) ? 0 : 1;
  }

  for (const r of results) {
    console.log(`\n${r.mode} ${r.width}x${r.height} seed=${r.seed} ${fixed(r.seconds, 1)}s (${r.frames} frames)`);
    const overrides = Object.entries(opts.knobs || {});
    if (overrides.length) console.log('knobs: ' + overrides.map(([k, v]) => `${k}=${v}`).join(' '));

    table(
      ['metric', 'p1', 'p2', 'total'],
      [
        ['score', r.players[0].score, r.players[1].score, r.players[0].score + r.players[1].score],
        ['locks', r.players[0].locks, r.players[1].locks, r.players[0].locks + r.players[1].locks],
        ['bursts', r.players[0].bursts, r.players[1].bursts, r.players[0].bursts + r.players[1].bursts],
        ['peels', r.players[0].peels, r.players[1].peels, r.players[0].peels + r.players[1].peels],
        ['best cluster', r.players[0].best, r.players[1].best, Math.max(r.players[0].best, r.players[1].best)],
      ]
    );
    console.log('');
    table(
      ['field', 'value'],
      [
        ['bursts', r.killGroups],
        ['balls destroyed', r.killBalls],
        ['mean burst size', fixed(r.burstSize)],
        ['bursts per minute', fixed(r.burstsPerMinute)],
        ['biggest burst', r.killBig],
        ['balls (avg / max / final)', `${fixed(r.ballsAvg, 1)} / ${r.ballsMax} / ${r.ballsFinal}`],
        ['largest cluster (avg / max)', `${fixed(r.clusterAvg, 2)} / ${r.clusterMax}`],
        ['throws (fired / blocked)', `${r.throws} / ${r.blockedThrows}`],
        ['invariants', invariantLine(r)],
      ]
    );
    if (r.burstSize > 0 && r.burstSize < 3) {
      console.log(`\nnote: mean burst size is ${fixed(r.burstSize)} — bursts are frequent but trivial.`);
      console.log('      Watch this next to bursts-per-minute; the rate alone hides it.');
    }
  }

  return results.every(r => violations(r.worst).length === 0) ? 0 : 1;
}

function cmdSweep(args: Args): number {
  const spec = args.positional[0];
  if (!spec || !spec.includes('=')) {
    fail('sweep needs knob=v1,v2,v3 — for example: sweep burst=0.2,0.4,0.6');
  }
  const id = spec.slice(0, spec.indexOf('='));
  if (!KNOBS[id]) fail(`Unknown knob "${id}". Try: npm run sim -- knobs`);
  const values = spec.slice(spec.indexOf('=') + 1).split(',').map(v => parseKnobValue(id, v.trim()));

  // Floored at 2, as `compare` is: a single run has no standard error to report,
  // and printing "±0.00" under a header about 2x the error invites exactly the
  // overreading the whole harness exists to prevent.
  const runs = Math.max(2, num(args.flags, 'runs', 5));
  const metricNames = String(args.flags.metrics ?? 'bursts,burstSize,score,ballsAvg,clusterMax')
    .split(',').map(s => s.trim()).filter(Boolean);
  for (const m of metricNames) if (!EXTRACTORS[m]) fail(`Unknown metric "${m}". Known: ${extractorNames().join(', ')}`);

  const base = simOptionsFrom(args);
  const rows: (string | number)[][] = [];
  const json: any[] = [];
  let ok = true;

  for (const v of values) {
    const results = runMany({ ...base, knobs: { ...(base.knobs || {}), [id]: v } }, runs, base.seed);
    const row: (string | number)[] = [`${id}=${v}`];
    const entry: any = { knob: id, value: v, runs, metrics: {} };

    for (const m of metricNames) {
      const est = estimate(results.map(extract(m)));
      row.push(`${fixed(est.mean)} ±${fixed(est.stderr)}`);
      entry.metrics[m] = { mean: est.mean, stderr: est.stderr, n: est.n };
    }
    const bad = results.filter(r => violations(r.worst).length);
    row.push(bad.length ? `${bad.length}/${runs} FAIL` : 'ok');
    if (bad.length) ok = false;
    entry.invariantFailures = bad.length;

    rows.push(row);
    json.push(entry);
  }

  if (args.flags.json) {
    console.log(JSON.stringify(json, null, 2));
    return ok ? 0 : 1;
  }

  console.log(`\nsweep ${id} — ${runs} runs per value, ${base.seconds}s each, mode=${base.mode}`);
  console.log('values are mean ± standard error; differences smaller than 2x the error are noise\n');
  table(['knob', ...metricNames, 'invariants'], rows);
  return ok ? 0 : 1;
}

function cmdCompare(args: Args): number {
  const a = parseSet(args.flags.a);
  const b = parseSet(args.flags.b);
  if (!Object.keys(a).length && !Object.keys(b).length) {
    fail('compare needs --a "knob=value" and --b "knob=value"');
  }
  const runs = Math.max(2, num(args.flags, 'runs', 20));
  const base = simOptionsFrom(args);
  const metricNames = String(args.flags.metrics ?? 'bursts,burstSize,score,clusterMax')
    .split(',').map(s => s.trim()).filter(Boolean);
  for (const m of metricNames) if (!EXTRACTORS[m]) fail(`Unknown metric "${m}". Known: ${extractorNames().join(', ')}`);

  const ra = runMany({ ...base, knobs: { ...(base.knobs || {}), ...a } }, runs, base.seed);
  const rb = runMany({ ...base, knobs: { ...(base.knobs || {}), ...b } }, runs, base.seed);

  const rows: (string | number)[][] = [];
  const json: any = { a, b, runs, metrics: {} };

  for (const m of metricNames) {
    const c = compare(ra.map(extract(m)), rb.map(extract(m)));
    rows.push([
      m,
      `${fixed(c.a.mean)} ±${fixed(c.a.stderr)}`,
      `${fixed(c.b.mean)} ±${fixed(c.b.stderr)}`,
      `${c.delta >= 0 ? '+' : ''}${fixed(c.delta)} ±${fixed(c.stderr)}`,
      c.verdict,
    ]);
    json.metrics[m] = c;
  }

  // Paired catch-up statistic: only meaningful when both launchers are playing.
  if (base.mode === 'duel' || base.mode === 'ai') {
    const gains = (rs: RunResult[]) => rs.map(r => catchUp(r.halfTimeScores, r.finalScores));
    const c = compare(gains(ra), gains(rb));
    const ea = estimate(gains(ra)), eb = estimate(gains(rb));
    json.catchUp = { a: ea, b: eb, comparison: c };
    rows.push([
      'catch-up (paired)',
      `${fixed(ea.mean)} ±${fixed(ea.stderr)}`,
      `${fixed(eb.mean)} ±${fixed(eb.stderr)}`,
      `${c.delta >= 0 ? '+' : ''}${fixed(c.delta)} ±${fixed(c.stderr)}`,
      c.verdict,
    ]);
  }

  if (args.flags.json) {
    console.log(JSON.stringify(json, null, 2));
    return 0;
  }

  const label = (o: Record<string, KnobValue>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ') || 'defaults';
  console.log(`\ncompare — ${runs} runs each, ${base.seconds}s, mode=${base.mode}`);
  console.log(`  A: ${label(a)}`);
  console.log(`  B: ${label(b)}`);
  console.log('\n"inside the noise" means the difference is smaller than 2x its standard error.');
  console.log('Do not report such a difference as an effect.\n');
  table(['metric', 'A', 'B', 'B - A', 'verdict'], rows);
  if (base.mode === 'duel' || base.mode === 'ai') {
    console.log('\ncatch-up measures each match against itself: ground the half-time trailer');
    console.log('recovered by the end. Positive is rubber banding, negative is snowballing.');
  }
  return 0;
}

function cmdInvariants(args: Args): number {
  const seconds = num(args.flags, 'seconds', 60);
  const rows: (string | number)[][] = [];
  let ok = true;

  for (const s of BASELINE_SCENARIOS) {
    const r = runSim({ ...s.opts, seconds });
    const bad = violations(r.worst);
    if (bad.length) ok = false;
    rows.push([
      s.label,
      fixed(r.worst.overlap, 4),
      r.worst.frozen.toExponential(1),
      fixed(r.worst.outside, 4),
      bad.length ? 'FAIL: ' + bad.join('; ') : 'ok',
    ]);
  }

  if (args.flags.json) {
    console.log(JSON.stringify({ ok, tolerance: TOLERANCE, rows }, null, 2));
    return ok ? 0 : 1;
  }

  console.log(`\ninvariants — every frame of every scenario, ${seconds}s each`);
  console.log(`tolerance: overlap <= ${TOLERANCE.overlap}px, frozen == 0, outside <= ${TOLERANCE.outside}px\n`);
  table(['scenario', 'overlap', 'frozen', 'outside', 'verdict'], rows);
  console.log(ok ? '\nall scenarios within tolerance' : '\nINVARIANTS VIOLATED');
  return ok ? 0 : 1;
}

function cmdPhysics(args: Args): number {
  const checks = runPhysicsChecks();
  const ok = checks.every(c => c.pass);

  if (args.flags.json) {
    console.log(JSON.stringify({ ok, checks }, null, 2));
    return ok ? 0 : 1;
  }

  console.log('\nphysics — textbook results for an impulse solver at restitution 1\n');
  table(
    ['check', 'measured', 'expected', 'tol', 'unit', ''],
    checks.map(c => [
      c.name,
      c.measured.toPrecision(6),
      String(c.expected),
      String(c.tolerance),
      c.unit,
      c.pass ? 'ok' : 'FAIL',
    ])
  );
  console.log(ok ? '\nall physics checks pass' : '\nPHYSICS CHECKS FAILED');
  return ok ? 0 : 1;
}

function cmdBaseline(args: Args): number {
  const action = args.positional[0] ?? 'check';
  if (action === 'save') {
    const file = measureBaseline();
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(file, null, 2) + '\n');
    console.log(`saved ${file.scenarios.length} scenarios to ${BASELINE_PATH}`);
    console.log('Commit this file alongside the change that justifies it.');
    return 0;
  }

  if (action !== 'check') fail('baseline takes "save" or "check"');
  if (!existsSync(BASELINE_PATH)) {
    console.error(`no baseline at ${BASELINE_PATH} — create one with: npm run sim -- baseline save`);
    return 2;
  }

  const saved: BaselineFile = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (saved.version !== BASELINE_VERSION) {
    console.error(`baseline is version ${saved.version}, this build expects ${BASELINE_VERSION} — re-save it`);
    return 2;
  }

  const tolerance = num(args.flags, 'tolerance', 0);
  const fresh = measureBaseline();
  const rows = diffBaseline(saved, fresh, tolerance);
  const breaking = rows.filter(r => !r.within);

  if (args.flags.json) {
    console.log(JSON.stringify({ ok: breaking.length === 0, tolerance, rows }, null, 2));
    return breaking.length ? 1 : 0;
  }

  if (!rows.length) {
    console.log(`\nbaseline matches exactly across ${saved.scenarios.length} scenarios.`);
    console.log('The change did not alter simulation behaviour.');
    return 0;
  }

  console.log(`\nbaseline differs — ${rows.length} metric(s) moved (tolerance ${tolerance}%)\n`);
  table(
    ['scenario', 'metric', 'before', 'after', 'delta', '%'],
    rows.map(r => [
      r.label, r.metric, r.before, r.after,
      `${r.delta >= 0 ? '+' : ''}${fixed(r.delta, 4)}`,
      r.percent === null ? '—' : `${r.percent >= 0 ? '+' : ''}${fixed(r.percent, 1)}%`,
    ])
  );
  console.log('\nIf these changes are what you intended, re-save the baseline:');
  console.log('  npm run sim -- baseline save');
  console.log('If any of them are a surprise, that is the bug.');
  return breaking.length ? 1 : 0;
}

function cmdKnobs(args: Args): number {
  if (args.flags.json) {
    console.log(JSON.stringify(
      Object.values(KNOBS).map(k => ({
        id: k.id, group: k.group, kind: k.kind, min: k.min, max: k.max,
        step: k.step, default: k.default, options: k.options, cosmetic: !!k.cosmetic,
      })), null, 2));
    return 0;
  }
  console.log('\nknobs — usable as --set id=value, or as a sweep target\n');
  table(
    ['id', 'group', 'range', 'default', 'affects sim'],
    Object.values(KNOBS).map(k => [
      k.id,
      k.group,
      k.kind === 'select' ? (k.options || []).join('|') : `${k.min} .. ${k.max} step ${k.step}`,
      String(k.default),
      k.cosmetic ? 'no' : 'yes',
    ])
  );
  return 0;
}

function cmdMetrics(args: Args): number {
  if (args.flags.json) {
    console.log(JSON.stringify(extractorNames(), null, 2));
    return 0;
  }
  console.log('\nmetrics — usable as --metrics a,b,c on sweep and compare\n');
  for (const name of extractorNames()) console.log('  ' + name);
  return 0;
}

function cmdHelp(): number {
  console.log(`
tone-boom simulation harness

  npm run sim -- <command> [options]

Commands
  run                      Run one configuration and report on it
  sweep <knob>=<v,v,v>     Run a knob across values, with error bars
  compare --a <k=v> --b    Compare two configurations on paired statistics
  invariants               Assert the geometric invariants on every frame
  physics                  Assert textbook results for the collision solver
  baseline save|check      Record or verify exact simulation behaviour
  knobs                    List every tunable knob, its range and default
  metrics                  List the metrics sweep and compare can report

Common options
  --mode solo|duel|ai|idle   Who is playing (default solo; idle throws nothing)
  --seed <n>                 Seed (default 1). Runs are exactly reproducible.
  --seconds <n>              Simulated seconds (default 60)
  --width / --height <px>    Field size (default 380x620)
  --set a=1,b=2              Knob overrides
  --runs <n>                 Repeats, for sweep and compare
  --metrics a,b,c            Which metrics to report
  --policy engine-ai|fixed|random|sweep
  --json                     Machine-readable output
  --tolerance <pct>          baseline check: allowed drift (default 0, exact)

Examples
  npm run sim -- run --mode ai --seconds 120
  npm run sim -- sweep burst=0.2,0.4,0.6,0.8 --runs 10
  npm run sim -- compare --a kickout=0.5 --b kickout=1.0 --runs 30 --mode duel
  npm run sim -- baseline check

Exit codes: 0 pass, 1 measurement failed, 2 usage error.
`);
  return 0;
}

// ----------------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
const commands: Record<string, (a: Args) => number> = {
  run: cmdRun,
  sweep: cmdSweep,
  compare: cmdCompare,
  invariants: cmdInvariants,
  physics: cmdPhysics,
  baseline: cmdBaseline,
  knobs: cmdKnobs,
  metrics: cmdMetrics,
  help: cmdHelp,
};

const handler = commands[args.command];
if (!handler) {
  console.error(`unknown command "${args.command}"`);
  cmdHelp();
  process.exit(2);
}
process.exit(handler(args));
