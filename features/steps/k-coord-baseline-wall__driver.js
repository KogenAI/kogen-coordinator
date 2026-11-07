// Steps of the Intent k-coord-baseline-wall. A generated Go driver (package main, in a temporary
// dot-prefixed folder of the module, built once with go build) calls the public API of the
// project package and prints one line BASELINE_RESULT=<JSON> with what it observed:
//
// - "complete" and "deadline": project.RunCheckBaseline with a runner that runs each check's
//   command with `sh -c` in its own process group (killed when the context ends). "deadline"
//   gives the run a 500 ms deadline and a check that sleeps 5 s. The driver prints the record as
//   json.Marshal writes it, the error text, errors.Is(err, context.DeadlineExceeded), whether the
//   error is context.DeadlineExceeded itself, the *project.BaselineStop errors.As finds (nil if
//   none) and the names of the checks the runner was called for, in order.
// - "approval": project.Baseline and project.Hash for a fixed fixture with the team lineup.
//
// observe() turns that raw result into the observation the feature file states: exact values
// where the result is deterministic, and the timing properties (UTC instants, wall_ms matching
// its instants, intervals inside the baseline and in order, wall times covering each command's
// sleep, check wall times adding up to the baseline's) as booleans. A driver that did not build
// or did not run is observed as {"driver": "<what happened>"}.
//
// Observer controls: `node features/steps/k-coord-baseline-wall__driver.js good|bad` judges
// recorded raw driver results (good: a correct candidate; bad: a wrong one that still builds)
// against the expectations parsed from the feature file, one line per case; it exits 0 when every
// case is accepted and 1 otherwise.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'k-coord-baseline-wall';

// ns is an RFC 3339 UTC instant ("Z" only) in nanoseconds since the epoch, or null.
function ns(s) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  return BigInt(Date.parse(m[1] + 'Z')) * 1000000n + BigInt((m[2] || '').padEnd(9, '0'));
}

function utc(...values) { return values.every(v => ns(v) !== null); }

// matches: wall_ms equals the milliseconds between the two instants, within 2 ms.
function matches(start, end, wall) {
  const a = ns(start), b = ns(end);
  if (a === null || b === null || !Number.isInteger(wall)) return false;
  const d = Number(b - a) / 1e6 - wall;
  return d >= -2 && d <= 2;
}

function inside(start, end, outerStart, outerEnd) {
  const a = ns(start), b = ns(end), c = ns(outerStart), d = ns(outerEnd);
  return a !== null && b !== null && c !== null && d !== null && a >= c && b <= d && a <= b;
}

function sleepMS(command) {
  const m = /sleep ([0-9.]+)/.exec(command || '');
  return m ? Math.round(parseFloat(m[1]) * 1000) : 0;
}

function observe(raw) {
  if (raw.driver !== undefined) return { driver: raw.driver };
  if (raw.case === 'approval') return { baseline: raw.baseline, hash: raw.hash };
  const rec = raw.record || {};
  const checks = rec.checks;
  const timings = Array.isArray(rec.timings) ? rec.timings : [];
  const commandOf = name => ((Array.isArray(checks) ? checks : []).find(c => c && c.name === name) || {}).command;
  let previousEnd = rec.started_at;
  let sum = 0;
  const timed = timings.map(t => {
    const row = {
      name: t.name,
      keys: Object.keys(t).sort(),
      instants_utc: utc(t.started_at, t.ended_at),
      wall_ms_matches_instants: matches(t.started_at, t.ended_at, t.wall_ms),
      within_baseline: inside(t.started_at, t.ended_at, rec.started_at, rec.ended_at),
      after_previous_check: ns(t.started_at) !== null && ns(previousEnd) !== null && ns(t.started_at) >= ns(previousEnd),
      wall_ms_covers_sleep: Number.isInteger(t.wall_ms) && t.wall_ms >= sleepMS(commandOf(t.name))
    };
    previousEnd = t.ended_at;
    sum += Number.isInteger(t.wall_ms) ? t.wall_ms : NaN;
    return row;
  });
  let stop = null;
  if (raw.stop) {
    const s = raw.stop;
    stop = {
      check: s.check,
      command: s.command,
      instants_utc: utc(s.started_at, s.stopped_at),
      wall_ms_matches_instants: matches(s.started_at, s.stopped_at, s.wall_ms),
      within_baseline: inside(s.started_at, s.stopped_at, rec.started_at, rec.ended_at),
      after_previous_check: ns(s.started_at) !== null && ns(previousEnd) !== null && ns(s.started_at) >= ns(previousEnd),
      ran_until_the_deadline: Number.isInteger(s.wall_ms) && s.wall_ms >= 300 && s.wall_ms < 4000
    };
    sum += Number.isInteger(s.wall_ms) ? s.wall_ms : NaN;
  }
  const total = rec.wall_ms;
  return {
    error: String(raw.error).replace(/ ran \d+ ms/, ' ran <n> ms'),
    deadline_exceeded: raw.deadline_exceeded,
    plain_deadline_error: raw.plain_deadline_error,
    stop,
    ran: raw.ran,
    record_keys: Object.keys(rec).sort(),
    checks,
    baseline: {
      instants_utc: utc(rec.started_at, rec.ended_at),
      wall_ms_matches_instants: matches(rec.started_at, rec.ended_at, total)
    },
    timings: timed,
    check_walls_add_up_to_baseline_wall: Number.isInteger(total) && sum - total <= 2 && total - sum <= 200
  };
}

