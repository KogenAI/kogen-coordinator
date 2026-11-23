// Steps of the Intent approval-slug-binding. A generated Go driver (package main, in a temporary
// folder of the module, built with go build) writes an approval file in a fresh root and calls
// project.ReadApproval, then prints one line APPROVAL_RESULT=<JSON> of observations.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'approval-slug-binding';
const CASES = ['mismatch', 'match', 'absent'];

const driver = String.raw`
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-coordinator/project"
)

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
}

func put(root, requested, recorded string) {
	path := project.ApprovalPath(root, requested)
	check(os.MkdirAll(filepath.Dir(path), 0o755))
	body := "{\"slug\":\"" + recorded + "\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":null}\n"
	check(os.WriteFile(path, []byte(body), 0o644))
}

func main() {
	root, err := os.MkdirTemp("", "approval-slug-")
	check(err)
	defer os.RemoveAll(root)
	var requested string
	switch os.Getenv("APPROVAL_CASE") {
	case "mismatch":
		requested = "requested-slug"
		put(root, requested, "recorded-slug")
	case "match":
		requested = "requested-slug"
		put(root, requested, "requested-slug")
	case "absent":
		requested = "requested-slug"
	default:
		check(fmt.Errorf("unknown APPROVAL_CASE %q", os.Getenv("APPROVAL_CASE")))
	}
	a, err := project.ReadApproval(root, requested)
	r := map[string]any{"approval_returned": a != nil, "error_returned": err != nil}
	if err != nil {
		r["error_names_requested_slug"] = strings.Contains(err.Error(), "requested-slug")
		r["error_names_recorded_slug"] = strings.Contains(err.Error(), "recorded-slug")
	}
	if a != nil {
		r["slug"], r["sha256"] = a.Slug, a.SHA256
	}
	b, err := json.Marshal(r)
	check(err)
	fmt.Println("APPROVAL_RESULT=" + string(b))
}
`;

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// run builds the driver in a temporary folder of the module and runs one case.
function run(name) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), driver);
    const binary = path.join(dir, 'approval-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 100000, env: cleanEnv()
    });
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${(build.stdout || '') + (build.stderr || '')}`);
    const result = cp.spawnSync(binary, [], { encoding: 'utf8', timeout: 100000, env: { ...cleanEnv(), APPROVAL_CASE: name } });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (APPROVAL_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('APPROVAL_RESULT='));
    assert.equal(rows.length, 1, `${binary} (APPROVAL_CASE=${name}) must print exactly one APPROVAL_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('APPROVAL_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const { When, Then } = require('@cucumber/cucumber');

When(SLUG + ': the driver runs the {string} case', { timeout: 110000 }, function (name) {
  assert.ok(CASES.includes(name), `unknown case ${name}`);
  this.approvalObservation = run(name);
});

Then(SLUG + ': the observation is', function (docString) {
  assert.deepEqual(this.approvalObservation, JSON.parse(docString));
});
