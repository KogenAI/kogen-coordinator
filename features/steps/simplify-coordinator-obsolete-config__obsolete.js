const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { Given, When, Then } = require('@cucumber/cucumber');

const NAMES = /shape_workers|shape_audit|shape_decision_check|review_material|max_rounds|MaxRounds|FormerBaseline|ShapeWorkers|ShapeAudit|ShapeDecisionCheck|ReviewMaterial/;
let found;
let vet;

Given('simplify-coordinator-obsolete-config: the repository checkout', function () {});

When('simplify-coordinator-obsolete-config: the tracked Go sources and README are searched for the removed names', function () {
  const ls = spawnSync('git', ['ls-files', '*.go', 'README.md'], { encoding: 'utf8' });
  assert.equal(ls.status, 0, ls.stderr);
  found = [];
  for (const f of ls.stdout.split('\n').filter(Boolean)) {
    if (!fs.existsSync(f)) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (NAMES.test(line)) found.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
});

Then('simplify-coordinator-obsolete-config: no removed name is found', function () {
  assert.deepEqual(found, [], `removed names still present:\n${found.join('\n')}`);
});

When('simplify-coordinator-obsolete-config: go vet runs for the repository', function () {
  vet = spawnSync('go', ['vet', './...'], { encoding: 'utf8', timeout: 100000 });
});

Then('simplify-coordinator-obsolete-config: go vet passes', function () {
  assert.equal(vet.status, 0, `go vet ./... failed (status ${vet.status}, ${vet.error || ''}):\n${vet.stdout}\n${vet.stderr}`);
});
