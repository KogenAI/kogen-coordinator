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
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.error || ''}\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return result.stdout;
}

When('yaml-comment-escaped-quotes: ParseConfig reads', {timeout: 115000}, function (text) {
  if (!binary) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-comment-escaped-quotes-'));
    binary = path.join(directory, 'parse');
    run('go', ['build', '-o', binary, './features/steps/yaml-comment-escaped-quotes__driver/main.go']);
  }
  this.yamlCommentResult = JSON.parse(run(binary, [], {input: text}));
});

Then('yaml-comment-escaped-quotes: the parsed setup scalars are', function (expected) {
  assert.deepEqual(this.yamlCommentResult, JSON.parse(expected));
});

AfterAll(function () {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
});
