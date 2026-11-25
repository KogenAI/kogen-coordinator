const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const slug = 'rules-reject-duplicate-json-keys';
const prefix = slug + ': ';

function run(input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), slug + '-'));
  try {
    const binary = path.join(dir, process.platform === 'win32' ? 'driver.exe' : 'driver');
    execFileSync('go', ['build', '-o', binary, './features/steps/' + slug + '__driver'], {
      cwd: path.resolve(__dirname, '../..'), timeout: 80000, encoding: 'utf8',
    });
    const stdout = execFileSync(binary, [], {
      input: JSON.stringify(input), timeout: 25000, encoding: 'utf8',
    });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function content(snapshot) {
  const { origin, fallback_reason, ...rest } = snapshot;
  return rest;
}

function observe({ error, snapshot, seed }, expected) {
  if (seed !== null) {
    assert.equal(seed.origin, 'live', 'cache prime must come from a live load');
    assert.equal(seed.fallback_reason, '', 'cache prime must not be a fallback');
  }
  assert.deepEqual({
    error,
    snapshot: snapshot === null ? null : {
      origin: snapshot.origin,
      fallback_reason: snapshot.fallback_reason,
      rule_ids: snapshot.rules.map(rule => rule.id),
      matches_seed: seed !== null && require('node:util').isDeepStrictEqual(content(snapshot), content(seed)),
    },
  }, expected, 'unexpected rules.Load outcome');
}

if (require.main === module) {
  const control = process.argv[2];
  assert.ok(control === 'good' || control === 'bad', 'usage: driver.js good|bad');
  // Exercise a real fallback that already works before duplicate-key rejection exists.
  const actual = run({
    policy: 'hold',
    prime: '{"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"repo","topic":"t","text":"cached","owner":"o","overrides":null}]}',
    body: '{',
  });
  const expected = {
    error: null,
    snapshot: { origin: 'cached', fallback_reason: 'malformed_response', rule_ids: ['a'], matches_seed: true },
  };
  if (control === 'bad') {
    // Isolate a corrupted payload from its otherwise correct provenance and rule IDs.
    actual.snapshot.rules[0].revision = 2;
  }
  try {
    observe(actual, expected);
    console.log('accepted cache observation');
  } catch (err) {
    if (control !== 'bad' || err.code !== 'ERR_ASSERTION' || err.actual?.snapshot?.matches_seed !== false) throw err;
    console.log('rejected altered cached revision');
    process.exitCode = 1;
  }
} else {
  const { Given, When, Then } = require('@cucumber/cucumber');
  Given(prefix + 'an uncached project with policy {string}', function (policy) {
    this.rulesInput = { policy };
  });
  Given(prefix + "prime the project's cache with this successful Studio body", function (prime) {
    this.rulesInput.prime = prime;
  });
  When(prefix + 'Studio replies with HTTP 200 and body', function (body) {
    this.rulesInput.body = body;
  });
  Then(prefix + 'the load outcome is', { timeout: 115000 }, function (expected) {
    observe(run(this.rulesInput), JSON.parse(expected));
  });
}
