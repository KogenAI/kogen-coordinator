const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { When, Then, AfterAll } = require('@cucumber/cucumber');

// The existing probe calls the exported project.Detect and writes its result as JSON.
const probe = './features/steps/bundler_detect_probe';
let buildDir;
let binary;

function detectBinary() {
  if (!binary) {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-python-'));
    const out = path.join(buildDir, 'detect');
    const build = spawnSync('go', ['build', '-o', out, probe], { encoding: 'utf8', timeout: 100000, env: process.env });
    assert.equal(build.status, 0, `go build ${probe}: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
    binary = out;
  }
  return binary;
}

// Go's default json.Encoder HTML-escapes &, < and >; the expectations spell them literally.
function unescapeHTML(text) {
  return text.replace(/\\u0026/g, '&').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
}

AfterAll(function () {
  if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
});

When('coord-detect-python: Detect receives:', { timeout: 120000 }, function (text) {
  JSON.parse(text); // a broken fixture fails here, not as product red
  const result = spawnSync(detectBinary(), [], { input: text, encoding: 'utf8', timeout: 10000, env: process.env });
  assert.equal(result.status, 0, `Detect binary: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  this.pythonDetectOutput = result.stdout;
});

Then('coord-detect-python: Detect writes exactly:', function (text) {
  JSON.parse(text); // the expectation itself must be valid JSON
  assert.equal(unescapeHTML(this.pythonDetectOutput), text + '\n', 'Detect output bytes differ from the expected JSON');
});
