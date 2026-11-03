'use strict';
// Acceptance driver of K-CONTRACTS-COORDINATOR: kogen-coordinator's contract/ suite pins what its
// consumers (kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build) use. Every
// observation runs in a copy of the tree without .git, bin, node_modules and .kogen/local, with a
// fresh empty HOME, the Go proxy off, KOGEN_* variables removed and HTTP(S) proxies pointing at a
// closed local port. It runs the suite, observes the kogen-coordinator members the suite's Go
// files use (k_contracts_coordinator_uses.go.txt, a go/types observer), reads contract/README.md,
// and runs the suite against copies of the tree with one consumer-relied behaviour changed.
// `node k_contracts_coordinator.js --control good|bad` checks these observers on real go output
// of an existing kogen-coordinator test and on small synthetic README, inventory and import inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {spawn, spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = 'github.com/KogenAI/kogen-coordinator';
const ALLOWED = [MODULE + '/project', MODULE + '/git', MODULE + '/durable', 'kogen-loop/sys'];
const HEADER = '| Interface | Consumers | Derived from | Contract tests |';
const RULE = 'An intended interface change edits this contract together with paired consumer items.';
const SLOW_SECONDS = 30;
const PARALLEL = 4;

let goBin, offline;
// go is the toolchain's own go binary, so no PATH wrapper is involved.
function go() {
  if (!goBin) {
    const r = spawnSync('go', ['env', 'GOROOT'], {encoding:'utf8'});
    assert.equal(r.status, 0, 'go env GOROOT: ' + r.stderr);
    goBin = path.join(r.stdout.trim(), 'bin', 'go');
  }
  return goBin;
}
// offlineEnv keeps the caller's Go caches but nothing that reaches a network, a login or Kogen.
function offlineEnv() {
  if (!offline) {
    const r = spawnSync(go(), ['env', '-json', 'GOCACHE', 'GOMODCACHE', 'GOPATH'], {encoding:'utf8'});
    assert.equal(r.status, 0, 'go env: ' + r.stderr);
    const env = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.startsWith('KOGEN_') && !k.startsWith('GIT_') && !/^(HOME|XDG_CONFIG_HOME|GOFLAGS|GOPROXY|GOTOOLCHAIN|GOENV)$/.test(k) && !/_proxy$/i.test(k)) env[k] = v;
    }
    const proxy = 'http://127.0.0.1:9';
    offline = {...env, ...JSON.parse(r.stdout), HOME:fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-coordinator-home-')),
      GOENV:'off', GOPROXY:'off', GOTOOLCHAIN:'local', GOFLAGS:'-mod=readonly', HTTP_PROXY:proxy, HTTPS_PROXY:proxy, ALL_PROXY:proxy,
      http_proxy:proxy, https_proxy:proxy, all_proxy:proxy, NO_PROXY:'', no_proxy:''};
  }
  return offline;
}
function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-coordinator-tree-'));
  const skip = new Set(['.git', 'bin', 'node_modules', path.join('.kogen', 'local')].map(n => path.join(ROOT, n)));
  fs.cpSync(ROOT, dir, {recursive:true, filter:src => !skip.has(src)});
  return dir;
}
function run(cmd, args, cwd) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, {cwd, env:offlineEnv()});
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => resolve({code, out, err}));
  });
}
// goFiles lists the .go files under dir, relative to it.
function goFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {recursive:true}).filter(f => f.endsWith('.go')).sort();
}
function contractFiles(tree) {
  const files = {};
  for (const f of goFiles(path.join(tree, 'contract'))) files['contract/' + f] = fs.readFileSync(path.join(tree, 'contract', f), 'utf8');
  return files;
}
// summarize reads `go test -json` output: each test's and each package's final action.
function summarize(r) {
  const tests = {}, packages = {};
  let buildFailed = false;
  for (const line of r.out.split('\n')) {
    if (!line.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.Action === 'build-fail' || e.FailedBuild) buildFailed = true;
    if (!['pass', 'fail', 'skip'].includes(e.Action)) continue;
    if (e.Test) tests[e.Package + ' ' + e.Test] = e.Action;
    else packages[e.Package] = {action:e.Action, elapsed:e.Elapsed};
  }
  const by = a => Object.keys(tests).filter(k => tests[k] === a).sort();
  return {exit:r.code, buildFailed, packages, passed:by('pass'), failed:by('fail'), skipped:by('skip'), stderr:r.err};
}
// suiteObservation is what the ordinary run of the suite shows: it passed, ran tests, skipped
// none, every package is listed by `go list ./...` (so `go test ./...` runs it) and is fast.
function suiteObservation(s, listed, files) {
  const pkgs = Object.keys(s.packages).sort();
  return {
    exit:s.exit, build_failed:s.buildFailed,
    packages_not_passed:pkgs.filter(p => s.packages[p].action !== 'pass'),
    tests_failed:s.failed, tests_skipped:s.skipped, ran_tests:s.passed.length > 0,
    packages_over_30_seconds:pkgs.filter(p => !(s.packages[p].elapsed <= SLOW_SECONDS)),
    not_in_go_list_all:pkgs.filter(p => !listed.includes(p)),
    build_constraints:Object.keys(files).filter(f => /^\/\/(go:build| \+build)/m.test(files[f])).sort(),
  };
}
async function suite(tree, packages = ['./contract/...'], args = []) {
  const s = summarize(await run(go(), ['test', '-json', '-count=1', ...args, ...packages], tree));
  const l = await run(go(), ['list', './...'], tree);
  assert.equal(l.code, 0, 'go list ./...: ' + l.err);
  return suiteObservation(s, l.out.split('\n').filter(Boolean), contractFiles(tree));
}
// uses runs the go/types observer on the packages in tree.
async function uses(tree, packages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-coordinator-uses-'));
  fs.copyFileSync(path.join(__dirname, 'k_contracts_coordinator_uses.go.txt'), path.join(dir, 'main.go'));
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module contractuses\n\ngo 1.27.2\n');
  const b = await run(go(), ['build', '-o', path.join(dir, 'uses'), '.'], dir);
  assert.equal(b.code, 0, 'building the usage observer: ' + b.err);
  const r = await run(path.join(dir, 'uses'), packages, tree);
  fs.rmSync(dir, {recursive:true, force:true});
  assert.equal(r.code, 0, 'usage observer on ' + packages.join(' ') + ': ' + r.err);
  return JSON.parse(r.out);
}
// readmeRows parses the contract/README.md table into rows of its four cells.
function readmeRows(text) {
  const lines = text.split('\n');
  const at = lines.indexOf(HEADER);
  assert.notEqual(at, -1, 'contract/README.md has no table headed ' + HEADER);
  const rows = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ').map(c => c.trim()));
  }
  return rows;
}
const ticked = cell => cell.split(', ').map(s => (/^`([^`]+)`$/.exec(s) || [])[1]);
// goodSource is `<consumer>/<path in that repository>.go` for one of the row's consumers; a kogen
// path is under cli/, test/ or features/.
function goodSource(s, consumers) {
  return Boolean(s) && consumers.some(c => s.startsWith(c + '/') && /^[\w./-]+\.go$/.test(s.slice(c.length + 1)) &&
    (c !== 'kogen' || /^(cli|test|features)\//.test(s.slice(c.length + 1))));
}
// inventoryObservation compares the inventory with the members the suite's files use and the
// README rows: every list is empty when they agree.
function inventoryObservation(inventory, used, rows, tests) {
  const seen = {}, o = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[]};
  for (const row of rows) {
    const [member] = ticked(row[0] || '');
    if (seen[member]) o.duplicate_rows.push(member);
    seen[member] = row;
    if (!(member in inventory)) { o.extra_rows.push(String(member)); continue; }
    if (row.length !== 4 || row[1] !== inventory[member].join(', ')) o.wrong_consumers.push(member);
    if (!ticked(row[2] || '').every(s => goodSource(s, inventory[member]))) o.bad_sources.push(member);
    if (!ticked(row[3] || '').every(t => t && tests.includes(t))) o.unknown_tests.push(member);
  }
  for (const member of Object.keys(inventory)) {
    if (!used.includes(member)) o.unused.push(member);
    if (!seen[member]) o.missing_rows.push(member);
  }
  for (const k of Object.keys(o)) o[k] = [...new Set(o[k])].sort();
  return o;
}
// independence lists imports beyond the standard library (go/* excluded), the three
// kogen-coordinator packages, kogen-loop/sys and the contract's own packages, and Go files with
// a string that starts with "..".
function independence(imports, files) {
  const foreign = imports.filter(i => {
    if (ALLOWED.includes(i) || i === MODULE + '/contract' || i.startsWith(MODULE + '/contract/')) return false;
    const first = i.split('/')[0];
    return first.includes('.') || first === 'go' || first === 'kogen-loop';
  });
  const parent = Object.keys(files).filter(f => /["`]\.\.(?:[/"`])/.test(files[f])).sort();
  return {foreign_imports:foreign.sort(), parent_paths:parent};
}
// outcome runs the packages' tests in a fresh copy of the tree, after applying change when
// given: {file, from, to, count} replaces every occurrence of from, which must occur count times.
async function outcome(change, packages = ['./contract/...'], args = []) {
  const tree = copyTree();
  try {
    if (change) {
      const file = path.join(tree, change.file);
      const text = fs.readFileSync(file, 'utf8');
      const n = text.split(change.from).length - 1;
      if (n !== change.count) return 'anchor found ' + n + ' times';
      fs.writeFileSync(file, text.split(change.from).join(change.to));
      const b = await run(go(), ['build', '-trimpath', '-o', os.devNull, './...'], tree);
      if (b.code !== 0) return 'change does not build';
    }
    const s = summarize(await run(go(), ['test', '-trimpath', '-json', '-count=1', '-timeout', '180s', ...args, ...packages], tree));
    if (s.buildFailed) return 'contract does not build';
    if (s.failed.length > 0) return 'contract failed';
    if (s.exit !== 0) return 'go test exited ' + s.exit;
    if (s.passed.length === 0) return 'no contract tests';
    return 'contract passed';
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(PARALLEL, items.length)}, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
async function inventoryRun(inventory) {
  const tree = copyTree();
  try {
    const u = await uses(tree, ['./contract/...']);
    const l = await run(go(), ['test', '-list', '.', './contract/...'], tree);
    assert.equal(l.code, 0, 'go test -list . ./contract/...: ' + l.out + l.err);
    const tests = l.out.split('\n').filter(s => /^Test\w*$/.test(s));
    const readme = path.join(tree, 'contract', 'README.md');
    assert.ok(fs.existsSync(readme), 'contract/README.md is missing');
    return inventoryObservation(inventory, u.uses, readmeRows(fs.readFileSync(readme, 'utf8')), tests);
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
async function independenceRun() {
  const tree = copyTree();
  try {
    const u = await uses(tree, ['./contract/...']);
    return {go_mod:fs.readFileSync(path.join(tree, 'go.mod'), 'utf8'), go_sum:fs.readFileSync(path.join(tree, 'go.sum'), 'utf8'),
      ...independence(u.imports, contractFiles(tree))};
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
// docs reads README.md's Packages section and contract/README.md.
function docs() {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const packages = (/^## Packages\n([\s\S]*?)(?=^## )/m.exec(readme) || ['', ''])[1];
  const contract = path.join(ROOT, 'contract', 'README.md');
  return {
    readme_packages_entry:/^- `contract\/?`: \S.*$/m.test(packages),
    readme_links_contract:readme.includes('](contract/)'),
    contract_readme_change_rule:fs.existsSync(contract) && fs.readFileSync(contract, 'utf8').includes(RULE),
  };
}

const MESSAGE_TEST = ['-run', '^TestCommitMessageFormat$'];
const MESSAGE = {file:'git/commit.go', from:'"\\n\\nKogen-Intent: "', to:'"\\n\\nKogen-Slug: "', count:1};
const GOOD_SUITE = {exit:0, build_failed:false, packages_not_passed:[], tests_failed:[], tests_skipped:[], ran_tests:true, packages_over_30_seconds:[], not_in_go_list_all:[], build_constraints:[]};
const EMPTY_INVENTORY = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[]};
const SAMPLE = {'git.New':['kogen', 'kogen-build'], 'project.Hash':['kogen-verification'], 'durable.Sync':['kogen-shaping', 'kogen-build']};
const SAMPLE_README = [HEADER, '| --- | --- | --- | --- |',
  '| `git.New` | kogen, kogen-build | `kogen/cli/facts.go`, `kogen-build/build/commit_test.go` | `TestRepo` |',
  '| `project.Hash` | kogen-verification | `kogen-verification/verify/readiness_test.go` | `TestHash`, `TestRepo` |',
  '| `durable.Sync` | kogen-shaping, kogen-build | `kogen-build/build/helper_test.go` | `TestSync` |', ''].join('\n');
const SAMPLE_TESTS = ['TestRepo', 'TestHash', 'TestSync'];
const inv = (used, readme, tests) => isDeepStrictEqual(inventoryObservation(SAMPLE, used, readmeRows(readme), tests), EMPTY_INVENTORY);
async function inCopy(fn) { const t = copyTree(); try { return await fn(t); } finally { fs.rmSync(t, {recursive:true, force:true}); } }
// Each control case returns true when the observer accepted its input.
const CONTROLS = {
  good:[
    () => inCopy(async t => isDeepStrictEqual(await suite(t, ['./git'], MESSAGE_TEST), GOOD_SUITE)),
    async () => (await outcome(null, ['./git'], MESSAGE_TEST)) === 'contract passed',
    async () => (await outcome(MESSAGE, ['./git'], MESSAGE_TEST)) === 'contract failed',
    () => inCopy(async t => { const u = await uses(t, ['./project']); return ['git.New', 'git.Repo.Tree', 'durable.Sync', 'project.Hash'].every(m => u.uses.includes(m)) && isDeepStrictEqual(independence(u.imports, {}), {foreign_imports:[], parent_paths:[]}); }),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README, SAMPLE_TESTS),
    async () => isDeepStrictEqual(independence(['testing', 'net/http/httptest', 'kogen-loop/sys', MODULE + '/git', MODULE + '/contract/internal/fixture'], {'contract/a_test.go':'p := filepath.Join(dir, "testdata", "x")'}), {foreign_imports:[], parent_paths:[]}),
  ],
  bad:[
    () => inCopy(async t => { fs.writeFileSync(path.join(t, MESSAGE.file), fs.readFileSync(path.join(t, MESSAGE.file), 'utf8').replace(MESSAGE.from, MESSAGE.to)); return isDeepStrictEqual(await suite(t, ['./git'], MESSAGE_TEST), GOOD_SUITE); }),
    async () => (await outcome({...MESSAGE, from:'"\\n\\nKogen-Intent:: "'}, ['./git'], MESSAGE_TEST)) === 'contract failed',
    async () => (await outcome(MESSAGE, ['./git'], ['-run', '^NoSuchTest$'])) === 'contract failed',
    async () => (await outcome({...MESSAGE, to:'"\\n\\nKogen-Intent: " +'}, ['./git'], MESSAGE_TEST)) === 'contract failed',
    async () => inv(['git.New', 'project.Hash'], SAMPLE_README, SAMPLE_TESTS),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README.replace('| kogen-verification |', '| kogen |'), SAMPLE_TESTS),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README.replace('`kogen-build/build/helper_test.go`', '`kogen-verification/verify/x_test.go`'), SAMPLE_TESTS),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README.replace('`kogen/cli/facts.go`', '`kogen/facts.go`'), SAMPLE_TESTS),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README, ['TestRepo', 'TestHash']),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README.split('\n').filter(l => !l.includes('`project.Hash`')).join('\n'), SAMPLE_TESTS),
    async () => inv(Object.keys(SAMPLE), SAMPLE_README.replace('| --- | --- | --- | --- |', '| --- | --- | --- | --- |\n| `git.Open` | kogen | `kogen/cli/engine.go` | `TestRepo` |'), SAMPLE_TESTS),
    async () => isDeepStrictEqual(independence(['testing', 'github.com/KogenAI/kogen-build/build'], {}), {foreign_imports:[], parent_paths:[]}),
    async () => isDeepStrictEqual(independence(['testing', 'kogen-loop/provider'], {}), {foreign_imports:[], parent_paths:[]}),
    async () => isDeepStrictEqual(independence(['testing', 'go/parser'], {}), {foreign_imports:[], parent_paths:[]}),
    async () => isDeepStrictEqual(independence(['testing'], {'contract/a_test.go':'os.ReadFile("../project/testdata/golden.json")'}), {foreign_imports:[], parent_paths:[]}),
  ],
};

