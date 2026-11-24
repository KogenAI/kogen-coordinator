// Regression-test acceptance: run the real rules tests in disposable module copies.
// CLI good/bad qualifies these exact observer bytes against controls.json's added tests
// and the frozen pre-regression test file, respectively. No production files are edited in the checkout.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const SLUG = 'rules-oversized-response-test';
const INTENT = '.kogen/intents/' + SLUG;

function replaceOnce(src, from, to) {
  assert.equal(src.split(from).length, 2, 'mutation anchor must occur exactly once: ' + from);
  return src.replace(from, to);
}
function oversizedOnly(src) {
  src = replaceOnce(src, 'return nil, "malformed_response", nil\n\t}\n\trules, ok := parseResponse', 'return nil, "oversized_control", nil\n\t}\n\trules, ok := parseResponse');
  return replaceOnce(src, '\trules, reason, refused := fetch(ctx, client, cfg, token)', '\trules, reason, refused := fetch(ctx, client, cfg, token)\n\toversizedControl := reason == "oversized_control"\n\tif oversizedControl { reason = "malformed_response" }');
}
const mutations = {
  'accept oversized': src => replaceOnce(replaceOnce(src, 'io.ReadAll(io.LimitReader(resp.Body, maxBody+1))', 'io.ReadAll(resp.Body)'), 'if len(body) > maxBody {', 'if false {'),
  'save rejected body': src => replaceOnce(oversizedOnly(src), '\treturn nil, fail(opts, &Error{Class: class, Reason: reason})', '\tif oversizedControl { writeCache(root, &Snapshot{Scope: scope, Rules: []Rule{}}) }\n\treturn nil, fail(opts, &Error{Class: class, Reason: reason})'),
  'skip verified fallback': src => replaceOnce(oversizedOnly(src), 'if cached := readCache(root, scope); cached != nil {', 'if cached := readCache(root, scope); cached != nil && !oversizedControl {'),
  'wrong fallback reason': src => replaceOnce(oversizedOnly(src), 'cached.FallbackReason = reason', 'cached.FallbackReason = reason\n\t\tif oversizedControl { cached.FallbackReason = "unreachable" }'),
  'wrong hold class': src => replaceOnce(oversizedOnly(src), '\treturn nil, fail(opts, &Error{Class: class, Reason: reason})', '\tif oversizedControl && cfg.OnUnavailable == "hold" { class = ClassUnavailable }\n\treturn nil, fail(opts, &Error{Class: class, Reason: reason})'),
  'wrong unavailable class': src => replaceOnce(oversizedOnly(src), '\treturn nil, fail(opts, &Error{Class: class, Reason: reason})', '\tif oversizedControl && cfg.OnUnavailable == "unavailable" { class = ClassHold }\n\treturn nil, fail(opts, &Error{Class: class, Reason: reason})'),
  'reject limit boundary': src => replaceOnce(src, 'if len(body) > maxBody {', 'if len(body) >= maxBody {'),
};
function run(dir, deadline) {
  const command = 'go test -json -count=1 ./rules';
  const r = cp.spawnSync('go', ['test', '-json', '-count=1', './rules'], {cwd: dir, encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: Infinity});
  const output = (r.stdout || '') + (r.stderr || '');
  assert.ifError(r.error);
  const events = (r.stdout || '').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const ran = events.filter(e => e.Action === 'run' && e.Test).map(e => e.Test);
  assert.ok(ran.includes('TestLiveAndHash'), `${command}: TestLiveAndHash absent, skipped or ran zero times; status=${r.status}\n${output}`);
  return {status: r.status, output, ran, failed: events.filter(e => e.Action === 'fail' && e.Test).map(e => e.Test), packagePassed: events.some(e => e.Action === 'pass' && !e.Test)};
}
function observe(testOverride) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), SLUG + '-'));
  try {
    fs.cpSync(root, dir, {recursive: true, filter: p => !['.git', '.kogen', 'features'].includes(path.relative(root, p).split(path.sep)[0])});
    if (testOverride !== undefined) fs.writeFileSync(path.join(dir, 'rules/rules_test.go'), testOverride);
    const file = path.join(dir, 'rules/rules.go');
    const src = fs.readFileSync(file, 'utf8');
    const deadline = Date.now() + 120000;
    const results = {original: run(dir, deadline)};
    for (const [name, mutate] of Object.entries(mutations)) {
      fs.writeFileSync(file, mutate(src));
      results[name] = run(dir, deadline);
    }
    return results;
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function passes(r) {
  assert.ok(r.status === 0 && r.packagePassed, `go test -json -count=1 ./rules must pass and execute tests; status=${r.status}\n${r.output}`);
}
function catches(r, name) {
  assert.ok(Number.isInteger(r.status) && r.status !== 0 && r.failed.length > 0,
    `go test -json -count=1 ./rules must fail a test for mutation "${name}", not merely fail compilation; status=${r.status}; failed tests=${r.failed.join(', ')}\n${r.output}`);
}
if (require.main === module) {
  const kind = process.argv[2];
  assert.ok(kind === 'good' || kind === 'bad', 'usage: good|bad');
  const controls = JSON.parse(fs.readFileSync(path.join(INTENT, 'controls.json'), 'utf8'));
  const correct = controls.correct.files['rules/rules_test.go'];
  const marker = '\n// sizedStudioResponse';
  assert.equal(correct.split(marker).length, 2, 'known-bad fixture boundary must be unique');
  const baseline = correct.split(marker)[0];
  const results = observe(kind === 'good' ? correct : baseline);
  passes(results.original);
  let rejected = false;
  for (const name of Object.keys(mutations)) {
    try { catches(results[name], name); console.log('accepted ' + name); }
    catch (_) { rejected = true; console.log('rejected ' + name); }
  }
  process.exit(rejected ? 1 : 0);
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(SLUG + ': the rules tests run on the original loader and oversized-response mutations', {timeout: 120000}, function () { this.oversizedCoverage = observe(); });
  Then(SLUG + ': the rules tests pass on the original loader', function () { passes(this.oversizedCoverage.original); });
  Then(SLUG + ': the rules tests detect {string}', function (name) {
    assert.ok(Object.hasOwn(mutations, name), 'unknown mutation: ' + name);
    catches(this.oversizedCoverage[name], name);
  });
}
