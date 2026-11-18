// Steps of the Intent coord-route-bounds-drifted-approval-restarts. A generated Go driver
// (package main, in a temporary dot-prefixed folder of the module, built once with go build)
// routes a scripted fake route.Steps through route.Cycle or route.Resume. The fake traces every
// step call in order (the trace format of route/route_test.go) and returns the error
// "fake: runaway" at its ninth Verify, so a routing without a bound ends. The driver prints one
// line ROUTE_RESULT=<JSON>: the trace and one entry per call. observe() compares it with the
// expected object in the feature file.
//
// Observer controls: `node features/steps/coord-route-bounds-drifted-approval-restarts__driver.js good|bad`
// judges recorded driver observations (good: a candidate with the bound; bad: today's code)
// against the expectations parsed from the feature file, one line per case; it exits 0 when
// every case is accepted and 1 otherwise.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-route-bounds-drifted-approval-restarts';

function observe(name, actual, expected) {
  assert.deepEqual(actual, expected, `case ${name}: observed ${JSON.stringify(actual)}`);
}

const known = {
  good: {
    'cycle-always-drifted': {"calls":[{"error":"candidate changed after review 3 times before the commit; the last verification evidence is kept","feedback":"","landed":false}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-lands-after-two-drifts': {"calls":[{"error":"","feedback":"","landed":true}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-drift-count-resets-per-call': {"calls":[{"error":"","feedback":"","landed":true},{"error":"","feedback":"","landed":true}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'resume-always-drifted': {"calls":[{"error":"candidate changed after review 3 times before the commit; the last verification evidence is kept"}],"trace":["continue","commit approved saved","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-drift-then-cancel': {"calls":[{"error":"context canceled","feedback":"","landed":false}],"trace":["verify builder=yes","review green","commit approved green"]},
    'resume-drift-then-red': {"calls":[{"error":"candidate changed after review in a resumed commit: fix it"}],"trace":["continue","commit approved saved","verify builder=no"]}
  },
  bad: {
    'cycle-always-drifted': {"calls":[{"error":"fake: runaway","feedback":"","landed":false}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no"]},
    'cycle-lands-after-two-drifts': {"calls":[{"error":"","feedback":"","landed":true}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-drift-count-resets-per-call': {"calls":[{"error":"","feedback":"","landed":true},{"error":"","feedback":"","landed":true}],"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'resume-always-drifted': {"calls":[{"error":"fake: runaway"}],"trace":["continue","commit approved saved","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no","review green","commit approved green","verify builder=no"]},
    'cycle-drift-then-cancel': {"calls":[{"error":"context canceled","feedback":"","landed":false}],"trace":["verify builder=yes","review green","commit approved green"]},
    'resume-drift-then-red': {"calls":[{"error":"candidate changed after review in a resumed commit: fix it"}],"trace":["continue","commit approved saved","verify builder=no"]}
  }
};

// expectations reads, from the feature file, the doc string that follows each case's When step.
function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const out = {};
  const re = /the driver runs the "([a-z-]+)" case\s*\n\s*Then [^\n]*the outcome is\s*\n\s*"""\n([\s\S]*?)\n\s*"""/g;
  for (const m of feature.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

function control(kind) {
  const expected = expectations();
  let all = true;
  for (const c of Object.keys(expected)) {
    let accepted;
    try { observe(c, known[kind][c], expected[c]); accepted = true; } catch (_) { accepted = false; }
    console.log((accepted ? 'accepted ' : 'rejected ') + c);
    if (!accepted) all = false;
  }
  process.exit(all ? 0 : 1);
}

const driver = String.raw`
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/route"
)

// fake is route.Steps over a scripted Build: evidence is always "green", an approval is
// "approved <evidence>". Every step call is traced in order. Verify is always green, except that
// a scripted red answers once the greens are used. The Commit with restart reports the scripted
// drifts in order, then rest. Inside the Commit call numbered cancelIn it cancels the context.
type fake struct {
	trace    []string
	greens   []bool
	drifts   []bool
	rest     bool
	cancelIn int
	cancel   context.CancelFunc
	verifies int
	commits  int
}

func (f *fake) Verify(ctx context.Context, builderPass bool) (string, bool, string, error) {
	f.trace = append(f.trace, "verify builder="+map[bool]string{true: "yes", false: "no"}[builderPass])
	f.verifies++
	if f.verifies > 8 {
		return "", false, "", errors.New("fake: runaway")
	}
	if len(f.greens) > 0 {
		green := f.greens[0]
		f.greens = f.greens[1:]
		if !green {
			return "red", false, "fix it", nil
		}
	}
	return "green", true, "", nil
}

func (f *fake) Review(ctx context.Context, evidence string) (string, error) {
	f.trace = append(f.trace, "review "+evidence)
	return "approved " + evidence, nil
}

func (f *fake) Continue(ctx context.Context) (string, error) {
	f.trace = append(f.trace, "continue")
	return "approved saved", nil
}

func (f *fake) Continuable() bool { return true }

func (f *fake) Fresh(ctx context.Context, stage string) (string, error) {
	f.trace = append(f.trace, "fresh "+stage)
	return "base", nil
}

func (f *fake) Approved(ctx context.Context) (string, error) {
	f.trace = append(f.trace, "approved")
	return "approved saved", nil
}

func (f *fake) Commit(ctx context.Context, approval string, restart bool) (bool, error) {
	f.trace = append(f.trace, "commit "+approval+map[bool]string{true: "", false: " (no restart)"}[restart])
	f.commits++
	if f.commits == f.cancelIn {
		f.cancel()
	}
	if !restart {
		return false, nil
	}
	drift := f.rest
	if len(f.drifts) > 0 {
		drift = f.drifts[0]
		f.drifts = f.drifts[1:]
	}
	return drift, nil
}

type spec struct {
	resume   string // the stage of a Resume; empty: Cycle calls with builderPass true
	calls    int    // the number of Cycle calls on the same fake
	greens   []bool
	drifts   []bool
	rest     bool
	cancelIn int
}

var cases = map[string]spec{
	"cycle-always-drifted":              {calls: 1, rest: true},
	"cycle-lands-after-two-drifts":      {calls: 1, drifts: []bool{true, true, false}},
	"cycle-drift-count-resets-per-call": {calls: 2, drifts: []bool{true, true, false, true, true, false}},
	"resume-always-drifted":             {resume: route.StageReview, rest: true},
	"cycle-drift-then-cancel":           {calls: 1, drifts: []bool{true, false}, cancelIn: 1},
	"resume-drift-then-red":             {resume: route.StageReview, drifts: []bool{true}, greens: []bool{false}},
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func main() {
	name := os.Getenv("ROUTE_CASE")
	c, ok := cases[name]
	if !ok {
		fmt.Fprintf(os.Stderr, "driver: unknown case %q\n", name)
		os.Exit(2)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	f := &fake{greens: c.greens, drifts: c.drifts, rest: c.rest, cancelIn: c.cancelIn, cancel: cancel, trace: []string{}}
	calls := []map[string]any{}
	if c.resume == "" {
		for i := 0; i < c.calls; i++ {
			feedback, landed, err := route.Cycle[string, string](ctx, f, true)
			calls = append(calls, map[string]any{"feedback": feedback, "landed": landed, "error": errText(err)})
		}
	} else {
		calls = append(calls, map[string]any{"error": errText(route.Resume[string, string](ctx, f, c.resume))})
	}
	b, err := json.Marshal(map[string]any{"trace": f.trace, "calls": calls})
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver:", err)
		os.Exit(2)
	}
	fmt.Printf("ROUTE_RESULT=%s\n", b)
}
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// built is the driver binary, built once per process in a temporary folder of the module that is
// removed when the process exits.
let built = null;
function binary() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'main.go'), driver);
  const out = path.join(dir, 'route-driver');
  const build = cp.spawnSync('go', ['build', '-o', out, './' + path.basename(dir)], {
    encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
  });
  const buildOutput = (build.stdout || '') + (build.stderr || '');
  assert.equal(build.status, 0, `go build -o ${out} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${buildOutput}`);
  built = out;
  return built;
}

// run runs one case of the driver and returns the parsed observation.
function run(name) {
  const bin = binary();
  const result = cp.spawnSync(bin, [], {
    encoding: 'utf8', timeout: 60000, env: { ...gitFreeEnv(), ROUTE_CASE: name }
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.equal(result.status, 0, `${bin} (ROUTE_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
  const rows = output.split('\n').filter(s => s.startsWith('ROUTE_RESULT='));
  assert.equal(rows.length, 1, `${bin} (ROUTE_CASE=${name}) must print exactly one ROUTE_RESULT line: ${output}`);
  return JSON.parse(rows[0].slice('ROUTE_RESULT='.length));
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');
  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    this.routeCase = name;
    this.routeObservation = run(name);
  });
  Then(SLUG + ': the outcome is', function (docString) {
    observe(this.routeCase, this.routeObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'good' || kind === 'bad') control(kind);
  else if (kind === 'print') {
    const all = {};
    for (const name of process.argv.slice(3)) all[name] = run(name);
    console.log(JSON.stringify(all));
  } else { console.log('usage: good|bad|print <case>...'); process.exit(2); }
} else {
  register();
}
