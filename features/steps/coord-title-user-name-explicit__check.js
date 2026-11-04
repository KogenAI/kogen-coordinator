const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function compare(actual, expected) {
  assert.deepEqual(actual || [], expected === '[]' ? [] : expected.split('\n'));
}
if (require.main === module) {
  try { compare(['diagnostic'], process.argv[2] === 'good' ? 'diagnostic' : '[]'); }
  catch { process.exitCode = 1; }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  const common = `package main
import (
 "encoding/json"
 "os"
 "github.com/KogenAI/kogen-coordinator/project"
)
`;
  const direct = common + `func main() { if e:=json.NewEncoder(os.Stdout).Encode(project.CheckTitle(os.Args[1],os.Args[2])); e!=nil { panic(e) } }
`;
  const repository = `package main
import (
 "encoding/json"
 "os"
 "os/exec"
 "github.com/KogenAI/kogen-coordinator/project"
 "github.com/KogenAI/kogen-loop/sys"
)
func main() {
 root:=os.Args[3]
 run:=func(args ...string) { c:=exec.Command("git",args...); c.Dir=root; if b,e:=c.CombinedOutput(); e!=nil { panic(string(b)+e.Error()) } }
 run("init","-q")
 if os.Args[2]!="" { run("config","user.name",os.Args[2]) }
 text:="# "+os.Args[1]+"\\nSlug: demo\\nModel: not applicable — stateless\\nAcceptance:\\n- "+project.FeaturePath("demo")+"\\n## Tests\\n- none: fixture\\n## Feasibility\\n- none\\n"
 overlay:=map[string][]byte{project.IntentMDPath("demo"):[]byte(text),project.FeaturePath("demo"):[]byte("Feature: Fixture\\n  Scenario: Fixture\\n    Then fixture passes\\n")}
 var lines []string
 if _,_,e:=project.CheckIntent(root,"demo",overlay); e!=nil { se,ok:=sys.AsError(e); if !ok { panic(e) }; lines=se.Lines }
 if e:=json.NewEncoder(os.Stdout).Encode(lines); e!=nil { panic(e) }
}
`;
  function run(title, name, isDirect) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explicit-title-'));
    try {
      const file = path.join(dir, 'main.go');
      fs.writeFileSync(file, isDirect ? direct : repository);
      const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0' };
      for (const k of Object.keys(env)) if (/^GIT_CONFIG_(KEY|VALUE)_/.test(k) || ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_CONFIG'].includes(k)) delete env[k];
      if (isDirect) {
        const bin = path.join(dir, 'driver');
        execFileSync('go', ['build', '-o', bin, file], { encoding: 'utf8', timeout: 110000 });
        env.PATH = dir;
        return JSON.parse(execFileSync(bin, [title, name], { env, encoding: 'utf8', timeout: 10000 }));
      }
      return JSON.parse(execFileSync('go', ['run', file, title, name, dir], { env, encoding: 'utf8', timeout: 110000 }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  When('coord-title-user-name-explicit: I check {string} using repository name {string}', { timeout: 120000 }, function(title, name) { this.explicitTitleProblems = run(title, name, false); });
  When('coord-title-user-name-explicit: I check {string} directly with name {string}', { timeout: 120000 }, function(title, name) { this.explicitTitleProblems = run(title, name, true); });
  Then('coord-title-user-name-explicit: the problems are', function(expected) { compare(this.explicitTitleProblems, expected); });
}
