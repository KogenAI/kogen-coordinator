const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function copy() {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-contract-'));
  fs.cpSync(root, dir, { recursive: true, filter: p => !['.git', 'node_modules', '.kogen/local'].includes(path.relative(root, p)) });
  return dir;
}
function run(dir, args) {
  const r = spawnSync('go', args, { cwd: dir, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GOFLAGS: '-trimpath' } });
  assert.ifError(r.error);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { status: r.status, events, stderr: r.stderr };
}
function observe(r, status, names, failures, fragments) {
  assert.equal(r.status, status, `go test status; stderr=${r.stderr}`);
  for (const name of names) {
    const end = r.events.filter(e => e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
    assert.equal(end.length, 1, `go test ./contract: ${name} absent or ran other than once`);
    assert.equal(end[0].Action, failures.includes(name) ? 'fail' : 'pass', `go test ./contract: ${name} skipped or wrong outcome`);
  }
  const actual = r.events.filter(e => e.Action === 'fail' && e.Test && names.includes(e.Test)).map(e => e.Test).sort();
  assert.deepEqual(actual, [...failures].sort(), 'go test ./contract: wrong fixture comparisons failed');
  const output = r.events.filter(e => names.includes(e.Test)).map(e => e.Output || '').join('');
  for (const text of fragments) assert.ok(output.includes(text), `go test ./contract: missing diagnostic ${text}\n${output}`);
}
function sameGolden(actual, expected) { assert.deepEqual(JSON.parse(actual), expected, 'ordered baseline golden'); }
function mutate(dir) {
  const p = path.join(dir, 'project/baseline.go');
  const text = fs.readFileSync(p, 'utf8');
  const needle = 'return slices.Insert(all, slices.Index(all, ConfigPath)+1, ModelsPath), nil';
  assert.equal(text.split(needle).length, 2, 'mutation must reach the existing Baseline return exactly once');
  fs.writeFileSync(p, text.replace(needle, 'result := slices.Insert(all, slices.Index(all, ConfigPath)+1, ModelsPath)\n\tif slices.Contains(cfg.Protect, "guard/**") { result = append(result, "baseline-mutation.txt") }\n\treturn result, nil'));
}

if (require.main === module) {
  const bad = process.argv[2] === 'bad';
  const dir = copy();
  try {
    // Obtain genuine passing runner output from a test that exists before this feature.
    const name = 'TestBaselineOrderAndProtectGlobs';
    const r = run(dir, ['test', '-json', '-count=1', './contract', '-run', '^' + name + '$']);
    const cases = [
      () => observe(bad ? { ...r, status: 1 } : r, 0, [name], [], []),
      () => observe(bad ? { ...r, events: [] } : r, 0, [name], [], []),
      () => observe(bad ? { ...r, events: r.events.map(e => e.Test === name && e.Action === 'pass' ? { ...e, Action: 'skip' } : e) } : r, 0, [name], [], []),
      () => sameGolden(bad ? '{"x":["b","a"]}' : '{"x":["a","b"]}', { x: ['a', 'b'] })
    ];
    // Real mismatch diagnostics from the existing test, not invented runner text.
    const p = path.join(dir, 'project/baseline.go');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('return slices.Insert(all, slices.Index(all, ConfigPath)+1, ModelsPath), nil', 'return append(slices.Insert(all, slices.Index(all, ConfigPath)+1, ModelsPath), "baseline-mutation.txt"), nil'));
    const failed = run(dir, ['test', '-json', '-count=1', './contract', '-run', '^' + name + '$']);
    cases.push(() => observe(bad ? { ...failed, events: failed.events.filter(e => e.Action !== 'fail') } : failed, 1, [name], [name], []));
    cases.push(() => observe(bad ? { ...failed, events: failed.events.map(e => ({ ...e, Output: '' })) } : failed, 1, [name], [name], ['Baseline = [', 'want [', 'baseline-mutation.txt']));
    for (const check of cases) {
      let accepted = true;
      try { check(); } catch (e) { accepted = false; if (!bad) throw e; }
      assert.equal(accepted, !bad, 'observer control polarity');
    }
    console.log(bad ? 'rejected' : 'accepted');
    process.exitCode = bad ? 1 : 0;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else {
  const { Then } = require('@cucumber/cucumber');
  Then('coord-baseline-contract-golden: the checked-in golden and contract comparisons satisfy:', { timeout: 900000 }, function (doc) {
    const expected = JSON.parse(doc);
    const golden = 'contract/testdata/baseline.json';
    sameGolden(fs.readFileSync(golden, 'utf8'), expected);
    const names = Object.keys(expected).map(k => 'TestBaselineContractGolden/' + k);
    const dirs = [copy(), copy()];
    try {
      for (const dir of dirs) {
        observe(run(dir, ['test', '-json', '-count=1', './contract']), 0, names, [], []);
        sameGolden(fs.readFileSync(path.join(dir, golden), 'utf8'), expected);
      }
      mutate(dirs[0]);
      const old = expected.protect;
      observe(run(dirs[0], ['test', '-json', '-count=1', './contract']), 1, names, ['TestBaselineContractGolden/protect'], [
        'old: ' + JSON.stringify(old), 'new: ' + JSON.stringify([...old, 'baseline-mutation.txt'])
      ]);
      sameGolden(fs.readFileSync(path.join(dirs[0], golden), 'utf8'), expected);
    } finally { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
