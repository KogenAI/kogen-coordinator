const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function observe(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  const text = fs.readFileSync('.kogen/intents/k-coord-run-state-retain/acceptance.feature', 'utf8');
  const expected = JSON.parse(text.split('"""')[1]);
  const actual = structuredClone(expected);
  if (process.argv[2] === 'bad') { actual.omitted = 0; actual.utc = false; actual.evidence = []; actual.oversizeUnchanged = false; actual.workspaceGone = false; }
  try { observe(actual, expected); console.log('accepted'); } catch { console.log('rejected'); process.exitCode = 1; }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  When('I exercise the durable run store across workspace pruning', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-store-driver-'));
    try {
      const source = path.join(dir, 'main.go');
      const binary = path.join(dir, 'observe');
      fs.copyFileSync('features/steps/run_state_driver.go.txt', source);
      const build = spawnSync('go', ['build', '-o', binary, source], { encoding: 'utf8', env: process.env });
      assert.equal(build.status, 0, `go build durable lifecycle driver: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
      const run = spawnSync(binary, [], { encoding: 'utf8', env: process.env });
      assert.equal(run.status, 0, `durable lifecycle driver: ${run.error || ''}\n${run.stdout}\n${run.stderr}`);
      this.runStateObservation = JSON.parse(run.stdout);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  Then('the retained run observations are:', function (expected) { observe(this.runStateObservation, JSON.parse(expected)); });
}
