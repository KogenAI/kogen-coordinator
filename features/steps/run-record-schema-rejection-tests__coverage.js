// Exercise the submitted Go tests in disposable copies; never edit the checkout.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const SLUG = 'run-record-schema-rejection-tests';
const COMMAND = 'go test -json -count=1 durable/durable.go durable/run_store.go durable/run_store_test.go';
const GUARD = 'record.Version != 1 || record.ID != id';
const variants = {
  future: 'record.ID != id',
  identity: 'record.Version != 1',
  valid: 'true',
};
function run(dir, deadline) {
  const r = cp.spawnSync('go', ['test', '-json', '-count=1', 'durable/durable.go', 'durable/run_store.go', 'durable/run_store_test.go'], {
    cwd: dir, encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: 4 * 1024 * 1024,
  });
  const output = (r.stdout || '') + (r.stderr || '');
  assert.ifError(r.error);
  const events = (r.stdout || '').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const ran = events.some(e => e.Action === 'run' && e.Test === 'TestRunStoreTransitions');
  assert.ok(ran, `${COMMAND}: TestRunStoreTransitions absent, skipped or ran zero times; status=${r.status}\n${output}`);
  return {status: r.status, output, passed: events.some(e => e.Action === 'pass' && !e.Test), failed: events.filter(e => e.Action === 'fail' && e.Test).map(e => e.Test)};
}
function observe(testOverride) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), SLUG + '-'));
  try {
    fs.mkdirSync(path.join(dir, 'durable'));
    fs.copyFileSync(path.join(root, 'go.mod'), path.join(dir, 'go.mod'));
    for (const file of ['durable.go', 'run_store.go', 'run_store_test.go']) {
      fs.copyFileSync(path.join(root, 'durable', file), path.join(dir, 'durable', file));
    }
    if (testOverride !== undefined) fs.writeFileSync(path.join(dir, 'durable/run_store_test.go'), testOverride);
    const file = path.join(dir, 'durable/run_store.go');
    const original = fs.readFileSync(file, 'utf8');
    assert.equal(original.split(GUARD).length, 2, 'Read validation mutation anchor must occur exactly once');
    const deadline = Date.now() + 110000;
    const result = {original: run(dir, deadline)};
    for (const [name, guard] of Object.entries(variants)) {
      fs.writeFileSync(file, original.replace(GUARD, guard));
      result[name] = run(dir, deadline);
    }
    return result;
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function passes(r) {
  assert.ok(r.status === 0 && r.passed, `${COMMAND}: TestRunStoreTransitions and the file's tests must pass on the original reader; status=${r.status}\n${r.output}`);
}
function catches(r, name) {
  assert.ok(Number.isInteger(r.status) && r.status !== 0 && r.failed.length > 0,
    `${COMMAND}: TestRunStoreTransitions and the file's tests must detect ${name} with a failed test, not a compiler error; status=${r.status}; failed=${r.failed.join(', ')}\n${r.output}`);
}
if (require.main === module) {
  const kind = process.argv[2];
  assert.ok(kind === 'good' || kind === 'bad', 'usage: good|bad');
  const controls = JSON.parse(fs.readFileSync('.kogen/intents/' + SLUG + '/controls.json', 'utf8'));
  const correct = controls.correct.files['durable/run_store_test.go'];
  const marker = '\n// TestRunStoreReadSchemaAndID';
  assert.equal(correct.split(marker).length, 2, 'fixture boundary must occur once');
  const result = observe(kind === 'good' ? correct : correct.split(marker)[0]);
  passes(result.original);
  let rejected = false;
  for (const name of Object.keys(variants)) {
    try { catches(result[name], name); console.log('accepted ' + name); }
    catch (_) { rejected = true; console.log('rejected ' + name); }
  }
  process.exit(rejected ? 1 : 0);
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(SLUG + ': the file tests run on the original reader and three wrong readers', {timeout: 120000}, function () { this.schemaResults = observe(); });
  Then(SLUG + ': the tests pass on the original reader', function () { passes(this.schemaResults.original); });
  Then(SLUG + ': the tests catch accepting version 2 with matching ID', function () { catches(this.schemaResults.future, 'accepting version 2 with matching ID'); });
  Then(SLUG + ': the tests catch accepting version 1 with a mismatched ID', function () { catches(this.schemaResults.identity, 'accepting version 1 with a mismatched ID'); });
  Then(SLUG + ': the tests catch rejecting version 1 with matching ID', function () { catches(this.schemaResults.valid, 'rejecting version 1 with matching ID'); });
}
