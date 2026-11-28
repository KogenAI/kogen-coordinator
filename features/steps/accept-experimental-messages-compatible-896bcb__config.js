// Steps of the Intent accept-experimental-messages-compatible-896bcb. Each scenario writes its own
// project files in a new temporary folder. A small Go driver, built once per run from this
// checkout's module, calls project.LoadConfig or project.LoadModels and prints JSON with the
// effective roles (provider, model, effort and base URL) or the configuration error. The checkout
// itself is never written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, After} = require('@cucumber/cucumber');

const PREFIX = 'accept-experimental-messages-compatible-896bcb: ';
const REPO = path.resolve(__dirname, '..', '..');
const SLOW = {timeout: 600000};

const DRIVER = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

type role struct {
	Role     string \`json:"role"\`
	Provider string \`json:"provider"\`
	Model    string \`json:"model"\`
	Effort   string \`json:"effort"\`
	BaseURL  string \`json:"base_url"\`
}

func roles(m map[string]project.Role) []role {
	out := []role{}
	for _, name := range project.ModelRoles {
		r := m[name]
		out = append(out, role{name, r.Provider, r.Model, r.Effort, r.BaseURL})
	}
	return out
}

func failure(err error, root string) map[string]any {
	hide := func(s string) string { return strings.ReplaceAll(s, root, "<root>") }
	e, ok := sys.AsError(err)
	if !ok {
		return map[string]any{"text": hide(err.Error())}
	}
	lines := []string{}
	for _, l := range e.Lines {
		lines = append(lines, hide(l))
	}
	return map[string]any{"class": e.Class, "reason": e.Reason, "exit": e.Exit, "detail": hide(e.Detail), "lines": lines}
}

func main() {
	mode, root := os.Args[1], os.Args[2]
	out := map[string]any{}
	switch mode {
	case "load":
		cfg, err := project.LoadConfig(root)
		if err != nil {
			out["error"] = failure(err, root)
		} else {
			out["roles"] = roles(cfg.Models)
		}
	case "models":
		lineup, err := project.LoadModels(root)
		if err != nil {
			out["error"] = failure(err, root)
		} else {
			out["roles"] = roles(lineup.Roles)
		}
	default:
		panic("unknown mode " + mode)
	}
	b, err := json.Marshal(out)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
}
`;

let driverBinary;

// driver builds the Go driver once per process from this checkout's module.
function driver() {
  if (driverBinary) return driverBinary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-messages-compatible-driver-'));
  process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
  const source = path.join(dir, 'main.go');
  fs.writeFileSync(source, DRIVER);
  const bin = path.join(dir, 'driver');
  const r = spawnSync('go', ['build', '-o', bin, source], {cwd: REPO, encoding: 'utf8'});
  assert.equal(r.status, 0, `go build -o ${bin} ${source} in ${REPO} exited ${r.status} ${r.error || ''}:\n${r.stdout}${r.stderr}`);
  driverBinary = bin;
  return bin;
}

// isolatedEnv is the process environment without inherited Git or Kogen variables, with no global
// or system Git configuration and a HOME of its own.
function isolatedEnv(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k.startsWith('KOGEN_') || k === 'EMAIL') continue;
    env[k] = v;
  }
  return Object.assign(env, {HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'});
}

function fixture(world) {
  if (!world.messagesCompatible) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-messages-compatible-'));
    const fx = {base, root: path.join(base, 'project'), home: path.join(base, 'home')};
    fs.mkdirSync(fx.root, {recursive: true});
    fs.mkdirSync(fx.home, {recursive: true});
    fx.env = isolatedEnv(fx.home);
    world.messagesCompatible = fx;
  }
  return world.messagesCompatible;
}

function write(fx, rel, text) {
  const file = path.join(fx.root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

function run(fx, mode) {
  const r = spawnSync(driver(), [mode, fx.root], {cwd: fx.root, env: fx.env, encoding: 'utf8'});
  assert.equal(r.status, 0, `the driver (${mode}) exited ${r.status} ${r.error || ''}:\n${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}

function result(world) {
  const fx = world.messagesCompatible;
  assert.ok(fx && fx.result, 'no driver result: no When step ran');
  return fx.result;
}

After(function() {
  if (this.messagesCompatible) fs.rmSync(this.messagesCompatible.base, {recursive: true, force: true});
});

Given(PREFIX + 'a temporary project with a valid {string}', function(rel) {
  assert.equal(rel, '.kogen/project.yaml');
  write(fixture(this), rel, "version: 1\ncommands:\n  checks:\n    - name: test\n      run: 'go test ./...'\n");
});

Given(PREFIX + 'the project\'s {string} is:', function(rel, text) {
  write(fixture(this), rel, text + '\n');
});

When(PREFIX + 'Kogen loads the configuration with LoadConfig', SLOW, function() {
  const fx = fixture(this);
  fx.result = run(fx, 'load');
});

When(PREFIX + 'Kogen loads the model lineup with LoadModels', SLOW, function() {
  const fx = fixture(this);
  fx.result = run(fx, 'models');
});

Then(PREFIX + 'the {string} role has provider {string}, model {string}, effort {string} and base URL {string}', function(name, provider, model, effort, baseURL) {
  const r = result(this);
  assert.equal(r.error, undefined, `the call failed: ${JSON.stringify(r.error)}`);
  const got = r.roles.find(x => x.role === name);
  assert.ok(got, `no ${name} role in ${JSON.stringify(r.roles)}`);
  assert.deepEqual(got, {role: name, provider, model, effort, base_url: baseURL});
});

Then(PREFIX + 'the load fails with the error {string} with exit {int} and detail {string}', function(kind, exit, detail) {
  const r = result(this);
  assert.ok(r.error, `the call succeeded: ${JSON.stringify(r.roles)}`);
  const [klass, reason] = kind.split('/');
  assert.deepEqual({class: r.error.class, reason: r.error.reason, exit: r.error.exit, detail: r.error.detail},
    {class: klass, reason, exit, detail});
});

Then(PREFIX + 'the error has exactly one line and it starts with {string}', function(prefix) {
  const r = result(this);
  assert.ok(r.error, `the call succeeded: ${JSON.stringify(r.roles)}`);
  assert.equal(r.error.lines.length, 1, `error lines: ${JSON.stringify(r.error.lines)}`);
  assert.ok(r.error.lines[0].startsWith(prefix), `the error line ${JSON.stringify(r.error.lines[0])} does not start with ${JSON.stringify(prefix)}`);
});

Then(PREFIX + 'that error line contains {string}', function(text) {
  const r = result(this);
  assert.ok(r.error && r.error.lines.length === 1, `error: ${JSON.stringify(r.error)}`);
  assert.ok(r.error.lines[0].includes(text), `the error line ${JSON.stringify(r.error.lines[0])} does not contain ${JSON.stringify(text)}`);
});
