// Steps of the Intent coord-load-config-read-error-named. A small Go driver built from this
// checkout's module calls project.LoadConfig on a temporary root and prints JSON.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, After} = require('@cucumber/cucumber');

const REPO = path.resolve(__dirname, '..', '..');

const DRIVER = `package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	cfg, err := project.LoadConfig(os.Args[1])
	out := map[string]any{}
	if err != nil {
		e, ok := sys.AsError(err)
		if !ok {
			out["text"] = err.Error()
		} else {
			out["class"] = e.Class
			out["reason"] = e.Reason
			out["exit"] = e.Exit
			out["detail"] = e.Detail
		}
	} else {
		checks := []map[string]string{}
		for _, c := range cfg.Checks {
			checks = append(checks, map[string]string{"name": c.Name, "run": c.Run})
		}
		out["checks"] = checks
	}
	b, _ := json.Marshal(out)
	fmt.Println(string(b))
}
`;

let driverBinary;
function driver() {
  if (driverBinary) return driverBinary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-load-config-read-error-named-driver-'));
  process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
  const source = path.join(dir, 'main.go');
  fs.writeFileSync(source, DRIVER);
  const bin = path.join(dir, 'driver');
  const r = spawnSync('go', ['build', '-o', bin, source], {cwd: REPO, encoding: 'utf8'});
  assert.equal(r.status, 0, `go build ${source} in ${REPO} exited ${r.status}:\n${r.stdout}${r.stderr}`);
  driverBinary = bin;
  return bin;
}

const VALID = "version: 1\ncommands:\n  checks:\n    - name: test\n      run: 'go test ./...'\n";

Given('coord-load-config-read-error-named: a root with project.yaml {string}', function (kind) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-load-config-read-error-named-'));
  this.root = root;
  const file = path.join(root, '.kogen', 'project.yaml');
  if (kind !== 'absent') fs.mkdirSync(path.join(root, '.kogen'));
  if (kind === 'directory') fs.mkdirSync(file);
  else if (kind === 'unreadable') {
    fs.writeFileSync(file, VALID);
    fs.chmodSync(file, 0);
    if (process.getuid && process.getuid() === 0) return 'skipped';
  } else if (kind === 'dangling') fs.symlinkSync(path.join(root, 'missing-target'), file);
  else if (kind === 'valid') fs.writeFileSync(file, VALID);
});

When('coord-load-config-read-error-named: LoadConfig runs', function () {
  const r = spawnSync(driver(), [this.root], {encoding: 'utf8'});
  assert.equal(r.status, 0, `driver exited ${r.status}: ${r.stdout}${r.stderr}`);
  this.result = JSON.parse(r.stdout);
  this.result.detail = (this.result.detail || '').split(this.root).join('<root>');
});

Then('coord-load-config-read-error-named: the error is {string} with exit code {int}', function (code, exit) {
  assert.equal(`${this.result.class}/${this.result.reason}`, code, JSON.stringify(this.result));
  assert.equal(this.result.exit, exit);
});

Then('coord-load-config-read-error-named: the detail ends with {string}', function (tail) {
  assert.ok(this.result.detail.endsWith(tail), JSON.stringify(this.result));
});

Then('coord-load-config-read-error-named: the detail names the file and contains {string}', function (text) {
  assert.ok((this.result.detail || '').includes('<root>/.kogen/project.yaml'), JSON.stringify(this.result));
  assert.ok(this.result.detail.includes(text), JSON.stringify(this.result));
});

Then('coord-load-config-read-error-named: the detail does not contain {string}', function (text) {
  assert.ok(!(this.result.detail || '').includes(text), JSON.stringify(this.result));
});

Then('coord-load-config-read-error-named: the load succeeds with check {string} running {string}', function (name, run) {
  assert.deepEqual(this.result.checks, [{name, run}], JSON.stringify(this.result));
});

After(function () {
  if (!this.root) return;
  try { fs.chmodSync(path.join(this.root, '.kogen', 'project.yaml'), 0o644); } catch (e) {}
  fs.rmSync(this.root, {recursive: true, force: true});
});
