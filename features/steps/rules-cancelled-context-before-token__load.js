const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const slug = 'rules-cancelled-context-before-token';
const root = path.resolve(__dirname, '../..');
const driver = `./features/steps/${slug}__driver`;

function command(program, args, timeout) {
  const r = spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout });
  assert.equal(r.status, 0, `${program} ${args.join(' ')}: ${r.error || r.signal || r.status}\n${r.stdout || ''}${r.stderr || ''}`);
  return r.stdout;
}

function load(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${slug}-`));
  try {
    const binary = path.join(dir, 'load-driver');
    command('go', ['build', '-o', binary, driver], 90000);
    return JSON.parse(command(binary, [state], 15000));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function observe(name, state, actual, outcome) {
  const expected = { ...outcome, requests: 0, token_lookup: state === 'active', cache_read: false };
  assert.deepEqual(actual, expected, `${name} load: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
}

if (require.main === module) {
  // Focused replay of independently recorded observations; never used by Cucumber.
  const [file, mode] = process.argv.slice(2);
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))[mode];
  assert.ok(Array.isArray(rows) && rows.length > 0, `missing ${mode} replay rows`);
  for (const { name, state, actual, outcome } of rows) {
    try {
      observe(name, state, actual, outcome);
      console.log(`accepted ${name}`);
    } catch (err) {
      if (!(err instanceof assert.AssertionError)) throw err;
      console.log(`rejected ${name}`);
      process.exitCode = 1;
    }
  }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  When(`${slug}: the driver loads with context state {string} and a missing token`, { timeout: 110000 }, function (state) {
    this.precedenceLoad = { state, actual: load(state) };
  });
  function check(state, docString) {
    assert.equal(this.precedenceLoad.state, state);
    observe(state, state, this.precedenceLoad.actual, JSON.parse(docString));
  }
  Then(`${slug}: the active load yields without an HTTP request or cache read`, function (docString) {
    check.call(this, 'active', docString);
  });
  Then(`${slug}: the {string} load yields without token lookup, HTTP requests, or cache reads`, check);
}
