const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, AfterAll, After} = require('@cucumber/cucumber');
let buildDir, binary;
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {encoding: 'utf8', ...options});
  assert.equal(r.status, 0, `${command} ${args.join(' ')}: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
Given(/^a quoted-path fixture (in a Git repository|outside a Git repository) with acceptance path (.+)$/, function (mode, file) {
  this.qRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quoted-ignore-'));
  this.qPath = file;
  if (mode === 'in a Git repository') {
    run('git', ['init', '-q', this.qRoot]);
    run('git', ['-C', this.qRoot, 'config', 'user.name', 'Fixture User']);
  }
  const write = (p, text) => { const dest = path.join(this.qRoot, p); fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest, text); };
  write('.gitignore', '*.skip.js\n');
  write(file, '// fixture\n');
  write('.kogen/intents/demo/intent.md', `# Check fixture\n\nSlug: demo\nModel: not applicable — stateless fixture\nAcceptance:\n- .kogen/intents/demo/acceptance.feature\n- ${file}\n\n## Decisions\n- Check files (source: request)\n\n## Tests\n- files: fixture (integration)\n\n## Feasibility\n- none\n`);
  write('.kogen/intents/demo/acceptance.feature', 'Feature: Fixture\n  Scenario: Check\n    Then it works\n');
});
When('the quoted-path Intent is checked', {timeout:300000}, function () {
  if (!binary) {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quoted-driver-'));
    const source = path.join(buildDir, 'main.go');
    fs.copyFileSync('features/steps/quoted_ignore_driver.go.txt', source);
    binary = path.join(buildDir, 'driver');
    run('go', ['build', '-o', binary, source]);
  }
  this.qLines = JSON.parse(run(binary, [this.qRoot], {env: {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_COUNT: '0'}}));
});
Then(/^its quoted-path result is (ignored|clean|unavailable)$/, function (result) {
  if (result === 'clean') assert.deepEqual(this.qLines, []);
  if (result === 'ignored') assert.deepEqual(this.qLines, [`acceptance: ${this.qPath} is ignored by Git`]);
  if (result === 'unavailable') assert.ok(this.qLines.some(l => l.startsWith('acceptance: Git ignore check could not run')), JSON.stringify(this.qLines));
});
After(function () { if (this.qRoot) fs.rmSync(this.qRoot, {recursive:true, force:true}); });
AfterAll(function () { if (buildDir) fs.rmSync(buildDir, {recursive:true, force:true}); });