const known = {
  good: {"complete": {"case": "complete", "deadline_exceeded": false, "error": "", "plain_deadline_error": false, "ran": ["lint", "unit", "fast"], "record": {"checks": [{"name": "lint", "command": "sleep 0.4; echo lint ok", "status": 0, "output": "lint ok\n"}, {"name": "unit", "command": "sleep 0.3; echo unit failed >&2; exit 3", "status": 3, "output": "unit failed\n"}, {"name": "fast", "command": "true", "status": 0, "output": ""}], "started_at": "2026-11-07T08:07:00.692682847Z", "ended_at": "2026-11-07T08:07:01.402201632Z", "wall_ms": 709, "timings": [{"name": "lint", "started_at": "2026-11-07T08:07:00.692682928Z", "ended_at": "2026-11-07T08:07:01.09513893Z", "wall_ms": 402}, {"name": "unit", "started_at": "2026-11-07T08:07:01.09515535Z", "ended_at": "2026-11-07T08:07:01.39988922Z", "wall_ms": 304}, {"name": "fast", "started_at": "2026-11-07T08:07:01.39994485Z", "ended_at": "2026-11-07T08:07:01.402184382Z", "wall_ms": 2}]}, "stop": null}, "deadline": {"case": "deadline", "deadline_exceeded": true, "error": "stopped during the check baseline: check slow (sleep 5) ran 499 ms: context deadline exceeded", "plain_deadline_error": false, "ran": ["fast", "slow"], "record": {"checks": [{"name": "fast", "command": "true", "status": 0, "output": ""}], "started_at": "2026-11-07T08:07:01.411338349Z", "ended_at": "2026-11-07T08:07:01.913655535Z", "wall_ms": 502, "timings": [{"name": "fast", "started_at": "2026-11-07T08:07:01.411338508Z", "ended_at": "2026-11-07T08:07:01.413967812Z", "wall_ms": 2}]}, "stop": {"check": "slow", "command": "sleep 5", "started_at": "2026-11-07T08:07:01.414003691Z", "stopped_at": "2026-11-07T08:07:01.913655535Z", "wall_ms": 499}}, "approval": {"baseline": [".kogen/intents/fixture/intent.md", ".kogen/intents/fixture/acceptance.feature", "features/steps/z.js", "features/steps/a.js", ".kogen/intents/fixture/notes.md", ".kogen/project.yaml", ".kogen/models.yaml"], "case": "approval", "hash": "99315376c144923504469cbce0ff863676fcb1a1fe541506d48f22904a2aa33d"}},
  bad: {"complete": {"case": "complete", "deadline_exceeded": false, "error": "", "plain_deadline_error": false, "ran": ["lint", "unit", "fast"], "record": {"checks": [{"name": "lint", "command": "sleep 0.4; echo lint ok", "status": 0, "output": "lint ok\n"}, {"name": "unit", "command": "sleep 0.3; echo unit failed >&2; exit 3", "status": 3, "output": "unit failed\n"}, {"name": "fast", "command": "true", "status": 0, "output": ""}], "started_at": "2026-11-07T08:07:07.071212534Z", "ended_at": "2026-11-07T08:07:07.780636612Z", "wall_ms": 709, "timings": [{"name": "lint", "started_at": "2026-11-07T08:07:07.071212534Z", "ended_at": "2026-11-07T08:07:07.473615758Z", "wall_ms": 402}, {"name": "unit", "started_at": "2026-11-07T08:07:07.071212534Z", "ended_at": "2026-11-07T08:07:07.778133639Z", "wall_ms": 706}, {"name": "fast", "started_at": "2026-11-07T08:07:07.071212534Z", "ended_at": "2026-11-07T08:07:07.780600982Z", "wall_ms": 709}]}, "stop": null}, "deadline": {"case": "deadline", "deadline_exceeded": true, "error": "context deadline exceeded", "plain_deadline_error": true, "ran": ["fast", "slow"], "record": {"checks": [{"name": "fast", "command": "true", "status": 0, "output": ""}], "started_at": "2026-11-07T08:07:07.790056898Z", "ended_at": "2026-11-07T08:07:08.292708712Z", "wall_ms": 502, "timings": [{"name": "fast", "started_at": "2026-11-07T08:07:07.790056898Z", "ended_at": "2026-11-07T08:07:07.79239679Z", "wall_ms": 2}]}, "stop": null}, "approval": {"baseline": [".kogen/intents/fixture/intent.md", ".kogen/intents/fixture/acceptance.feature", "features/steps/z.js", "features/steps/a.js", ".kogen/intents/fixture/notes.md", ".kogen/project.yaml"], "case": "approval", "hash": "5595d05c6cc03ab2427b84eae8598d3ba2497d2ce01c6e0bfe8ed8437d4bd947"}}
};

