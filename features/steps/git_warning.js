const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
function observe(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  const feature = fs.readFileSync('.kogen/intents/k-git-warning-dirty/acceptance.feature', 'utf8');
  const expected = JSON.parse(feature.split('"""')[1]);
  const actual = structuredClone(expected);
  if (process.argv[2] !== 'good') {
    actual.clean.statuses[1] = 'warning: unable to access attributes\n';
    actual.changed.paths[1] = [];
    actual.failure.okFailed = false;
  }
  try { observe(actual, expected); console.log('accepted'); } catch { console.log('rejected'); process.exitCode = 1; }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  When('I observe coordinator Git with a fixture attributes warning', function () {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-warning-driver-'));
    try {
      const binary = path.join(temp, 'observe');
      const build = spawnSync('go', ['build', '-o', binary, 'features/steps/git_warning_probe.go'], { encoding: 'utf8', env: process.env });
      assert.equal(build.status, 0, `go build features/steps/git_warning_probe.go: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
      const run = spawnSync(binary, [], { encoding: 'utf8', env: process.env });
      assert.equal(run.status, 0, `Git observation binary: ${run.error || ''}\n${run.stdout}\n${run.stderr}`);
      this.gitWarningObservation = JSON.parse(run.stdout);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  Then('the Git observations are:', function (expected) { observe(this.gitWarningObservation, JSON.parse(expected)); });
}
