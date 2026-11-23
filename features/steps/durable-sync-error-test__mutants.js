// Steps of the Intent durable-sync-error-test. The durable package tests are run in a copy of the
// module against the unmodified durable.go and against two wrong Sync implementations: one that
// swallows the flush error and one that reports the flush error while syncing is skipped. A
// wrong implementation is caught when `go test ./durable` fails with a "--- FAIL" line.
// Run as `node <this file> good|bad` to check the observer against known test files.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const FLUSH = '\treturn f.Sync()\n}';
const SKIP = '\tif skip.Load() {\n\t\treturn nil\n\t}';

const MUTANTS = {
  unmodified: (src) => src,
  swallow: (src) => src.replace(FLUSH, '\tf.Sync()\n\treturn nil\n}'),
  skipError: (src) => src.replace(SKIP, '\tif skip.Load() {\n\t\treturn f.Sync()\n\t}'),
};

function goTest(dir, name, src) {
  const mutated = MUTANTS[name](src);
  if (name !== 'unmodified' && mutated === src) {
    throw new Error(`durable-sync-error-test: durable/durable.go no longer contains the text the ${name} source replaces`);
  }
  fs.writeFileSync(path.join(dir, 'durable', 'durable.go'), mutated);
  const r = cp.spawnSync('go', ['test', '-count=1', './durable'], { cwd: dir, encoding: 'utf8', timeout: 100000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return {
    passed: r.status === 0 && /^ok\s/m.test(out),
    caught: r.status !== 0 && /--- FAIL/.test(out),
    out,
  };
}

// Runs the durable tests (testSrc replaces durable/durable_test.go when given) against the three sources.
function observe(root, testSrc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-sync-error-test-'));
  try {
    fs.cpSync(root, dir, {
      recursive: true,
      filter: (src) => !['.git', '.kogen', 'features'].includes(path.relative(root, src).split(path.sep)[0]),
    });
    if (testSrc !== undefined) fs.writeFileSync(path.join(dir, 'durable', 'durable_test.go'), testSrc);
    const original = fs.readFileSync(path.join(dir, 'durable', 'durable.go'), 'utf8');
    const result = {};
    for (const name of Object.keys(MUTANTS)) result[name] = goTest(dir, name, original);
    return result;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function problems(result) {
  const list = [];
  if (!result.unmodified.passed) list.push(`the durable tests do not pass on the unmodified source:\n${result.unmodified.out}`);
  if (!result.swallow.caught) list.push(`the durable tests do not fail on a Sync that swallows the flush error:\n${result.swallow.out}`);
  if (!result.skipError.caught) list.push(`the durable tests do not fail on a Sync that reports the flush error while syncing is skipped:\n${result.skipError.out}`);
  return list;
}

if (require.main === module) {
  const head = 'package durable\n\nimport (\n\t"os"\n\t"path/filepath"\n\t"testing"\n)\n\n';
  const open = 'func closedFile(t *testing.T) *os.File {\n\tf, err := os.Create(filepath.Join(t.TempDir(), "c"))\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tf.Close()\n\treturn f\n}\n\n';
  const enabled = '\tskip.Store(false)\n\tif Sync(f) == nil {\n\t\tt.Fatal("want the flush error")\n\t}\n';
  const skipped = '\tskip.Store(true)\n\tdefer skip.Store(false)\n\tif err := Sync(f); err != nil {\n\t\tt.Fatal(err)\n\t}\n';
  const body = (parts) => head + open + 'func TestControl(t *testing.T) {\n\tf := closedFile(t)\n' + parts + '}\n';
  const controls = {
    good: [['both-checks', body(enabled + skipped)]],
    bad: [
      ['no-enabled-check', body(skipped)],
      ['no-skipped-check', body(enabled)],
      ['failing-test', body('\tt.Fatal("always fails")\n')],
    ],
  };
  const kind = process.argv[2];
  if (!controls[kind]) {
    console.error('usage: node durable-sync-error-test__mutants.js good|bad');
    process.exit(2);
  }
  let rejected = false;
  for (const [name, src] of controls[kind]) {
    const bad = problems(observe(process.cwd(), src));
    if (bad.length === 0) console.log(`accepted ${name}`);
    else {
      rejected = true;
      console.log(`rejected ${name}`);
    }
  }
  process.exit(rejected ? 1 : 0);
}

const { When, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');

When('durable-sync-error-test: the durable package tests run against the unmodified source, a source whose Sync swallows the flush error and a source whose Sync reports the flush error while syncing is skipped', function () {
  this.observed = observe(process.cwd());
});

Then('durable-sync-error-test: the tests pass on the unmodified source', function () {
  assert.ok(this.observed.unmodified.passed, `the durable tests do not pass on the unmodified source:\n${this.observed.unmodified.out}`);
});

Then('durable-sync-error-test: the tests fail on the source that swallows the flush error', function () {
  assert.ok(this.observed.swallow.caught, `the durable tests do not fail on a Sync that swallows the flush error (go test ./durable output):\n${this.observed.swallow.out}`);
});

Then('durable-sync-error-test: the tests fail on the source that reports the flush error while syncing is skipped', function () {
  assert.ok(this.observed.skipError.caught, `the durable tests do not fail on a Sync that reports the flush error while syncing is skipped (go test ./durable output):\n${this.observed.skipError.out}`);
});
