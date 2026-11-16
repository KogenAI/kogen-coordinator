// Steps of the Intent coord-studio-rule-snapshots. A Go driver (features/steps/coord-studio-rule-snapshots__driver/main.go.txt,
// copied as main.go into a temporary dot-prefixed folder of the module, built with go build) drives the
// public rules package against a loopback fake Studio endpoint with synthetic tokens and prints one line
// RUN_RESULT=<JSON>. observe() judges it against the expected object in the feature file.
//
// Observer controls: `node features/steps/coord-studio-rule-snapshots__driver.js good|bad` judges the
// feature's expectations (good) and a one-value mutation of each (bad) with the same observe().
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-studio-rule-snapshots';
const CASES = ['live', 'unconfigured', 'changed-revision', 'cached-outage', 'wrong-scope', 'refused', 'absent-cache', 'malformed', 'tamper', 'no-token-bytes', 'config', 'fixture'];

function observe(actual, expected) {
  assert.deepEqual(actual, expected);
}

function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const out = {};
  const re = /the driver observation of the "([a-z-]+)" case is\s*\n\s*"""\n([\s\S]*?)\n\s*"""/g;
  for (const m of feature.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

function mutate(x) {
  if (x === null) return 'mutated';
  if (typeof x === 'boolean') return !x;
  if (typeof x === 'number') return x + 1;
  if (typeof x === 'string') return x + '!';
  if (Array.isArray(x)) return x.length ? [mutate(x[0]), ...x.slice(1)] : ['mutated'];
  const k = Object.keys(x)[0];
  return { ...x, [k]: mutate(x[k]) };
}

function control(kind) {
  const expected = expectations();
  let all = true;
  for (const c of CASES) {
    assert.ok(expected[c] !== undefined, 'no expectation for case ' + c);
    const actual = kind === 'good' ? JSON.parse(JSON.stringify(expected[c])) : mutate(expected[c]);
    let accepted;
    try { observe(actual, expected[c]); accepted = true; } catch (_) { accepted = false; }
    console.log((accepted ? 'accepted ' : 'rejected ') + c);
    if (accepted !== (kind === 'good')) all = false;
  }
  process.exit(kind === 'good' ? (all ? 0 : 1) : (all ? 1 : 0));
}

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

function runCase(name) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.copyFileSync(path.join(__dirname, SLUG + '__driver', 'main.go.txt'), path.join(dir, 'main.go'));
    const binary = path.join(dir, 'rules-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
    });
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${(build.stdout || '') + (build.stderr || '')}`);
    const result = cp.spawnSync(binary, [], {
      encoding: 'utf8', timeout: 100000, cwd: process.cwd(), env: { ...gitFreeEnv(), DRIVER_CASE: name }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (DRIVER_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('RUN_RESULT='));
    assert.equal(rows.length, 1, `${binary} (DRIVER_CASE=${name}) must print exactly one RUN_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('RUN_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function register() {
  const { Then } = require('@cucumber/cucumber');

  Then(SLUG + ': the driver observation of the {string} case is', { timeout: 110000 }, function (name, docString) {
    assert.ok(CASES.includes(name), 'unknown case ' + name);
    observe(runCase(name), JSON.parse(docString));
  });

  Then(SLUG + ': the README records the Studio read pin and configuration ownership', function () {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
    for (const needle of ['Studio rule snapshots', 'd105f3cbf6d68daebfc473bdb032a81d2ec7bc0c', 'README.md line 1702', 'GET /api/rules', '.kogen/studio-rules.yaml', 'token_env', 'rules.Load']) {
      assert.ok(readme.includes(needle), 'README.md does not contain ' + JSON.stringify(needle));
    }
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'run' && CASES.includes(process.argv[3])) {
    console.log(JSON.stringify(runCase(process.argv[3])));
  } else if (kind === 'good' || kind === 'bad') {
    control(kind);
  } else {
    console.log('usage: good|bad|run <case>');
    process.exit(2);
  }
} else {
  register();
}
