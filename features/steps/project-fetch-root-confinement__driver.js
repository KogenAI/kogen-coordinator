// Steps of the Intent project-fetch-root-confinement. A generated Go driver (package main, in a
// temporary folder of the module, built with go build) builds a fresh project root with an outside
// folder beside it, calls project.Fetch for a list of probes and prints one line FETCH_RESULT=<JSON>.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'project-fetch-root-confinement';
const CASES = ['traversal', 'symlink', 'valid-and-overlay'];

const driver = String.raw`
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/KogenAI/kogen-coordinator/project"
)

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
}

func write(path, body string) {
	check(os.MkdirAll(filepath.Dir(path), 0o755))
	check(os.WriteFile(path, []byte(body), 0o644))
}

type probe struct {
	name    string
	rel     string
	overlay map[string][]byte
}

func main() {
	base, err := os.MkdirTemp("", "fetch-confinement-")
	check(err)
	defer os.RemoveAll(base)
	root := filepath.Join(base, "project")
	outside := filepath.Join(base, "outside")
	write(filepath.Join(outside, "secret.txt"), "outside-secret")
	write(filepath.Join(root, "a", "b", "c.txt"), "disk-content")
	var probes []probe
	switch os.Getenv("FETCH_CASE") {
	case "traversal":
		probes = []probe{
			{"parent", "../outside/secret.txt", nil},
			{"nested_parent", "a/../../outside/secret.txt", nil},
			{"absolute", filepath.Join(outside, "secret.txt"), nil},
		}
	case "symlink":
		check(os.Symlink(outside, filepath.Join(root, "escape-dir")))
		check(os.Symlink(filepath.Join(outside, "secret.txt"), filepath.Join(root, "escape-file")))
		probes = []probe{
			{"symlink_dir", "escape-dir/secret.txt", nil},
			{"symlink_file", "escape-file", nil},
		}
	case "valid-and-overlay":
		check(os.Symlink("a", filepath.Join(root, "inside-link")))
		probes = []probe{
			{"nested_disk", "a/b/c.txt", nil},
			{"inside_symlink", "inside-link/b/c.txt", nil},
			{"overlay_over_disk", "a/b/c.txt", map[string][]byte{"a/b/c.txt": []byte("overlay-content")}},
			{"overlay_only", "new/file.txt", map[string][]byte{"new/file.txt": []byte("overlay-only-content")}},
			{"overlay_traversal_key", "../outside/secret.txt", map[string][]byte{"../outside/secret.txt": []byte("overlay-leak")}},
			{"traversal_still_rejected", "../outside/secret.txt", nil},
		}
	default:
		check(fmt.Errorf("unknown FETCH_CASE %q", os.Getenv("FETCH_CASE")))
	}
	r := map[string]any{}
	for _, p := range probes {
		b, err := project.Fetch(root, p.overlay, p.rel)
		r[p.name] = map[string]any{"error_returned": err != nil, "content": string(b)}
	}
	out, err := json.Marshal(r)
	check(err)
	fmt.Println("FETCH_RESULT=" + string(out))
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
    const binary = path.join(dir, 'fetch-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 100000, env: cleanEnv()
    });
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${(build.stdout || '') + (build.stderr || '')}`);
    const result = cp.spawnSync(binary, [], { encoding: 'utf8', timeout: 100000, env: { ...cleanEnv(), FETCH_CASE: name } });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (FETCH_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('FETCH_RESULT='));
    assert.equal(rows.length, 1, `${binary} (FETCH_CASE=${name}) must print exactly one FETCH_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('FETCH_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const { When, Then } = require('@cucumber/cucumber');

When(SLUG + ': the driver runs the {string} case', { timeout: 110000 }, function (name) {
  assert.ok(CASES.includes(name), `unknown case ${name}`);
  this.fetchObservation = run(name);
});

Then(SLUG + ': the observation is', function (docString) {
  assert.deepEqual(this.fetchObservation, JSON.parse(docString));
});