if (require.main === module) {
  const kind = process.argv[3];
  if (process.argv[2] !== '--control' || !(kind in CONTROLS)) {
    console.log('usage: k_contracts_coordinator.js --control good|bad'); process.exitCode = 2;
  } else {
    (async () => {
      const accepted = [];
      for (const c of CONTROLS[kind]) accepted.push(await c());
      if (kind === 'good' && accepted.every(Boolean)) console.log('contract suite observer accepted');
      else if (kind === 'bad' && !accepted.some(Boolean)) { console.log('contract suite observer rejected'); process.exitCode = 1; }
      else { console.log('contract suite observer control ' + kind + ' failed: ' + JSON.stringify(accepted)); process.exitCode = 3; }
    })().catch(e => { console.log('contract suite observer control error: ' + e.message); process.exitCode = 4; });
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const json = s => JSON.parse(s);
  When('I run the kogen-coordinator contract suite offline', {timeout:600000}, async function () {
    this.kccSuite = await inCopy(t => suite(t));
  });
  Then('the coordinator contract suite run observations are:', function (doc) {
    assert.deepEqual(this.kccSuite, json(doc), 'contract suite run ' + JSON.stringify(this.kccSuite));
  });
  Given('the kogen-coordinator members its consumers use are:', function (table) {
    this.kccInventory = Object.fromEntries(table.hashes().map(r => [r.member, r.consumers.split(', ')]));
  });
  When('I compare the coordinator contract suite and contract\\/README.md with that inventory', {timeout:600000}, async function () {
    this.kccInventoryObservation = await inventoryRun(this.kccInventory);
  });
  Then('the coordinator contract inventory observations are:', function (doc) {
    assert.deepEqual(this.kccInventoryObservation, json(doc), 'contract inventory ' + JSON.stringify(this.kccInventoryObservation));
  });
  When('I observe what the coordinator contract suite depends on', {timeout:600000}, async function () {
    this.kccIndependence = await independenceRun();
  });
  Then('the coordinator contract dependency observations are:', function (doc) {
    assert.deepEqual(this.kccIndependence, json(doc), 'contract dependencies ' + JSON.stringify(this.kccIndependence));
  });
  Given('these consumer-relied kogen-coordinator behaviour changes:', function (doc) {
    this.kccChanges = json(doc);
  });
  When('I run the coordinator contract suite on the unchanged tree and after each change', {timeout:1800000}, async function () {
    const cases = [{id:'unchanged', change:null}, ...this.kccChanges.map(c => ({id:c.id, change:c}))];
    const results = await pool(cases, c => outcome(c.change));
    this.kccOutcomes = Object.fromEntries(cases.map((c, i) => [c.id, results[i]]));
  });
  Then('the coordinator contract suite outcomes are:', function (doc) {
    assert.deepEqual(this.kccOutcomes, json(doc), 'contract suite outcomes ' + JSON.stringify(this.kccOutcomes));
  });
  When('I read the coordinator contract documentation', function () {
    this.kccDocs = docs();
  });
  Then('the coordinator contract documentation observations are:', function (doc) {
    assert.deepEqual(this.kccDocs, json(doc), 'contract documentation ' + JSON.stringify(this.kccDocs));
  });
}
