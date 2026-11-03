const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { When, Then } = require('@cucumber/cucumber');

When(/^Bundler detection receives files (.+) and tracked (.+)$/, { timeout: 120000 }, function (files, tracked) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundler-detect-'));
  try {
    const binary = path.join(temp, 'detect');
    const build = spawnSync('go', ['build', '-o', binary, './features/steps/bundler_detect_probe'], { encoding: 'utf8', timeout: 100000, env: process.env });
    assert.equal(build.status, 0, `go build ./features/steps/bundler_detect_probe: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
    const run = spawnSync(binary, [], {
      input: JSON.stringify({ Files: JSON.parse(files), Tracked: JSON.parse(tracked) }),
      encoding: 'utf8', timeout: 10000, env: process.env,
    });
    assert.equal(run.status, 0, `Bundler Detect probe: ${run.error || ''}\n${run.stdout}\n${run.stderr}`);
    this.bundlerDetected = JSON.parse(run.stdout);
    for (const key of ['Setup', 'Checks', 'Fix', 'Protect']) {
      if (this.bundlerDetected[key] === null) this.bundlerDetected[key] = [];
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

Then(/^Bundler detection returns (.+)$/, function (expected) {
  assert.deepStrictEqual(this.bundlerDetected, JSON.parse(expected));
});
