const { When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const driver = `package main
import (
 "encoding/json"
 "os"
 "os/exec"
 "path/filepath"
 "github.com/KogenAI/kogen-coordinator/project"
 repogit "github.com/KogenAI/kogen-coordinator/git"
 "github.com/KogenAI/kogen-loop/sys"
)
func main() {
 root, err := os.MkdirTemp("", "owner-title-"); if err != nil { panic(err) }; defer os.RemoveAll(root)
 run := func(args ...string) { c:=exec.Command("git",args...); c.Dir=root; if b,e:=c.CombinedOutput(); e!=nil { panic(string(b)+e.Error()) } }
 run("init","-q"); run("config","user.name",os.Args[2])
 p:=project.IntentDir("demo"); if e:=os.MkdirAll(filepath.Join(root,p),0755); e!=nil { panic(e) }
 text := "# "+os.Args[1]+"\\n\\nSlug: demo\\nModel: not applicable — stateless\\nAcceptance:\\n- "+project.FeaturePath("demo")+"\\n\\n## Tests\\n- none: fixture\\n\\n## Feasibility\\n- none\\n"
 overlay:=map[string][]byte{project.IntentMDPath("demo"):[]byte(text),project.FeaturePath("demo"):[]byte("Feature: Fixture\\n  Scenario: Fixture\\n    Then fixture passes\\n")}
 out:=struct { Exit int; Lines []string; Message string }{Message:repogit.CommitMessage(os.Args[1],"demo")}
 if _,_,e:=project.CheckIntent(root,"demo",overlay); e!=nil { se,ok:=sys.AsError(e); if !ok { panic(e) }; out.Exit=se.Exit; out.Lines=se.Lines }
 if e:=json.NewEncoder(os.Stdout).Encode(out); e!=nil { panic(e) }
}
`;
When('coord-commit-message-first-person: I lint title {string} with Git user {string}', { timeout: 120000 }, function(title, user) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-driver-'));
  try {
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, driver);
    this.ownerTitle = title;
    this.ownerResult = JSON.parse(execFileSync('go', ['run', file, title, user], { cwd: process.cwd(), encoding: 'utf8', timeout: 110000 }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
Then('coord-commit-message-first-person: the title is {string}', function(result) {
  const out = this.ownerResult;
  if (result === 'accepted') {
    assert.deepEqual({ exit: out.Exit, lines: out.Lines || [] }, { exit: 0, lines: [] });
  } else {
    assert.equal(out.Exit, 1, JSON.stringify(out));
    assert.ok(out.Lines.some(line => /title/i.test(line) && /owner|user|authoriz|approv/i.test(line)), JSON.stringify(out));
  }
});
Then('coord-commit-message-first-person: the commit message is', function(expected) {
  assert.equal(this.ownerResult.Exit, 0, JSON.stringify(this.ownerResult));
  assert.equal(this.ownerResult.Message, expected.replace(/\\n/g, '\n'));
});
