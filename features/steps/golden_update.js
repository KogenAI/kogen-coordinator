const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const GOLDENS = ['project/testdata/golden.json', 'project/testdata/facts-golden.json', 'project/testdata/parity.json'];
const SKIP = new Set(['.git', 'node_modules', path.join('.kogen', 'local')]);

// copyCheckout copies the checkout's files, without Git metadata and local state, into a new
// temporary directory, so a Go test run there can write nothing here.
function copyCheckout(from) {
  const to = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-update-'));
  fs.cpSync(from, to, { recursive: true, filter: (src) => !SKIP.has(path.relative(from, src)) });
  return to;
}

// snapshot maps every regular file under dir to the SHA-256 of its bytes.
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, r))).digest('hex');
    }
  };
  walk('');
  return out;
}

function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]).sort();
}

function setAt(doc, keys, value) {
  let node = doc;
  for (const k of keys.slice(0, -1)) {
    assert.ok(node !== null && typeof node === 'object' && k in node, `no ${JSON.stringify(keys)} in the golden`);
    node = node[k];
  }
  const last = keys[keys.length - 1];
  assert.ok(node !== null && typeof node === 'object' && last in node, `no ${JSON.stringify(keys)} in the golden`);
  node[last] = value;
}

// sameJSON compares two golden files as JSON values: object key order is free, array order and
// strings are exact.
function sameJSON(file, actualText, expectedText) {
  assert.deepStrictEqual(JSON.parse(actualText), JSON.parse(expectedText), `${file} is not the checkout's ${file} as JSON`);
}

// failedTests lists the top-level tests `go test` reported as failed (`--- FAIL: TestName (…)`).
function failedTests(output) {
  return [...new Set([...output.matchAll(/^--- FAIL: (Test[^\s/]+) \(/gm)].map((m) => m[1]))].sort();
}

// importsFlag lists the packages whose non-test files import "flag", from
// `go list -f '{{.ImportPath}} {{join .Imports " "}}' ./...`.
function importsFlag(listOutput) {
  return listOutput.split('\n').filter((l) => l.trim() !== '').filter((l) => l.split(' ').slice(1).includes('flag')).map((l) => l.split(' ')[0]);
}

function documentsUpdate(readme) {
  return readme.includes('go test ./... -update');
}

if (require.main === module) {
  // Controls for the observers above, on the checkout's real goldens.
  const good = process.argv[2] === 'good';
  const verdicts = [];
  const check = (name, f) => { try { f(); verdicts.push([name, true]); } catch { verdicts.push([name, false]); } };
  for (const file of GOLDENS) {
    const text = fs.readFileSync(file, 'utf8');
    const doc = JSON.parse(text);
    let other;
    if (good) {
      const reorder = (v) => Array.isArray(v) ? v.map(reorder) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reorder(v[k])])) : v;
      other = JSON.stringify(reorder(doc));
    } else {
      setAt(doc, file.endsWith('parity.json') ? ['cases', 0, 'hash'] : file.endsWith('facts-golden.json') ? ['repo', 'captured'] : ['acceptance', 'project'], 'stale');
      other = JSON.stringify(doc);
    }
    check(file, () => sameJSON(file, other, text));
  }
  const dir = copyCheckout('.');
  try {
    const before = snapshot(dir);
    if (!good) fs.appendFileSync(path.join(dir, GOLDENS[0]), ' ');
    check('snapshot', () => assert.deepStrictEqual(changedFiles(before, snapshot(dir)), []));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const failures = good ? '--- FAIL: TestA (0.00s)\n--- FAIL: TestB (0.01s)\n    --- FAIL: TestB/x (0.00s)\nFAIL\n' : '--- FAIL: TestA (0.00s)\nFAIL\n';
  check('failed tests', () => assert.deepStrictEqual(failedTests(failures), ['TestA', 'TestB']));
  const list = good ? spawnSync('go', ['list', '-f', '{{.ImportPath}} {{join .Imports " "}}', './...'], { encoding: 'utf8' }).stdout : 'example.test/p fmt flag os\n';
  check('imports', () => assert.deepStrictEqual(importsFlag(list), []));
  check('readme', () => assert.ok(documentsUpdate(good ? '## Testing\n\n```sh\ngo test ./... -update\n```\n' : '## Testing\n\n```sh\ngo test ./...\n```\n')));
  const accepted = verdicts.filter(([, ok]) => ok).map(([n]) => n);
  if (good ? accepted.length === verdicts.length : accepted.length === 0) {
    console.log(good ? 'accepted' : 'rejected');
    process.exitCode = good ? 0 : 1;
  } else {
    console.log(`unexpected verdicts: ${JSON.stringify(verdicts)}`);
    process.exitCode = good ? 1 : 0;
  }
} else {
  const { Given, When, Then, After } = require('@cucumber/cucumber');
  const long = { timeout: 15 * 60 * 1000 };

  After(function () {
    if (this.goldenCopy) fs.rmSync(this.goldenCopy, { recursive: true, force: true });
  });

  Given('a scratch copy of this checkout', function () {
    this.goldenCopy = copyCheckout(process.cwd());
  });

  Given('these recorded outputs in the copy are stale:', function (table) {
    for (const { file, path: keys, value } of table.hashes()) {
      const full = path.join(this.goldenCopy, file);
      const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
      setAt(doc, JSON.parse(keys), JSON.parse(value));
      fs.writeFileSync(full, JSON.stringify(doc) + '\n');
    }
  });

  When('I run {string} in the copy', long, function (command) {
    this.goldenBefore = snapshot(this.goldenCopy);
    const run = spawnSync('sh', ['-c', command], { cwd: this.goldenCopy, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 });
    this.goldenRun = { command, status: run.status, output: `${run.error || ''}${run.stdout}${run.stderr}` };
    this.goldenAfter = snapshot(this.goldenCopy);
  });

  Then('the command exits {int}', function (code) {
    const { command, status, output } = this.goldenRun;
    assert.equal(status, code, `${command} exited ${status}, want ${code}:\n${output.slice(-6000)}`);
  });

  Then('exactly these top-level tests failed:', function (table) {
    const { command, output } = this.goldenRun;
    assert.deepStrictEqual(failedTests(output), table.raw().map((r) => r[0]).sort(), `${command} failed other tests than expected:\n${output.slice(-6000)}`);
  });

  Then('the run changed no file in the copy', function () {
    assert.deepStrictEqual(changedFiles(this.goldenBefore, this.goldenAfter), [], `${this.goldenRun.command} changed files`);
  });

  Then('these goldens in the copy equal the checkout\'s as JSON:', function (table) {
    for (const [file] of table.raw()) {
      sameJSON(file, fs.readFileSync(path.join(this.goldenCopy, file), 'utf8'), fs.readFileSync(file, 'utf8'));
    }
  });

  Then('no package of the module imports {string} outside its tests', long, function (pkg) {
    const run = spawnSync('go', ['list', '-f', '{{.ImportPath}} {{join .Imports " "}}', './...'], { cwd: this.goldenCopy, encoding: 'utf8', env: process.env });
    assert.equal(run.status, 0, `go list ./...: ${run.error || ''}${run.stderr}`);
    assert.equal(pkg, 'flag');
    assert.deepStrictEqual(importsFlag(run.stdout), [], 'non-test packages import "flag", so the update flag could reach the kogen binary');
  });

  Then('README.md documents {string}', function (command) {
    assert.equal(command, 'go test ./... -update');
    assert.ok(documentsUpdate(fs.readFileSync('README.md', 'utf8')), `README.md does not document ${command}`);
  });
}
