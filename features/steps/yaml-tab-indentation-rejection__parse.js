const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then, AfterAll} = require('@cucumber/cucumber');

let directory;
let binary;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 100000, ...options});
  assert.equal(result.error, undefined, `${command}: ${result.error}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stdout || ''}${result.stderr || ''}`);
  return result.stdout;
}

When('yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML', {timeout: 115000}, function (document) {
  if (!binary) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-tab-indentation-rejection-'));
    binary = path.join(directory, 'parse');
    run('go', ['build', '-o', binary, './features/steps/yaml-tab-indentation-rejection__driver/main.go']);
  }
  const input = JSON.parse(document);
  assert.equal(typeof input, 'string');
  this.yamlTabResult = JSON.parse(run(binary, [], {input}));
});

Then('yaml-tab-indentation-rejection: parsing reports an indentation problem on line {int}', function (line) {
  const result = this.yamlTabResult;
  assert.equal(typeof result.error, 'string', `expected a parse problem, got ${JSON.stringify(result)}`);
  assert.ok(Array.isArray(result.lines), `expected diagnostic lines, got ${JSON.stringify(result)}`);
  assert.equal(result.lines.length, 1, JSON.stringify(result));
  assert.match(result.lines[0], new RegExp(`^line ${line}: .*indent`, 'i'));
  assert.equal(Object.hasOwn(result, 'setup'), false, 'invalid input must not return configuration');
});

Then('yaml-tab-indentation-rejection: parsing succeeds with these exact setup scalars', function (expected) {
  assert.deepEqual(this.yamlTabResult, {setup: JSON.parse(expected)});
});

AfterAll(function () {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
});
