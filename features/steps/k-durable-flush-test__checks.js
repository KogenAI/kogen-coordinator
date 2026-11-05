// Steps of the Intent k-durable-flush-test. Each scenario works in its own copy of the repository
// (every file except .git, in a new temporary folder), changes files of the copy and runs a go
// command there. The repository itself is never written; the copy is removed after the scenario.
//
// Observer controls: `node features/steps/k-durable-flush-test__checks.js good|bad` judges recorded
// observations with the same judgments the steps use, against the expectations parsed from the
// feature file. good holds real outputs of a candidate implementation, bad real outputs of today's
// code, both recorded in scratch copies of this repository.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'k-durable-flush-test';
const MODULE = 'github.com/KogenAI/kogen-coordinator/';

// normalize replaces the copy's folder (as given and as resolved) and the module path that
// -trimpath reports instead of it with <copy>/.
function normalize(text, copy) {
  let out = text;
  for (const prefix of [copy.real + '/', copy.dir + '/', MODULE]) out = out.split(prefix).join('<copy>/');
  return out;
}

function describe(run) {
  return `${run.command} exited ${run.status}${run.signal ? ' (' + run.signal + ')' : ''}`;
}

function judgeSucceeds(run) {
  assert.equal(run.status, 0, `${describe(run)}, want 0:\n${run.output}`);
}

function judgeFailsNaming(run, text) {
  assert.ok(Number.isInteger(run.status) && run.status !== 0,
    `${describe(run)}, want a failure naming "${text}":\n${run.output}`);
  assert.ok(run.output.includes(text), `${describe(run)} without naming "${text}":\n${run.output}`);
}

function judgePrints(run, copy, expected) {
  judgeSucceeds(run);
  assert.equal(normalize(run.stdout, copy), expected + '\n', `${describe(run)}; stdout:\n${run.stdout}`);
}

function judgeWrote(run, copy, wrote, expected) {
  judgeSucceeds(run);
  assert.equal(normalize(wrote, copy), expected + '\n', `${describe(run)}; the test wrote:\n${wrote}`);
}

// Recorded observations. copy is the scratch copy the outputs came from.
const copyOf = { dir: '/home/lanes/work.noindex/scratch/delivery/t1105/tmp.D9SDlvGRvb/c', real: '/home/lanes/work.noindex/scratch/delivery/t1105/tmp.D9SDlvGRvb/c' };
const known = {
  good: {
    'provenance-named': { command: 'go test -count=1 ./project/', status: 1, signal: null, stdout: '', output: "--- FAIL: TestZZ (0.00s)\n    zz_test.go:6: provenance write was not flushed with durable.Sync: the receipt's temp file\nFAIL\nFAIL\tgithub.com/KogenAI/kogen-coordinator/project\t1.774s\nFAIL\n" },
    'scan-route-named': { command: 'go test -count=1 ./durable/', status: 1, signal: null, stdout: '', output: '--- FAIL: TestZZ (0.00s)\n    zz_test.go:6: durable.SkipSyncInTests called from non-test file route/kogen_skip_sync.go\nFAIL\nFAIL\tgithub.com/KogenAI/kogen-coordinator/durable\t1.554s\nFAIL\n' },
    'scan-durable-named': { command: 'go test -count=1 ./durable/', status: 1, signal: null, stdout: '', output: '--- FAIL: TestZZ (0.00s)\n    zz_test.go:6: durable.SkipSyncInTests called from non-test file durable/kogen_skip_sync.go\nFAIL\nFAIL\tgithub.com/KogenAI/kogen-coordinator/durable\t1.565s\nFAIL\n' },
    'program': { command: 'go run ./kogenskipdriver', status: 0, signal: null, stdout: 'recovered: durable.SkipSyncInTests called from non-test file /home/lanes/work.noindex/scratch/delivery/t1105/tmp.D9SDlvGRvb/c/kogenskipdriver/main.go\nflush of a closed file fails: true\n' },
    'test-wrote': { command: 'go test -count=1 ./kogenskipdriver/', status: 0, signal: null, output: 'ok  \tgithub.com/KogenAI/kogen-coordinator/kogenskipdriver\t0.003s\n', wrote: 'non-test helper:\nrecovered: durable.SkipSyncInTests called from non-test file /home/lanes/work.noindex/scratch/delivery/t1105/tmp.D9SDlvGRvb/c/kogenskipdriver/helper.go\nflush of a closed file fails: true\ntest file:\nrecovered: <nil>\nflush of a closed file fails: false\n' }
  },
  bad: {
    'provenance-named': { command: 'go test -count=1 ./project/', status: 0, signal: null, stdout: '', output: 'ok  \tgithub.com/KogenAI/kogen-coordinator/project\t2.886s\n' },
    'scan-route-named': { command: 'go test -count=1 ./durable/', status: 0, signal: null, stdout: '', output: 'ok  \tgithub.com/KogenAI/kogen-coordinator/durable\t1.911s\n' },
    'scan-durable-named': { command: 'go test -count=1 ./durable/', status: 0, signal: null, stdout: '', output: 'ok  \tgithub.com/KogenAI/kogen-coordinator/durable\t1.911s\n' },
    'program': { command: 'go run ./kogenskipdriver', status: 0, signal: null, stdout: 'recovered: <nil>\nflush of a closed file fails: false\n' },
    'test-wrote': { command: 'go test -count=1 ./kogenskipdriver/', status: 0, signal: null, output: 'ok  \tgithub.com/KogenAI/kogen-coordinator/kogenskipdriver\t0.003s\n', wrote: 'non-test helper:\nrecovered: <nil>\nflush of a closed file fails: false\ntest file:\nrecovered: <nil>\nflush of a closed file fails: false\n' }
  }
};

