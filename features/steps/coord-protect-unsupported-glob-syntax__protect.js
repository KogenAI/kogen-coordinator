const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function observe(actual, expected) {
  assert.deepEqual(actual.files, expected.files, 'protected file list');
  for (const phase of ['loaded', 'protected', 'repeated', 'direct']) {
    const diagnostics = actual[phase] || [];
    assert.equal(diagnostics.length, expected.diagnostics.length, `${phase}: one finding per entry and category`);
    expected.diagnostics.forEach((want, i) => {
      const got = diagnostics[i];
      assert.equal(got.Entry, want.entry, `${phase}: entry`);
      assert.equal(got.Severity, want.severity, `${phase}: severity`);
      for (const fragment of want.contains) assert.ok(got.Message.includes(fragment), `${phase}: ${JSON.stringify(got)} lacks ${fragment}`);
    });
  }
}

if (process.argv[2] === '--control') {
  const expected = { files: ['src/[ab].js'], diagnostics: [{ entry: 'tests/*.{js,ts}', severity: 'lint', contains: ['brace alternatives', '**/', '**', '*', '?'] }, { entry: 'tests/*.{js,ts}', severity: 'warning', contains: ['matches no file'] }] };
  const diagnostics = expected.diagnostics.map(d => ({ Entry: d.entry, Severity: d.severity, Message: d.contains.join(' ') }));
  const actual = { files: expected.files, loaded: diagnostics, protected: diagnostics, repeated: diagnostics, direct: diagnostics };
  if (process.argv[3] === 'bad') actual.direct = [];
  try { observe(actual, expected); console.log('observer accepted'); }
  catch (_) { console.log('observer rejected'); process.exitCode = 1; }
} else {
  const { When, Then, AfterAll } = require('@cucumber/cucumber');
  let buildDir;
  let binary;
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  function driver() {
    if (binary) return binary;
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'protect-driver-'));
    const source = path.join(buildDir, 'main.go');
    binary = path.join(buildDir, 'driver');
    fs.writeFileSync(source, `package main
import (
 "encoding/json"
 "fmt"
 "os"
 "github.com/KogenAI/kogen-coordinator/project"
)
func main() {
 root := os.Args[1]
 cfg, err := project.LoadConfig(root); if err != nil { panic(err) }
 snapshot := func(c *project.Config) any {
  b, err := json.Marshal(c); if err != nil { panic(err) }
  var m map[string]any; if err := json.Unmarshal(b, &m); err != nil { panic(err) }
  return m["ProtectDiagnostics"]
 }
 loaded := snapshot(cfg)
 files, err := project.Protected(root, cfg); if err != nil { panic(err) }
 protected := snapshot(cfg)
 _, err = project.Protected(root, cfg); if err != nil { panic(err) }
 repeated := snapshot(cfg)
 direct := &project.Config{Protect: cfg.Protect}
 _, err = project.Protected(root, direct); if err != nil { panic(err) }
 if files == nil { files = []string{} }
 b, err := json.Marshal(map[string]any{"files": files, "loaded": loaded, "protected": protected, "repeated": repeated, "direct": snapshot(direct)})
 if err != nil { panic(err) }; fmt.Println(string(b))
}
`);
    run('go', ['build', '-o', binary, source]);
    return binary;
  }
  AfterAll(function () { if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true }); });
  When('coord-protect-unsupported-glob-syntax: I check protection for:', { timeout: 180000 }, function (doc) {
    const input = JSON.parse(doc);
    const executable = driver();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'protect-tree-'));
    try {
      run('git', ['init', '-q', root]);
      const put = (name, body = 'fixture\n') => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
      for (const file of input.files || []) put(file);
      for (const dir of input.dirs || []) fs.mkdirSync(path.join(root, dir), { recursive: true });
      if (input.ignored) put('.gitignore', input.ignored.join('\n') + '\n');
      for (const file of input.tracked || []) run('git', ['-C', root, 'add', '--', file]);
      put('.kogen/project.yaml', 'version: 1\nprotect: ' + JSON.stringify(input.patterns) + '\n');
      this.protectObservation = JSON.parse(run(executable, [root]));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  Then('coord-protect-unsupported-glob-syntax: the machine-readable results are:', function (doc) {
    observe(this.protectObservation, JSON.parse(doc));
  });
}
