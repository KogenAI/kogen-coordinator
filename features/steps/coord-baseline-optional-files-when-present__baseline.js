// Steps of coord-baseline-optional-files-when-present: project.Baseline (after project.LoadConfig)
// over a fixture Git repository in a new temporary folder, with and without the team lineup file
// .kogen/models.yaml, project.FormerBaseline over that list, and the producer contract golden
// contract/testdata/baseline.json with its existing test TestBaselineContractGolden. The Go drivers
// are built with go build from this checkout's module; the checkout is never written. Git runs
// without global or system configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const GOLDEN = 'contract/testdata/baseline.json';
const SUBTESTS = ['basic', 'acceptance', 'protect', 'team'].map(n => 'TestBaselineContractGolden/' + n);

const BASELINE_DRIVER = `package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	out := map[string]any{"files": []string{}, "error": nil}
	cfg, err := project.LoadConfig(os.Args[1])
	if err == nil {
		var files []string
		files, err = project.Baseline(os.Args[1], "fixture", cfg)
		if files != nil {
			out["files"] = files
		}
	}
	if err != nil {
		out["error"] = err.Error()
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

const FORMER_DRIVER = `package main

import (
	"encoding/json"
	"os"
	"slices"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	var in []string
	if err := json.Unmarshal([]byte(os.Args[1]), &in); err != nil {
		panic(err)
	}
	kept := slices.Clone(in)
	former := project.FormerBaseline(in)
	json.NewEncoder(os.Stdout).Encode(map[string]any{"former": former, "input_unchanged": slices.Equal(kept, in)})
}
`;

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

// Runs the existing TestBaselineContractGolden of ./contract in this checkout with go test -json.
function goTest() {
  const args = ['test', '-json', '-count=1', '-run', '^TestBaselineContractGolden$', './contract'];
  const r = spawnSync('go', args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GOFLAGS: '-trimpath' } });
  const events = [];
  for (const line of (r.stdout || '').split('\n')) {
    if (!line) continue;
    try { events.push(JSON.parse(line)); } catch (_) { events.push({ Output: line + '\n' }); }
  }
  return { command: 'go ' + args.join(' ') + ' (in ' + REPO + ')', status: r.status, error: r.error, events, stderr: r.stderr || '' };
}

// Every golden subtest must have ended exactly once with pass, and the run must have succeeded.
function observeGolden(r) {
  const output = r.events.map(e => e.Output || '').join('') + r.stderr;
  for (const name of SUBTESTS) {
    const ends = r.events.filter(e => e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
    assert.equal(ends.length, 1, `${r.command}: test ${name} ended ${ends.length} times (absent or repeated); status ${r.status}, error ${r.error}\n${output}`);
    assert.equal(ends[0].Action, 'pass', `${r.command}: test ${name} outcome ${ends[0].Action}, not pass\n${output}`);
  }
  assert.equal(r.status, 0, `${r.command}: exit status ${r.status}, error ${r.error}\n${output}`);
}

function sameGolden(text, expected) {
  assert.deepEqual(JSON.parse(text), expected, `${GOLDEN} differs from the expected ordered lists`);
}

function checkFiles(result, expected) {
  assert.equal(result.error, null, `Baseline failed: ${result.error}`);
  assert.deepEqual(result.files, expected, 'Baseline files differ (exact order)');
}

function checkFormer(result, expected) {
  assert.deepEqual(result.former, expected, 'FormerBaseline list differs (exact order)');
  assert.equal(result.input_unchanged, true, 'FormerBaseline modified its input');
}

if (require.main === module) {
  // Observer controls: real go test -json output of the existing golden test (good), and that output
  // with a subtest skipped, a subtest missing or a failed exit status, plus list and golden mismatches (bad).
  const bad = process.argv[2] === 'bad';
  const r = goTest();
  const list = ['.kogen/intents/fixture/intent.md', '.kogen/project.yaml', 'guard/z.txt'];
  const cases = [
    () => observeGolden(bad ? { ...r, events: r.events.map(e => e.Test === SUBTESTS[1] && e.Action === 'pass' ? { ...e, Action: 'skip' } : e) } : r),
    () => observeGolden(bad ? { ...r, events: r.events.filter(e => e.Test !== SUBTESTS[2]) } : r),
    () => observeGolden(bad ? { ...r, status: 1 } : r),
    () => checkFiles({ files: bad ? ['.kogen/intents/fixture/intent.md', '.kogen/project.yaml', '.kogen/models.yaml', 'guard/z.txt'] : list.slice(), error: null }, list),
    () => checkFiles({ files: bad ? ['.kogen/intents/fixture/intent.md', 'guard/z.txt', '.kogen/project.yaml'] : list.slice(), error: null }, list),
    () => checkFormer({ former: bad ? list.slice() : ['.kogen/intents/fixture/intent.md', '.kogen/project.yaml', '.kogen/models.yaml', 'guard/z.txt'], input_unchanged: true }, ['.kogen/intents/fixture/intent.md', '.kogen/project.yaml', '.kogen/models.yaml', 'guard/z.txt']),
    () => checkFormer({ former: list.slice(), input_unchanged: !bad }, list),
    () => sameGolden(bad ? '{"x":["b","a"]}' : '{"x":["a","b"]}', { x: ['a', 'b'] })
  ];
  for (const check of cases) {
    let accepted = true;
    try { check(); } catch (e) { accepted = false; if (!bad) throw e; }
    assert.equal(accepted, !bad, 'observer control polarity');
  }
  console.log(bad ? 'rejected' : 'accepted');
  process.exitCode = bad ? 1 : 0;
} else {
  const { Given, When, Then, After } = require('@cucumber/cucumber');

  const P = 'coord-baseline-optional-files-when-present: ';
  // An exact step sentence as a regular expression, for sentences whose slashes a Cucumber
  // expression would read as alternatives.
  const exact = text => new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');

  function write(root, rel, text) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }

  function build(dir, name, source) {
    const src = path.join(dir, name, 'main.go');
    const bin = path.join(dir, name, 'driver');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, source);
    const r = spawnSync('go', ['build', '-o', bin, src], { cwd: REPO, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, `go build of the ${name} driver failed (status ${r.status}, signal ${r.signal}, error ${r.error}):\n${r.stdout}${r.stderr}`);
    return bin;
  }

  After(function () {
    if (this.optional) fs.rmSync(this.optional.dir, { recursive: true, force: true });
  });

  Given(P + 'a fixture project whose protect patterns are:', function (table) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-optional-'));
    const root = path.join(dir, 'root');
    fs.mkdirSync(root);
    const init = spawnSync('git', ['init', '-q', '.'], { cwd: root, encoding: 'utf8', env: cleanEnv() });
    assert.equal(init.status, 0, `fixture: git init failed: ${init.stderr} ${init.error}`);
    write(root, '.kogen/intents/fixture/intent.md', '# Fixture intent\n\nSlug: fixture\nModel: not applicable\nAcceptance:\n- .kogen/intents/fixture/acceptance.feature\n- features/steps/a.js\n');
    write(root, '.kogen/intents/fixture/acceptance.feature', 'Feature: Fixture\n  Scenario: First\n    Then the candidate succeeds\n');
    write(root, '.kogen/intents/fixture/notes.md', 'notes\n');
    write(root, 'features/steps/a.js', '// a\n');
    write(root, 'guard/z.txt', 'z\n');
    write(root, 'guard/a/deep.txt', 'deep\n');
    write(root, 'unprotected.txt', 'unprotected\n');
    const patterns = table.raw().map(([p]) => '  - \'' + p + '\'\n').join('');
    write(root, '.kogen/project.yaml', 'version: 1\ncommands:\n  acceptance:\n    run: sh accept.sh\n    steps_dir: features/steps\nprotect:\n' + patterns);
    this.optional = { dir, root };
  });

  When(P + 'the fixture file {string} is added', function (rel) {
    write(this.optional.root, rel, 'models: {}\n');
  });

  When(P + 'I compute the baseline', { timeout: 300000 }, function () {
    const bin = build(this.optional.dir, 'baseline', BASELINE_DRIVER);
    const r = spawnSync(bin, [this.optional.root], { encoding: 'utf8', timeout: 60000, env: cleanEnv() });
    assert.equal(r.status, 0, `the Baseline driver failed (status ${r.status}, signal ${r.signal}, error ${r.error}):\n${r.stdout}${r.stderr}`);
    this.optional.result = JSON.parse(r.stdout);
  });

  When(P + 'I apply the former rule to that baseline', { timeout: 300000 }, function () {
    const current = this.optional.result;
    assert.equal(current.error, null, `Baseline failed: ${current.error}`);
    const bin = build(this.optional.dir, 'former', FORMER_DRIVER);
    const r = spawnSync(bin, [JSON.stringify(current.files)], { encoding: 'utf8', timeout: 60000, env: cleanEnv() });
    assert.equal(r.status, 0, `the FormerBaseline driver failed (status ${r.status}, signal ${r.signal}, error ${r.error}):\n${r.stdout}${r.stderr}`);
    this.optional.former = JSON.parse(r.stdout);
  });

  Then(P + 'the baseline is:', function (table) {
    checkFiles(this.optional.result, table.raw().map(([p]) => p));
  });

  Then(P + 'the former rule\'s list is:', function (table) {
    checkFormer(this.optional.former, table.raw().map(([p]) => p));
  });

  Then(exact(P + 'the contract golden contract/testdata/baseline.json holds:'), function (doc) {
    sameGolden(fs.readFileSync(path.join(REPO, GOLDEN), 'utf8'), JSON.parse(doc));
  });

  Then(exact(P + 'every TestBaselineContractGolden subtest passes in ./contract'), { timeout: 360000 }, function () {
    observeGolden(goTest());
  });
}
