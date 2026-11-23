// Steps of the Intent project-encodejson-number-validation. A generated Go driver (package main, in
// a temporary folder of the module, built with go build) calls project.EncodeJSON with json.Number
// values at top level, as a map value or as a slice element, and prints one line ENCODE_RESULT=<JSON>
// mapping each input text to its observed outcome.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'project-encodejson-number-validation';
const SHAPES = ['top level', 'a map', 'a slice'];

const driver = String.raw`
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	var inputs []string
	if err := json.Unmarshal([]byte(os.Getenv("ENCODE_INPUTS")), &inputs); err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
	shape := os.Getenv("ENCODE_SHAPE")
	results := map[string]string{}
	for _, in := range inputs {
		n := json.Number(in)
		var v any
		switch shape {
		case "top level":
			v = n
		case "a map":
			v = map[string]any{"n": n}
		case "a slice":
			v = []any{n}
		default:
			fmt.Fprintf(os.Stderr, "driver setup: unknown ENCODE_SHAPE %q\n", shape)
			os.Exit(2)
		}
		out, err := project.EncodeJSON(v)
		switch {
		case err == nil:
			results[in] = string(out)
		case len(out) == 0:
			results[in] = "error"
		default:
			results[in] = "error with result " + string(out)
		}
	}
	b, err := json.Marshal(results)
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
	fmt.Println("ENCODE_RESULT=" + string(b))
}
`;

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// run builds the driver in a temporary folder of the module and encodes the inputs in one shape.
function run(shape, inputs) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), driver);
    const binary = path.join(dir, 'encode-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 100000, env: cleanEnv()
    });
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${(build.stdout || '') + (build.stderr || '')}`);
    const result = cp.spawnSync(binary, [], {
      encoding: 'utf8', timeout: 100000,
      env: { ...cleanEnv(), ENCODE_SHAPE: shape, ENCODE_INPUTS: JSON.stringify(inputs) }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (ENCODE_SHAPE=${shape}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('ENCODE_RESULT='));
    assert.equal(rows.length, 1, `${binary} (ENCODE_SHAPE=${shape}) must print exactly one ENCODE_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('ENCODE_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const { When, Then } = require('@cucumber/cucumber');

When(SLUG + ': EncodeJSON encodes these json.Number values in {string}', { timeout: 110000 }, function (shape, docString) {
  assert.ok(SHAPES.includes(shape), `unknown shape ${shape}; want one of ${SHAPES.join(', ')}`);
  const inputs = JSON.parse(docString);
  assert.ok(Array.isArray(inputs) && inputs.length > 0, 'the inputs must be a nonempty JSON array of strings');
  this.encodeObservation = run(shape, inputs);
});

Then(SLUG + ': the outcomes are', function (docString) {
  assert.deepEqual(this.encodeObservation, JSON.parse(docString));
});
