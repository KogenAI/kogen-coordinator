const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { When, Then } = require('@cucumber/cucumber');

When('coord-detect-npm-other-lockfiles: Detect receives:', { timeout: 120000 }, function (text) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'other-locks-'));
  try {
    const binary = path.join(temp, 'detect');
    const build = spawnSync('go', ['build', '-o', binary, './features/steps/bundler_detect_probe'], { encoding: 'utf8', timeout: 100000, env: process.env });
    assert.equal(build.status, 0, `go build ./features/steps/bundler_detect_probe: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
    const result = spawnSync(binary, [], { input: text, encoding: 'utf8', timeout: 10000, env: process.env });
    assert.equal(result.status, 0, `Detect binary: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    this.otherLocksDetected = JSON.parse(result.stdout);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
Then('coord-detect-npm-other-lockfiles: Detect returns:', function (text) {
  assert.deepStrictEqual(this.otherLocksDetected, JSON.parse(text));
});
