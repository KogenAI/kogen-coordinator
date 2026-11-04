const assert = require('node:assert/strict');
function compare(actual, expected) { assert.deepEqual(actual, expected); }
if (require.main === module) {
  try { compare(JSON.parse(process.argv[2]), JSON.parse(process.argv[3])); console.log('match'); }
  catch (_) { console.log('mismatch'); process.exitCode = 1; }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const driver = `package main
import (
 "encoding/json"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "github.com/KogenAI/kogen-coordinator/project"
 "github.com/KogenAI/kogen-loop/sys"
)
func main() {
 b,e:=io.ReadAll(os.Stdin); if e!=nil {panic(e)}
 root,e:=os.MkdirTemp("","wrapped-intent-"); if e!=nil {panic(e)}; defer os.RemoveAll(root)
 c:=exec.Command("git","init","-q",root); if o,e:=c.CombinedOutput();e!=nil {panic(string(o))}
 c=exec.Command("git","-C",root,"config","user.name","Fixture User"); if o,e:=c.CombinedOutput();e!=nil {panic(string(o))}
 if e:=os.MkdirAll(filepath.Join(root,project.IntentDir("demo")),0755);e!=nil {panic(e)}
 overlay:=map[string][]byte{project.IntentMDPath("demo"):b,project.FeaturePath("demo"):[]byte("Feature: Fixture\\n  Scenario: Fixture\\n    Then fixture passes\\n")}
 i,e:=project.ReadIntent(root,"demo",overlay);if e!=nil {panic(e)}
 lines:=[]string{}
 if _,_,e:=project.CheckIntent(root,"demo",overlay);e!=nil {s,ok:=sys.AsError(e);if !ok {panic(e)};lines=s.Lines}
 out:=map[string]any{"acceptance":i.Acceptance,"decisions":i.Decisions,"tests":i.Tests,"feasibility":i.Feasibility,"unchanged":i.Text==string(b),"lines":lines}
 if e:=json.NewEncoder(os.Stdout).Encode(out);e!=nil {panic(e)}
}
`;
  When('coord-intent-wrapped-bullets: I read and lint this Intent', { timeout: 120000 }, function(text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapped-driver-'));
    try {
      const file = path.join(dir, 'main.go'); fs.writeFileSync(file, driver);
      this.wrapped = JSON.parse(execFileSync('go', ['run', file], { input: text, encoding: 'utf8', timeout: 110000 }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  Then('coord-intent-wrapped-bullets: the parsed result is', function(expected) {
    const want = JSON.parse(expected);
    const actual = {};
    for (const key of Object.keys(want)) actual[key] = this.wrapped[key];
    compare(actual, want);
  });
  Then('coord-intent-wrapped-bullets: lint names the required marker for {string}', function(section) {
    const lines = this.wrapped.lines.filter(l => l.startsWith(section + ':'));
    assert.ok(lines.some(l => l.includes('- ') && /marker|bullet/i.test(l)), JSON.stringify(lines));
    assert.ok(!lines.some(l => /missing or empty/.test(l)), JSON.stringify(lines));
  });
}
