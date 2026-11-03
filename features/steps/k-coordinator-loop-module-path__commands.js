'use strict';
const {Then} = require('@cucumber/cucumber');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
Then('k-coordinator-loop-module-path: command succeeds', {timeout: 240000}, function (command) {
  execFileSync('/bin/sh', ['-ec', command], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    encoding: 'utf8',
    timeout: 230000,
    stdio: 'pipe'
  });
});
