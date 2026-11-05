// Steps of the Intent coord-route-honours-cancellation. A generated Go driver (package main, in a
// temporary dot-prefixed folder of the module, built once with go build) routes a scripted fake
// route.Steps through route.Cycle or route.Resume. The fake traces every step call in order (the
// trace format of route/route_test.go) and cancels its context inside a chosen step call, or
// waits inside one for the context's deadline. The driver prints one line ROUTE_RESULT=<JSON>:
// the trace, the error text and, for Cycle, the feedback and landed. observe() compares it with
// the expected object in the feature file.
//
// Observer controls: `node features/steps/coord-route-honours-cancellation__driver.js good|bad`
// judges recorded driver observations (good: a candidate implementation; bad: today's code)
// against the expectations parsed from the feature file, one line per case; it exits 0 when
// every case is accepted and 1 otherwise.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-route-honours-cancellation';

function observe(name, actual, expected) {
  assert.deepEqual(actual, expected, `case ${name}: observed ${JSON.stringify(actual)}`);
}

const known = {
  good: {
    'cycle-green': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-red': {"error":"","feedback":"fix it","landed":false,"trace":["verify builder=yes"]},
    'cycle-drifted-once': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-cancel-in-verify': {"error":"context canceled","feedback":"","landed":false,"trace":["verify builder=yes"]},
    'cycle-cancel-in-review': {"error":"context canceled","feedback":"","landed":false,"trace":["verify builder=yes","review green"]},
    'cycle-cancel-in-commit': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-cancel-after-drift': {"error":"context canceled","feedback":"","landed":false,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-cancelled-before-start': {"error":"context canceled","feedback":"","landed":false,"trace":[]},
    'cycle-deadline-in-verify': {"error":"context deadline exceeded","feedback":"","landed":false,"trace":["verify builder=yes"]},
    'cycle-red-cancel-in-verify': {"error":"","feedback":"fix it","landed":false,"trace":["verify builder=yes"]},
    'resume-commit-failed-cancel-in-approved': {"error":"context canceled","trace":["approved"]},
    'resume-commit-failed-cancel-in-commit': {"error":"","trace":["approved","commit approved saved (no restart)"]},
    'resume-commit-failed-cancelled-before-start': {"error":"context canceled","trace":[]},
    'resume-review-only-cancel-in-fresh': {"error":"context canceled","trace":["fresh review_only"]},
    'resume-review-only-cancel-in-review': {"error":"context canceled","trace":["fresh review_only","review base"]},
    'resume-review-only-cancel-in-commit': {"error":"","trace":["fresh review_only","review base","commit approved base"]},
    'resume-review-only-cancel-after-drift': {"error":"context canceled","trace":["fresh review_only","review base","commit approved base"]},
    'resume-review-only-cancelled-before-start': {"error":"context canceled","trace":[]},
    'resume-continuing-cancel-in-continue': {"error":"context canceled","trace":["continue"]},
    'resume-continuing-cancel-in-commit': {"error":"","trace":["continue","commit approved saved"]},
    'resume-continuing-cancel-after-drift': {"error":"context canceled","trace":["continue","commit approved saved"]},
    'resume-continuing-cancelled-before-start': {"error":"context canceled","trace":[]}
  },
  bad: {
    'cycle-green': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-red': {"error":"","feedback":"fix it","landed":false,"trace":["verify builder=yes"]},
    'cycle-drifted-once': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-cancel-in-verify': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-cancel-in-review': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-cancel-in-commit': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-cancel-after-drift': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green","verify builder=no","review green","commit approved green"]},
    'cycle-cancelled-before-start': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-deadline-in-verify': {"error":"","feedback":"","landed":true,"trace":["verify builder=yes","review green","commit approved green"]},
    'cycle-red-cancel-in-verify': {"error":"","feedback":"fix it","landed":false,"trace":["verify builder=yes"]},
    'resume-commit-failed-cancel-in-approved': {"error":"","trace":["approved","commit approved saved (no restart)"]},
    'resume-commit-failed-cancel-in-commit': {"error":"","trace":["approved","commit approved saved (no restart)"]},
    'resume-commit-failed-cancelled-before-start': {"error":"","trace":["approved","commit approved saved (no restart)"]},
    'resume-review-only-cancel-in-fresh': {"error":"","trace":["fresh review_only","review base","commit approved base"]},
    'resume-review-only-cancel-in-review': {"error":"","trace":["fresh review_only","review base","commit approved base"]},
    'resume-review-only-cancel-in-commit': {"error":"","trace":["fresh review_only","review base","commit approved base"]},
    'resume-review-only-cancel-after-drift': {"error":"","trace":["fresh review_only","review base","commit approved base","verify builder=no","review green","commit approved green"]},
    'resume-review-only-cancelled-before-start': {"error":"","trace":["fresh review_only","review base","commit approved base"]},
    'resume-continuing-cancel-in-continue': {"error":"","trace":["continue","commit approved saved"]},
    'resume-continuing-cancel-in-commit': {"error":"","trace":["continue","commit approved saved"]},
    'resume-continuing-cancel-after-drift': {"error":"","trace":["continue","commit approved saved","verify builder=no","review green","commit approved green"]},
    'resume-continuing-cancelled-before-start': {"error":"","trace":["continue","commit approved saved"]}
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
	"time"

	"github.com/KogenAI/kogen-coordinator/route"
)

// fake is route.Steps over a scripted Build: evidence is the candidate's tree, an approval the
// tree it approves. Every step call is traced in order. Inside the call "<kind> <n>" named by
// cancelIn it cancels the context; inside the one named by waitIn it waits for the context's end.
type fake struct {
	trace      []string
	passes     []bool // the green of each Verify, in order
	drifts     []bool // the drift of each Commit with restart, in order
	continuing bool
	cancelIn   string
	waitIn     string
	cancel     context.CancelFunc
	calls      map[string]int
}

func (f *fake) step(ctx context.Context, kind, line string) {
	f.trace = append(f.trace, line)
	f.calls[kind]++
	at := fmt.Sprintf("%s %d", kind, f.calls[kind])
	if at == f.cancelIn {
		f.cancel()
	}
	if at == f.waitIn {
		<-ctx.Done()
	}
}

func (f *fake) Verify(ctx context.Context, builderPass bool) (string, bool, string, error) {
	f.step(ctx, "verify", "verify builder="+map[bool]string{true: "yes", false: "no"}[builderPass])
	if len(f.passes) == 0 {
		return "", false, "", errors.New("fake: no scripted verify")
	}
	green := f.passes[0]
	f.passes = f.passes[1:]
	if !green {
		return "red", false, "fix it", nil
	}
	return "green", true, "", nil
}

func (f *fake) Review(ctx context.Context, evidence string) (string, error) {
	f.step(ctx, "review", "review "+evidence)
	return "approved " + evidence, nil
}

func (f *fake) Continue(ctx context.Context) (string, error) {
	f.step(ctx, "continue", "continue")
	return "approved saved", nil
}

func (f *fake) Continuable() bool { return f.continuing }

func (f *fake) Fresh(ctx context.Context, stage string) (string, error) {
	f.step(ctx, "fresh", "fresh "+stage)
	return "base", nil
}

func (f *fake) Approved(ctx context.Context) (string, error) {
	f.step(ctx, "approved", "approved")
	return "approved saved", nil
}

func (f *fake) Commit(ctx context.Context, approval string, restart bool) (bool, error) {
	f.step(ctx, "commit", "commit "+approval+map[bool]string{true: "", false: " (no restart)"}[restart])
	if !restart {
		return false, nil
	}
	drift := len(f.drifts) > 0 && f.drifts[0]
	if len(f.drifts) > 0 {
		f.drifts = f.drifts[1:]
	}
	return drift, nil
}

type spec struct {
	resume     string // the stage of a Resume; empty: a Cycle with builderPass true
	passes     []bool
	drifts     []bool
	continuing bool
	cancelIn   string
	waitIn     string
	precancel  bool // the context is cancelled before the call
	deadline   bool // the context has a deadline of 100ms
}

var cases = map[string]spec{
	"cycle-green":                  {passes: []bool{true}, drifts: []bool{false}},
	"cycle-red":                    {passes: []bool{false}},
	"cycle-drifted-once":           {passes: []bool{true, true}, drifts: []bool{true, false}},
	"cycle-cancel-in-verify":       {passes: []bool{true}, cancelIn: "verify 1"},
	"cycle-cancel-in-review":       {passes: []bool{true}, cancelIn: "review 1"},
	"cycle-cancel-in-commit":       {passes: []bool{true}, drifts: []bool{false}, cancelIn: "commit 1"},
	"cycle-cancel-after-drift":     {passes: []bool{true, true}, drifts: []bool{true, false}, cancelIn: "commit 1"},
	"cycle-cancelled-before-start": {passes: []bool{true}, precancel: true},
	"cycle-deadline-in-verify":     {passes: []bool{true}, waitIn: "verify 1", deadline: true},
	"cycle-red-cancel-in-verify":   {passes: []bool{false}, cancelIn: "verify 1"},

	"resume-commit-failed-cancel-in-approved":     {resume: route.StageCommitFailed, continuing: true, cancelIn: "approved 1"},
	"resume-commit-failed-cancel-in-commit":       {resume: route.StageCommitFailed, continuing: true, cancelIn: "commit 1"},
	"resume-commit-failed-cancelled-before-start": {resume: route.StageCommitFailed, continuing: true, precancel: true},

	"resume-review-only-cancel-in-fresh":          {resume: route.StageReviewOnly, continuing: true, cancelIn: "fresh 1"},
	"resume-review-only-cancel-in-review":         {resume: route.StageReviewOnly, continuing: true, cancelIn: "review 1"},
	"resume-review-only-cancel-in-commit":         {resume: route.StageReviewOnly, continuing: true, drifts: []bool{false}, cancelIn: "commit 1"},
	"resume-review-only-cancel-after-drift":       {resume: route.StageReviewOnly, continuing: true, passes: []bool{true}, drifts: []bool{true, false}, cancelIn: "commit 1"},
	"resume-review-only-cancelled-before-start":   {resume: route.StageReviewOnly, continuing: true, precancel: true},

	"resume-continuing-cancel-in-continue":        {resume: route.StageReview, continuing: true, cancelIn: "continue 1"},
	"resume-continuing-cancel-in-commit":          {resume: route.StageReview, continuing: true, drifts: []bool{false}, cancelIn: "commit 1"},
	"resume-continuing-cancel-after-drift":        {resume: route.StageReview, continuing: true, passes: []bool{true}, drifts: []bool{true, false}, cancelIn: "commit 1"},
	"resume-continuing-cancelled-before-start":    {resume: route.StageReview, continuing: true, precancel: true},
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
	if c.deadline {
		ctx, cancel = context.WithTimeout(ctx, 100*time.Millisecond)
		defer cancel()
	}
	f := &fake{passes: c.passes, drifts: c.drifts, continuing: c.continuing, cancelIn: c.cancelIn, waitIn: c.waitIn, cancel: cancel, calls: map[string]int{}, trace: []string{}}
	if c.precancel {
		cancel()
	}
	out := map[string]any{}
	if c.resume == "" {
		feedback, landed, err := route.Cycle[string, string](ctx, f, true)
		out["feedback"], out["landed"], out["error"] = feedback, landed, errText(err)
	} else {
		out["error"] = errText(route.Resume[string, string](ctx, f, c.resume))
	}
	out["trace"] = f.trace
	b, err := json.Marshal(out)
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
