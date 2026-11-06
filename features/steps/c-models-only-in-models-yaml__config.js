// Steps of the Intent c-models-only-in-models-yaml. Each scenario writes its own project files in
// a new temporary folder. A small Go driver, built once per run from this checkout's module, calls
// project.LoadConfig, project.ParseConfig, project.ReadableConfig, project.RenderConfig and
// project.Template and prints JSON; every output also carries project.DefaultModels(). The
// checkout itself is never written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, After} = require('@cucumber/cucumber');

const PREFIX = 'c-models-only-in-models-yaml: ';
const REPO = path.resolve(__dirname, '..', '..');
const SLOW = {timeout: 600000};

const DRIVER = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

type role struct {
	Role     string \`json:"role"\`
	Executor string \`json:"executor"\`
	Provider string \`json:"provider"\`
	Model    string \`json:"model"\`
	Effort   string \`json:"effort"\`
	External bool   \`json:"external"\`
}

func roles(m map[string]project.Role) []role {
	out := []role{}
	for _, name := range project.ModelRoles {
		r := m[name]
		out = append(out, role{name, r.Executor, r.Provider, r.Model, r.Effort, r.External()})
	}
	return out
}

func list(ss []string) []string {
	if ss == nil {
		return []string{}
	}
	return ss
}

func describe(cfg *project.Config) map[string]any {
	checks := []map[string]string{}
	for _, c := range cfg.Checks {
		checks = append(checks, map[string]string{"name": c.Name, "run": c.Run})
	}
	var acceptance any
	if cfg.Acceptance != nil {
		acceptance = map[string]string{"run": cfg.Acceptance.Run, "steps_dir": cfg.Acceptance.StepsDir}
	}
	return map[string]any{"setup": list(cfg.Setup), "fix": list(cfg.Fix), "checks": checks,
		"acceptance": acceptance, "protect": list(cfg.Protect), "roles": roles(cfg.Models)}
}

func failure(err error, root string) map[string]any {
	hide := func(s string) string {
		if root == "" {
			return s
		}
		return strings.ReplaceAll(s, root, "<root>")
	}
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

func readBack(text string) map[string]any {
	m := map[string]any{"text": text}
	cfg, err := project.ParseConfig(text, "rendered")
	if err != nil {
		m["error"] = failure(err, "")
		return m
	}
	m["config"] = describe(cfg)
	return m
}

func main() {
	out := map[string]any{"defaults": roles(project.DefaultModels())}
	mode := os.Args[1]
	switch mode {
	case "load", "parse", "readable":
		root := os.Args[2]
		file := filepath.Join(root, project.ConfigPath)
		var cfg *project.Config
		var err error
		switch mode {
		case "load":
			cfg, err = project.LoadConfig(root)
		case "parse", "readable":
			b, rerr := os.ReadFile(file)
			if rerr != nil {
				panic(rerr)
			}
			if mode == "parse" {
				cfg, err = project.ParseConfig(string(b), file)
			} else {
				cfg = project.ReadableConfig(string(b))
			}
		}
		if err != nil {
			out["error"] = failure(err, root)
		} else {
			out["config"] = describe(cfg)
		}
	case "render":
		models := map[string]project.Role{}
		for _, name := range project.ModelRoles {
			models[name] = project.Role{Executor: os.Args[2], Model: os.Args[3], Effort: os.Args[4]}
		}
		input := &project.Config{
			Setup:      []string{"go mod download"},
			Fix:        []string{"gofmt -w ."},
			Checks:     []project.Check{{Name: "test", Run: "go test ./..."}},
			Acceptance: &project.Acceptance{Run: "it's", StepsDir: "features/steps"},
			Protect:    []string{".golangci.yml"},
			Models:     models,
		}
		out["input"] = describe(input)
		out["render"] = readBack(project.RenderConfig(input))
		out["template"] = readBack(project.Template())
		out["empty_render"] = project.RenderConfig(&project.Config{})
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-models-only-in-models-yaml-driver-'));
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
  if (!world.cModelsOnly) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'c-models-only-in-models-yaml-'));
    const fx = {base, root: path.join(base, 'project'), home: path.join(base, 'home')};
    fs.mkdirSync(fx.root, {recursive: true});
    fs.mkdirSync(fx.home, {recursive: true});
    fx.env = isolatedEnv(fx.home);
    world.cModelsOnly = fx;
  }
  return world.cModelsOnly;
}

function write(fx, rel, text) {
  const file = path.join(fx.root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

function run(fx, args) {
  const bin = driver();
  const r = spawnSync(bin, args, {cwd: fx.root, env: fx.env, encoding: 'utf8'});
  assert.equal(r.status, 0, `the driver (${args.join(' ')}) exited ${r.status} ${r.error || ''}:\n${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}

function result(world) {
  const fx = world.cModelsOnly;
  assert.ok(fx && fx.result, 'no driver result: no When step ran');
  return fx.result;
}

// loaded is the configuration of a successful call; it fails with the reported error otherwise.
function loaded(world) {
  const r = result(world);
  assert.equal(r.error, undefined, `the call failed: ${JSON.stringify(r.error)}`);
  assert.ok(r.config, `the call returned no configuration: ${JSON.stringify(r)}`);
  return r.config;
}

// asRows turns roles into the strings a Gherkin table holds.
function asRows(roles) {
  return roles.map(r => ({role: r.role, executor: r.executor, provider: r.provider, model: r.model, effort: r.effort, external: String(r.external)}));
}

function rendered(world, key) {
  const r = result(world);
  assert.ok(r[key], `the driver reported no ${key}: ${JSON.stringify(r)}`);
  return r[key];
}

function noLineStarting(label, text, prefix) {
  const hits = text.split('\n').filter(l => l.trimStart().startsWith(prefix));
  assert.deepEqual(hits, [], `the ${label} has a line starting with ${JSON.stringify(prefix)}:\n${text}`);
}

function readsBack(label, out) {
  assert.equal(out.error, undefined, `the ${label} does not read back with ParseConfig: ${JSON.stringify(out.error)}\n${out.text}`);
  assert.ok(out.config, `the ${label} read back with no configuration`);
  return out.config;
}

After(function() {
  if (this.cModelsOnly) fs.rmSync(this.cModelsOnly.base, {recursive: true, force: true});
});

Given(PREFIX + 'a temporary project whose {string} is:', function(rel, text) {
  assert.equal(rel, '.kogen/project.yaml');
  write(fixture(this), rel, text + '\n');
});

Given(PREFIX + 'the project\'s {string} is:', function(rel, text) {
  write(fixture(this), rel, text + '\n');
});

Given(PREFIX + 'the project has no {string} and no {string}', function(a, b) {
  const fx = fixture(this);
  for (const rel of [a, b]) {
    assert.equal(fs.existsSync(path.join(fx.root, rel)), false, `${rel} exists in the temporary project`);
  }
});

When(PREFIX + 'Kogen loads the configuration with LoadConfig', SLOW, function() {
  const fx = fixture(this);
  fx.result = run(fx, ['load', fx.root]);
});

When(PREFIX + 'Kogen parses {string} with ParseConfig', SLOW, function(rel) {
  assert.equal(rel, '.kogen/project.yaml');
  const fx = fixture(this);
  fx.result = run(fx, ['parse', fx.root]);
});

When(PREFIX + 'Kogen reads {string} with ReadableConfig', SLOW, function(rel) {
  assert.equal(rel, '.kogen/project.yaml');
  const fx = fixture(this);
  fx.result = run(fx, ['readable', fx.root]);
});

When(PREFIX + 'Kogen renders with RenderConfig a configuration whose three roles are executor {string}, model {string} and effort {string}', SLOW, function(executor, model, effort) {
  const fx = fixture(this);
  fx.result = run(fx, ['render', executor, model, effort]);
});

Then(PREFIX + 'the result is the error {string} with exit {int}, detail {string} and exactly the lines:', function(kind, exit, detail, text) {
  const r = result(this);
  assert.ok(r.error, `the call succeeded: ${JSON.stringify(r.config)}`);
  const [klass, reason] = kind.split('/');
  assert.deepEqual(r.error, {class: klass, reason, exit, detail, lines: text.split('\n')});
});

Then(PREFIX + 'the roles are:', function(table) {
  assert.deepEqual(asRows(loaded(this).roles), table.hashes());
});

Then(PREFIX + 'the roles equal the built-in DefaultModels', function() {
  const r = result(this);
  assert.equal(r.defaults.length, 3, `DefaultModels: ${JSON.stringify(r.defaults)}`);
  assert.deepEqual(loaded(this).roles, r.defaults);
});

Then(PREFIX + 'the checks are:', function(table) {
  assert.deepEqual(loaded(this).checks, table.hashes());
});

Then(PREFIX + 'the protect patterns are:', function(table) {
  assert.deepEqual(loaded(this).protect, table.hashes().map(h => h.pattern));
});

Then(PREFIX + 'the rendered text has no line starting with {string}', function(prefix) {
  noLineStarting('rendered text', rendered(this, 'render').text, prefix);
});

Then(PREFIX + 'the rendered text is exactly:', function(text) {
  assert.equal(rendered(this, 'render').text, text + '\n');
});

Then(PREFIX + 'the rendered text reads back with ParseConfig to the rendered setup, fix, checks, acceptance and protect', function() {
  const back = readsBack('rendered text', rendered(this, 'render'));
  const input = rendered(this, 'input');
  for (const key of ['setup', 'fix', 'checks', 'acceptance', 'protect']) {
    assert.deepEqual(back[key], input[key], `${key} read back differs`);
  }
});

Then(PREFIX + 'the roles read back from the rendered text equal the built-in DefaultModels', function() {
  const back = readsBack('rendered text', rendered(this, 'render'));
  assert.deepEqual(back.roles, result(this).defaults);
});

Then(PREFIX + 'the template has no line starting with {string}', function(prefix) {
  noLineStarting('template', rendered(this, 'template').text, prefix);
});

Then(PREFIX + 'the template reads back with ParseConfig with the built-in DefaultModels', function() {
  const back = readsBack('template', rendered(this, 'template'));
  assert.deepEqual(back.roles, result(this).defaults);
  assert.ok(rendered(this, 'template').text.startsWith('version: 1\ncommands:\n'), 'the template does not start with version: 1 and commands:');
});

Then(PREFIX + 'RenderConfig of an empty configuration is the template', function() {
  assert.equal(rendered(this, 'empty_render'), rendered(this, 'template').text);
});
