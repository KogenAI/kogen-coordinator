const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const FEATURE = '.kogen/intents/k-coord-lint-all-problems/acceptance.feature';
const REFUSAL = /^\s*Then the check refuses it with exit (\d+) and prints:\s*$/;
function observe(actual, expected) { assert.deepStrictEqual(actual, expected); }
// The expected refusals of the feature: each `Then ... prints:` step with its doc string.
function expectedRefusals(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = REFUSAL.exec(lines[i]);
    if (!m) continue;
    const indent = lines[i + 1].indexOf('"""');
    const body = [];
    for (i += 2; lines[i].trim() !== '"""'; i++) body.push(lines[i].slice(indent));
    out.push({ exit: Number(m[1]), render: body.join('\n') + '\n' });
  }
  return out;
}
if (require.main === module) {
  // Observer control: the feature's own expected refusals must be accepted (good) and the
  // pre-change messages must be rejected (bad).
  const expected = expectedRefusals(fs.readFileSync(FEATURE, 'utf8'));
  let rejected = expected.length === 0;
  for (const e of expected) {
    const actual = structuredClone(e);
    if (process.argv[2] !== 'good') {
      actual.render = actual.render
        .replace(/(title: the title must be at most 50 characters), not \d+/g, '$1')
        .replace(/decisions: .* must end with `\(source: request\)` or `\(source: answer <n>\)`/g, 'decisions: a decision has no source');
    }
    try { observe(actual, e); } catch { rejected = true; }
  }
  console.log(rejected ? 'rejected' : 'accepted');
  if (rejected) process.exitCode = 1;
} else {
  const { Given, When, Then, AfterAll } = require('@cucumber/cucumber');
  let binary;
  let dir;
  function driver() {
    if (binary) return binary;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-all-problems-driver-'));
    const source = path.join(dir, 'main.go');
    fs.copyFileSync('features/steps/lint_all_problems_driver.go.txt', source);
    const out = path.join(dir, 'observe');
    const build = spawnSync('go', ['build', '-o', out, source], { encoding: 'utf8', env: process.env });
    assert.equal(build.status, 0, `go build features/steps/lint_all_problems_driver.go.txt: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
    binary = out;
    return binary;
  }
  AfterAll(function () { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
  Given('the Intent demo has this intent.md:', function (text) { this.lintIntentMD = text + '\n'; });
  Given('the Intent demo has this acceptance.feature:', function (text) { this.lintFeature = text + '\n'; });
  When('Kogen checks the Intent demo', { timeout: 300000 }, function () {
    const input = JSON.stringify({ intent: this.lintIntentMD, feature: this.lintFeature });
    const run = spawnSync(driver(), [], { input, encoding: 'utf8', env: process.env });
    assert.equal(run.status, 0, `project.CheckIntent driver: ${run.error || ''}\n${run.stdout}\n${run.stderr}`);
    this.lintResult = JSON.parse(run.stdout);
  });
  Then('the check refuses it with exit {int} and prints:', function (exit, text) {
    observe(this.lintResult, { exit, render: text + '\n' });
  });
  Then('the check accepts it', function () { observe(this.lintResult, { exit: 0, render: '' }); });
}