// expectations reads, from the feature file, the doc string that follows each case's When step.
function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const out = {};
  const re = /the driver runs the "([a-z]+)" case\s*\n\s*Then [^\n]*the observation is\s*\n\s*"""\n([\s\S]*?)\n\s*"""/g;
  for (const m of feature.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

function control(kind) {
  const expected = expectations();
  let all = Object.keys(expected).length === 3;
  for (const c of Object.keys(expected)) {
    let accepted;
    try { assert.deepEqual(observe(known[kind][c]), expected[c]); accepted = true; } catch (_) { accepted = false; }
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
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-coordinator/project"
)

// runner runs a check's command with sh -c in its own process group, killed when ctx ends, and
// appends the check's name to ran. A nonzero exit is a status; a run that ctx ended is an error.
func runner(ran *[]string) project.CheckRunner {
	return func(ctx context.Context, c project.Check) (int, string, error) {
		*ran = append(*ran, c.Name)
		cmd := exec.CommandContext(ctx, "sh", "-c", c.Run)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
		cmd.WaitDelay = time.Second
		out, err := cmd.CombinedOutput()
		var exit *exec.ExitError
		if errors.As(err, &exit) && ctx.Err() == nil {
			return exit.ExitCode(), string(out), nil
		}
		return 0, string(out), err
	}
}

func checkBaseline(name string) map[string]any {
	ctx := context.Background()
	var checks []project.Check
	switch name {
	case "complete":
		checks = []project.Check{
			{Name: "lint", Run: "sleep 0.4; echo lint ok"},
			{Name: "unit", Run: "sleep 0.3; echo unit failed >&2; exit 3"},
			{Name: "fast", Run: "true"},
		}
	case "deadline":
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 500*time.Millisecond)
		defer cancel()
		checks = []project.Check{
			{Name: "fast", Run: "true"},
			{Name: "slow", Run: "sleep 5"},
			{Name: "after", Run: "true"},
		}
	}
	ran := []string{}
	rec, err := project.RunCheckBaseline(ctx, checks, runner(&ran))
	record, merr := json.Marshal(rec)
	if merr != nil {
		fmt.Fprintln(os.Stderr, "driver:", merr)
		os.Exit(2)
	}
	out := map[string]any{"case": name, "record": json.RawMessage(record), "error": "", "ran": ran,
		"deadline_exceeded": errors.Is(err, context.DeadlineExceeded), "plain_deadline_error": err == context.DeadlineExceeded, "stop": nil}
	if err != nil {
		out["error"] = err.Error()
	}
	var stop *project.BaselineStop
	if errors.As(err, &stop) {
		out["stop"] = map[string]any{"check": stop.Check, "command": stop.Command, "started_at": stop.StartedAt,
			"stopped_at": stop.StoppedAt, "wall_ms": stop.WallMS}
	}
	return out
}

func approval() map[string]any {
	root, err := os.MkdirTemp("", "kcbw-approval-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver:", err)
		os.Exit(2)
	}
	defer os.RemoveAll(root)
	files := map[string]string{
		".kogen/project.yaml": "version: 1\ncommands:\n  acceptance:\n    run: sh accept.sh\n    steps_dir: features/steps\n",
		".kogen/models.yaml":  "models:\n  build:\n    provider: chatgpt\n    model: gpt-5.5\n",
		".kogen/intents/fixture/intent.md": "# Fixture intent\n\nSlug: fixture\nModel: not applicable\nAcceptance:\n" +
			"- .kogen/intents/fixture/acceptance.feature\n- features/steps/z.js\n- features/steps/a.js\n",
		".kogen/intents/fixture/acceptance.feature": "Feature: Fixture\n  Scenario: First\n    Then the candidate succeeds\n",
		".kogen/intents/fixture/notes.md":           "notes\n",
		"features/steps/z.js":                       "// z\n",
		"features/steps/a.js":                       "// a\n",
	}
	for p, content := range files {
		full := filepath.Join(root, p)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			fmt.Fprintln(os.Stderr, "driver:", err)
			os.Exit(2)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, "driver:", err)
			os.Exit(2)
		}
	}
	paths, err := project.Baseline(root, "fixture", &project.Config{})
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver:", err)
		os.Exit(2)
	}
	return map[string]any{"case": "approval", "baseline": paths, "hash": project.Hash(root, paths)}
}

