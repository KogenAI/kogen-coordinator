const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('k-coord-reject-max-rounds: I load {string} with role {string} and options {string}', function(file, role, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reject-rounds-'));
  try {
    fs.mkdirSync(path.join(root, '.kogen/local'), {recursive: true});
    fs.writeFileSync(path.join(root, '.kogen/models.yaml'), 'models: {}\n');
    const yaml = `${file === '.kogen/project.yaml' ? 'version: 1\n' : ''}models:\n  ${role}: {model: m, effort: high, ${options}}\n`;
    fs.writeFileSync(path.join(root, file), yaml);
    const source = path.join(root, 'main.go');
    fs.writeFileSync(source, `package main
import("encoding/json"; "fmt"; "os"; "github.com/KogenAI/kogen-coordinator/project")
func main() { var err error; if os.Args[2] == ".kogen/project.yaml" { _, err = project.LoadConfig(os.Args[1]) } else { _, err = project.LoadModels(os.Args[1]) }; if err == nil { fmt.Println("RESULT: <nil>") } else { b, e := json.Marshal(err); if e != nil { panic(e) }; fmt.Printf("RESULT: %s\\n", b) } }
`);
    const result = spawnSync('go', ['run', source, root, file], {encoding: 'utf8'});
    this.rejectRoundsOutput = result.status === 0 ? result.stdout : `PROCESS FAILURE: ${result.error || ''}\n${result.stdout}\n${result.stderr}`;
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
Then('k-coord-reject-max-rounds: the result matches {string}', function(pattern) {
  const insensitive = pattern.startsWith('(?is)');
  assert.match(this.rejectRoundsOutput, new RegExp(insensitive ? pattern.slice(6) : pattern, insensitive ? 'is' : ''));
});
