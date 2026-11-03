const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
function observe(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  try {
    observe(process.argv[2] === 'good' ? ['acceptance: ../x.js must be a clean relative path'] : [], ['acceptance: ../x.js must be a clean relative path']);
    console.log('accepted');
  } catch { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  let dir, binary;
  AfterAll(() => { if (dir) fs.rmSync(dir, {recursive:true,force:true}); });
  When('I check acceptance paths with:', {timeout:300000}, function(input) {
    if (!binary) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(),'acceptance-path-driver-'));
      const source = path.join(dir,'main.go');
      fs.copyFileSync('features/steps/acceptance_paths_driver.go.txt',source);
      binary = path.join(dir,'driver');
      const build = spawnSync('go',['build','-o',binary,source],{encoding:'utf8'});
      assert.equal(build.status,0,`go build: ${build.stdout}${build.stderr}`);
    }
    const run = spawnSync(binary,[],{input,encoding:'utf8'});
    assert.equal(run.status,0,`CheckIntent driver: ${run.stdout}${run.stderr}`);
    this.pathLines = JSON.parse(run.stdout);
  });
  Then('the acceptance path lint lines are:', function(expected) { observe(this.pathLines,JSON.parse(expected)); });
}
