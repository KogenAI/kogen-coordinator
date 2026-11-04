const assert = require('node:assert/strict');
const BOM = '﻿';
// expand turns a fixture into its two readings: {BOM} as U+FEFF, and {BOM} removed.
function expand(text) { return [text.split('{BOM}').join(BOM), text.split('{BOM}').join('')]; }
// subset compares only the keys the expectation names, as JSON values.
function subset(actual, want) {
  const picked = {};
  for (const key of Object.keys(want)) picked[key] = actual[key];
  assert.deepEqual(picked, want);
}
if (require.main === module) {
  try { subset(JSON.parse(process.argv[2]), JSON.parse(process.argv[3])); console.log('match'); }
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
type input struct { Kind string; Texts []string; Feature string }
func check(e error) { if e != nil { panic(e) } }
func repo() string {
 root, e := os.MkdirTemp("", "bom-reading-"); check(e)
 for _, args := range [][]string{{"init", "-q", root}, {"-C", root, "config", "user.name", "Fixture User"}} {
  if o, e := exec.Command("git", args...).CombinedOutput(); e != nil { panic(string(o)) }
 }
 return root
}
func failure(e error, out map[string]any) {
 if e == nil { out["error"], out["lines"] = "", []string{}; return }
 if s, ok := sys.AsError(e); ok { out["error"], out["lines"] = s.Class+"/"+s.Reason, s.Lines; if s.Lines == nil { out["lines"] = []string{} }; return }
 out["error"], out["lines"] = e.Error(), []string{}
}
func read(kind, text, feature string) map[string]any {
 out := map[string]any{}
 switch kind {
 case "feature":
  s, e := project.ParseGherkin(text)
  out["scenarios"] = s
  if s == nil { out["scenarios"] = []project.Scenario{} }
  out["error"] = ""
  if e != nil { out["error"] = e.Error() }
 case "intent":
  root := repo(); defer os.RemoveAll(root)
  check(os.MkdirAll(filepath.Join(root, project.IntentDir("demo")), 0755))
  overlay := map[string][]byte{project.IntentMDPath("demo"): []byte(text), project.FeaturePath("demo"): []byte(feature)}
  i, e := project.ReadIntent(root, "demo", overlay); check(e)
  out["title"], out["slug"], out["model"] = i.Title, i.SlugLine, i.ModelLine
  out["acceptance"], out["decisions"], out["tests"], out["feasibility"] = i.Acceptance, i.Decisions, i.Tests, i.Feasibility
  out["text_as_written"] = i.Text == text
  _, _, e = project.CheckIntent(root, "demo", overlay)
  failure(e, out)
 case "config":
  root := repo(); defer os.RemoveAll(root)
  check(os.MkdirAll(filepath.Join(root, ".kogen"), 0755))
  check(os.WriteFile(filepath.Join(root, project.ConfigPath), []byte(text), 0644))
  c, e := project.LoadConfig(root)
  out["config"] = c
  out["fix"] = []string{}
  if c != nil { out["fix"] = c.Fix }
  failure(e, out)
  if s, ok := sys.AsError(e); ok { out["detail"] = s.Detail[len(root)+1:] }
 case "hash":
  root := repo(); defer os.RemoveAll(root)
  check(os.MkdirAll(filepath.Join(root, project.IntentDir("demo")), 0755))
  check(os.WriteFile(filepath.Join(root, project.IntentMDPath("demo")), []byte(text), 0644))
  out["hash"] = project.Hash(root, []string{project.IntentMDPath("demo")})
 default:
  panic("unknown kind " + kind)
 }
 return out
}
func main() {
 b, e := io.ReadAll(os.Stdin); check(e)
 var in input; check(json.Unmarshal(b, &in))
 res := []map[string]any{}
 for _, t := range in.Texts { res = append(res, read(in.Kind, t, in.Feature)) }
 check(json.NewEncoder(os.Stdout).Encode(res))
}
`;
  function run(world, kind, text, feature) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bom-driver-'));
    try {
      const file = path.join(dir, 'main.go'); fs.writeFileSync(file, driver);
      const input = JSON.stringify({ Kind: kind, Texts: expand(text), Feature: feature === undefined ? '' : feature.split('{BOM}').join(BOM) });
      [world.withBOM, world.withoutBOM] = JSON.parse(execFileSync('go', ['run', file], { input, encoding: 'utf8', timeout: 170000 }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  When('coord-text-files-utf8-bom: I parse this feature text', { timeout: 180000 }, function(text) { run(this, 'feature', text); });
  When('coord-text-files-utf8-bom: I read and check this Intent with a BOM-prefixed acceptance feature', { timeout: 180000 }, function(text) {
    run(this, 'intent', text, '{BOM}Feature: Fixture\n  Scenario: Fixture\n    Then fixture passes\n');
  });
  When('coord-text-files-utf8-bom: I load this project.yaml', { timeout: 180000 }, function(text) { run(this, 'config', text); });
  When('coord-text-files-utf8-bom: I hash this intent.md', { timeout: 180000 }, function(text) { run(this, 'hash', text); });
  Then('coord-text-files-utf8-bom: the reading with the BOM equals the reading without it', function() {
    assert.deepEqual(this.withBOM, this.withoutBOM);
  });
  Then('coord-text-files-utf8-bom: the reading with the BOM includes', function(expected) {
    subset(this.withBOM, JSON.parse(expected));
  });
  Then('coord-text-files-utf8-bom: the reading with the BOM differs from the reading without it', function() {
    assert.notDeepEqual(this.withBOM, this.withoutBOM);
  });
  Then('coord-text-files-utf8-bom: no message of the reading with the BOM mentions it', function() {
    const messages = JSON.stringify([this.withBOM.error, this.withBOM.lines, this.withBOM.detail]);
    assert.ok(!messages.includes(BOM), 'a message mentions U+FEFF: ' + messages);
  });
}
