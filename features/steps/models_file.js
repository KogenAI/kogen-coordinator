const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, After} = require('@cucumber/cucumber');
Given('a models-file fixture', function () {
  this.mRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'models-file-'));
  fs.mkdirSync(path.join(this.mRoot, '.kogen/local'), {recursive:true});
  fs.writeFileSync(path.join(this.mRoot, '.kogen/project.yaml'), 'version: 1\nmodels:\n  build: {model: legacy, effort: low}\n');
});
Given('models fixture file {string} contains:', function (file, body) {
  fs.writeFileSync(path.join(this.mRoot, file), body + '\n');
});
When('I call the models-file API {string}', {timeout:300000}, function (mode) {
  this.mBefore = {};
  for (const f of ['.kogen/project.yaml', '.kogen/models.yaml', '.kogen/local/models.yaml']) {
    const p = path.join(this.mRoot, f);
    this.mBefore[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  const source = path.join(this.mRoot, 'main.go');
  fs.copyFileSync('features/steps/models_file_driver.go.txt', source);
  this.mMode = mode;
  const r = spawnSync('go', ['run', source, this.mRoot, mode], {encoding:'utf8'});
  this.mResult = r;
});
Then('the models-file output is:', function (expected) {
  assert.equal(this.mResult.status, 0, `${this.mResult.error || ''}\n${this.mResult.stdout}\n${this.mResult.stderr}`);
  if (this.mMode === 'baseline') assert.deepEqual(JSON.parse(this.mResult.stdout), JSON.parse(expected));
  else assert.equal(this.mResult.stdout.trim(), expected.trim());
});
Then('the models-file error names {string}', function (file) {
  assert.equal(this.mResult.status, 0, this.mResult.stderr);
  assert.ok(this.mResult.stdout.startsWith('environment/'), this.mResult.stdout);
  assert.ok(this.mResult.stdout.includes(file), this.mResult.stdout);
});
Then('the models fixture files are unchanged', function () {
  for (const [f, before] of Object.entries(this.mBefore)) {
    const p = path.join(this.mRoot, f);
    assert.equal(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null, before, f);
  }
});
After(function () { if (this.mRoot) fs.rmSync(this.mRoot, {recursive:true, force:true}); });
