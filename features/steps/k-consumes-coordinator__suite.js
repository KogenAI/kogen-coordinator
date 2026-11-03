'use strict';
const {Then} = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
Then('k-consumes-coordinator: the producer suite has Go tests', function () {
  assert.ok(fs.readdirSync(path.join(root, 'consumes/kogen-loop')).some(n => n.endsWith('_test.go')), 'consumes/kogen-loop must contain Go tests');
});
Then('k-consumes-coordinator: the inventory exists', function () {
  assert.ok(fs.readFileSync(path.join(root, 'consumes/kogen-loop/README.md'), 'utf8').trim().length > 0, 'producer consumption inventory is required');
});
Then('k-consumes-coordinator: command {string} succeeds', {timeout: 240000}, function (command) {
  const commands = {
    'go test -race -count=1 -trimpath ./consumes/kogen-loop': ['test', '-race', '-count=1', '-trimpath', './consumes/kogen-loop'],
    'go test ./...': ['test', './...']
  };
  assert.ok(commands[command], 'unsupported acceptance command: ' + command);
  execFileSync('go', commands[command], {cwd: root, encoding: 'utf8', timeout: 230000, env: {...process.env, GOPROXY: 'off', GOTOOLCHAIN: 'local'}});
});