func main() {
	name := os.Getenv("BASELINE_CASE")
	var out map[string]any
	switch name {
	case "complete", "deadline":
		out = checkBaseline(name)
	case "approval":
		out = approval()
	default:
		fmt.Fprintf(os.Stderr, "driver: unknown case %q\n", name)
		os.Exit(2)
	}
	b, err := json.Marshal(out)
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver:", err)
		os.Exit(2)
	}
	fmt.Printf("BASELINE_RESULT=%s\n", b)
}
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// built is the driver binary (or why there is none), built once per process in a temporary
// folder of the module that is removed when the process exits.
let built = null;
function binary() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'main.go'), driver);
  const out = path.join(dir, 'baseline-driver');
  const build = cp.spawnSync('go', ['build', '-o', out, './' + path.basename(dir)], {
    encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
  });
  const output = (build.stdout || '') + (build.stderr || '');
  built = build.status === 0
    ? { bin: out }
    : { error: `go build -o ${out} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${output}` };
  return built;
}

// run runs one case of the driver and returns its raw result, or {driver: <what happened>}.
function run(name) {
  const b = binary();
  if (b.error) return { driver: b.error };
  const result = cp.spawnSync(b.bin, [], {
    encoding: 'utf8', timeout: 60000, env: { ...gitFreeEnv(), BASELINE_CASE: name }
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const rows = output.split('\n').filter(s => s.startsWith('BASELINE_RESULT='));
  if (result.status !== 0 || rows.length !== 1) {
    return { driver: `${b.bin} (BASELINE_CASE=${name}) exited ${result.status} ${result.signal || ''} and must print exactly one BASELINE_RESULT line: ${output}` };
  }
  return JSON.parse(rows[0].slice('BASELINE_RESULT='.length));
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');
  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    this.baselineCase = name;
    this.baselineRaw = run(name);
  });
  Then(SLUG + ': the observation is', function (docString) {
    const raw = this.baselineRaw;
    assert.deepEqual(observe(raw), JSON.parse(docString),
      `case ${this.baselineCase}: raw driver result ${JSON.stringify(raw)}`);
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