// expectations reads the expected texts from the feature file, in feature order.
function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const named = [...feature.matchAll(/the command fails and its output contains "([^"]+)"/g)].map(m => m[1]);
  const doc = re => {
    const m = feature.match(re);
    if (!m) throw new Error('feature has no doc string for ' + re);
    return m[1].split('\n').map(l => l.replace(/^ {6}/, '')).join('\n');
  };
  return {
    'provenance-named': named[0],
    'scan-route-named': named[1],
    'scan-durable-named': named[2],
    'program': doc(/the command succeeds and prints\s*\n\s*"""\n([\s\S]*?)\n\s*"""/),
    'test-wrote': doc(/the command succeeds and the test wrote\s*\n\s*"""\n([\s\S]*?)\n\s*"""/)
  };
}

function judge(name, run, expected) {
  switch (name) {
    case 'program': return judgePrints(run, copyOf, expected);
    case 'test-wrote': return judgeWrote(run, copyOf, run.wrote, expected);
    default: return judgeFailsNaming(run, expected);
  }
}

function control(kind) {
  const expected = expectations();
  let all = true;
  for (const name of Object.keys(known[kind])) {
    let accepted;
    try { judge(name, known[kind][name], expected[name]); accepted = true; } catch (_) { accepted = false; }
    console.log((accepted ? 'accepted ' : 'rejected ') + name);
    if (accepted !== (kind === 'good')) all = false;
  }
  process.exit(kind === 'good' ? (all ? 0 : 1) : (all ? 1 : 0));
}

function register() {
  const { Given, When, Then, After } = require('@cucumber/cucumber');

  After(function () {
    if (this.kdftCopy) fs.rmSync(this.kdftCopy.root, { recursive: true, force: true });
  });

  Given(SLUG + ': a copy of the repository', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), SLUG + '-'));
    const dir = path.join(root, 'repo');
    const src = process.cwd();
    fs.cpSync(src, dir, { recursive: true, filter: s => s !== path.join(src, '.git') });
    this.kdftCopy = { root, dir, real: fs.realpathSync(dir), wrote: path.join(root, 'test-wrote.txt') };
  });

  Given(SLUG + ': in the copy, every durable.Sync call of {string} is replaced by a call that does not flush', function (file) {
    const p = path.join(this.kdftCopy.dir, file);
    const src = fs.readFileSync(p, 'utf8');
    const parts = src.split('durable.Sync(');
    assert.ok(parts.length > 1, `the fixture found no durable.Sync( call in ${file}`);
    fs.writeFileSync(p, parts.join('kogenNoSync(') + '\nfunc kogenNoSync(any) error { return nil }\n\nvar _ = durable.Sync\n');
  });

  Given(SLUG + ': the copy has the file {string} holding', function (file, content) {
    const p = path.join(this.kdftCopy.dir, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content + '\n');
  });

  When(SLUG + ': {string} runs in the copy', { timeout: 300000 }, function (command) {
    const args = command.split(/\s+/);
    assert.equal(args[0], 'go', `only go commands run in the copy: ${command}`);
    const copy = this.kdftCopy;
    fs.rmSync(copy.wrote, { force: true });
    const r = cp.spawnSync('go', args.slice(1), {
      cwd: copy.real, encoding: 'utf8', timeout: 280000,
      env: { ...process.env, PWD: copy.real, KOGEN_SKIP_OUT: copy.wrote, GOFLAGS: ((process.env.GOFLAGS || '') + ' -buildvcs=false').trim() }
    });
    if (r.error && r.error.code !== 'ETIMEDOUT') throw r.error;
    this.kdftRun = { command, status: r.status, signal: r.signal, stdout: r.stdout || '', output: (r.stdout || '') + (r.stderr || '') };
  });

  Then(SLUG + ': the command succeeds', function () {
    judgeSucceeds(this.kdftRun);
  });

  Then(SLUG + ': the command fails and its output contains {string}', function (text) {
    judgeFailsNaming(this.kdftRun, text);
  });

  Then(SLUG + ': the command succeeds and prints', function (expected) {
    judgePrints(this.kdftRun, this.kdftCopy, expected);
  });

  Then(SLUG + ': the command succeeds and the test wrote', function (expected) {
    const p = this.kdftCopy.wrote;
    const wrote = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : `(the test wrote no file ${p})`;
    judgeWrote(this.kdftRun, this.kdftCopy, wrote, expected);
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind !== 'good' && kind !== 'bad') { console.log('usage: good|bad'); process.exit(2); }
  control(kind);
} else {
  register();
}
