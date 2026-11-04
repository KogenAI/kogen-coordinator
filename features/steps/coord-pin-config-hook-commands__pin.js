// Steps of coord-pin-config-hook-commands: git.Repo.TakePin and git.Pin.Changes on real
// repositories, through a Go driver built from the repository root. Each fixture has its own HOME,
// XDG_CONFIG_HOME and global configuration file (GIT_CONFIG_GLOBAL), no system configuration
// (GIT_CONFIG_NOSYSTEM=1), and one hooks directory that core.hooksPath names in every repository.
// The driver also reports every string the pins retain (unexported fields included, by reflection),
// so a configuration value kept anywhere in a pin is seen.
//
// Run directly, `node <this file> good|bad` is the observer control: two repositories compared
// through the real driver whose pins differ in core.pager (good: named, value not retained) or in
// core.hooksPath (bad: the hooks directory path, a configuration value, is retained).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const driverSource = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"reflect"

	"github.com/KogenAI/kogen-coordinator/git"
)

type request struct {
	Mode     string     \`json:"mode"\`
	Repos    []string   \`json:"repos"\`
	Env      []string   \`json:"env"\`
	AfterEnv []string   \`json:"after_env"\`
	Git      [][]string \`json:"git"\`
}

// retained collects every string reachable from v, unexported fields included.
func retained(v reflect.Value, out *[]string) {
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if !v.IsNil() {
			retained(v.Elem(), out)
		}
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			retained(v.Field(i), out)
		}
	case reflect.Slice, reflect.Array:
		for i := 0; i < v.Len(); i++ {
			retained(v.Index(i), out)
		}
	case reflect.Map:
		iter := v.MapRange()
		for iter.Next() {
			retained(iter.Key(), out)
			retained(iter.Value(), out)
		}
	case reflect.String:
		*out = append(*out, v.String())
	}
}

func pin(dir string, env []string) *git.Pin {
	p, err := git.New(dir, env).TakePin()
	if err != nil {
		fmt.Fprintln(os.Stderr, "TakePin:", err)
		os.Exit(1)
	}
	return p
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fmt.Fprintln(os.Stderr, "request:", err)
		os.Exit(2)
	}
	var a, b *git.Pin
	switch req.Mode {
	case "compare":
		a = pin(req.Repos[0], req.Env)
		for _, args := range req.Git {
			cmd := exec.Command("git", args...)
			cmd.Dir, cmd.Env = req.Repos[0], req.Env
			if out, err := cmd.CombinedOutput(); err != nil {
				fmt.Fprintf(os.Stderr, "git %q: %v\\n%s", args, err, out)
				os.Exit(1)
			}
		}
		b = pin(req.Repos[0], append(append([]string{}, req.Env...), req.AfterEnv...))
	case "pair":
		a, b = pin(req.Repos[0], req.Env), pin(req.Repos[1], req.Env)
	default:
		fmt.Fprintln(os.Stderr, "unknown mode", req.Mode)
		os.Exit(2)
	}
	changes := a.Changes(b)
	if changes == nil {
		changes = []string{}
	}
	strs := []string{}
	retained(reflect.ValueOf(a), &strs)
	retained(reflect.ValueOf(b), &strs)
	json.NewEncoder(os.Stdout).Encode(map[string]any{"changes": changes, "retained": strs})
}
`;

// The existing pin tests, by package, that must still pass unchanged.
const EXISTING = {
  './git': ['TestPinHooksDirectory', 'TestPinEffectiveHooksDirectory', 'TestPinExecutableConfiguration',
    'TestPinConditionalIncludeThroughSymlinkedCheckout', 'TestPinReadsDefaultConfigurationLocations',
    'TestPinRunsNothing', 'TestPinUnreadableIsAnError'],
  './contract': ['TestPinNamesWhatChanged'],
};

// The process environment without Git's own variables: Go builds and tests run with it.
function processEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return env;
}

let driverDir = null;
function driverBinary() {
  if (driverDir) return path.join(driverDir, 'driver');
  driverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-hook-driver-'));
  const file = path.join(driverDir, 'main.go');
  fs.writeFileSync(file, driverSource);
  const res = spawnSync('go', ['build', '-o', path.join(driverDir, 'driver'), file], { cwd: process.cwd(), env: processEnv(), encoding: 'utf8', timeout: 280000 });
  assert.equal(res.status, 0, `go build of the pin driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  return path.join(driverDir, 'driver');
}

function removeDriver() {
  if (driverDir) fs.rmSync(driverDir, { recursive: true, force: true });
  driverDir = null;
}

function runDriver(req) {
  const res = spawnSync(driverBinary(), [], { input: JSON.stringify(req), env: processEnv(), encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  assert.equal(res.status, 0, `the pin driver failed for ${JSON.stringify(req.git || req.repos)} (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  return JSON.parse(res.stdout);
}

function newFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-hook-'));
  const f = { dir, hooks: path.join(dir, 'hooks'), home: path.join(dir, 'home'), global: path.join(dir, 'global.gitconfig'), marker: path.join(dir, 'ran'), repos: [] };
  fs.mkdirSync(f.hooks);
  fs.mkdirSync(f.home);
  fs.writeFileSync(f.global, '');
  f.env = { ...processEnv(), HOME: f.home, XDG_CONFIG_HOME: path.join(dir, 'xdg'), GIT_CONFIG_GLOBAL: f.global, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  return f;
}

function envList(f) {
  return Object.entries(f.env).map(([k, v]) => `${k}=${v}`);
}

function git(f, cwd, args, allowed = [0]) {
  const res = spawnSync('git', args, { cwd, env: f.env, encoding: 'utf8', timeout: 60000 });
  assert.ok(allowed.includes(res.status), `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
  return res;
}

// addRepository is a new repository whose core.hooksPath names the fixture's hooks directory and
// whose effective configuration has no key of the hook section.
function addRepository(f, name) {
  const repo = path.join(f.dir, name);
  fs.mkdirSync(repo);
  git(f, repo, ['init', '-q']);
  git(f, repo, ['config', 'core.hooksPath', f.hooks]);
  const hooks = git(f, repo, ['config', '--get-regexp', '^hook\\.'], [0, 1]);
  assert.equal(hooks.stdout, '', `the new repository already has hook-section keys: ${hooks.stdout}`);
  f.repos.push(repo);
  return repo;
}

function checkChanges(result, want) {
  assert.deepEqual(result.changes, want, `the pin comparison reported ${JSON.stringify(result.changes)}, expected ${JSON.stringify(want)}`);
}

// checkRetained: the pins were walked (the hooks directory and at least one digest were seen) and
// neither a retained string nor a reported change contains text.
function checkRetained(result, text, hooks) {
  assert.ok(result.retained.includes(hooks), `the pins' retained strings do not include the hooks directory ${hooks}: ${JSON.stringify(result.retained)}`);
  assert.ok(result.retained.some(s => /^[0-9a-f]{64}$/.test(s)), `the pins retain no SHA-256 digest: ${JSON.stringify(result.retained)}`);
  const kept = result.retained.filter(s => s.includes(text));
  assert.deepEqual(kept, [], `the pins retain ${JSON.stringify(text)}`);
  assert.ok(!result.changes.some(s => s.includes(text)), `the reported changes ${JSON.stringify(result.changes)} contain ${JSON.stringify(text)}`);
}

if (require.main === module) {
  const kind = process.argv[2];
  const f = newFixture();
  let verdict;
  try {
    const a = addRepository(f, 'a');
    const b = addRepository(f, 'b');
    let want, text;
    if (kind === 'good') {
      git(f, a, ['config', 'core.pager', './pager-secret-a']);
      git(f, b, ['config', 'core.pager', './pager-secret-b']);
      want = ['core.pager'];
      text = 'pager-secret';
    } else if (kind === 'bad') {
      const other = path.join(f.dir, 'hooks-secret');
      fs.mkdirSync(other);
      git(f, b, ['config', 'core.hooksPath', other]);
      want = ['core.hooksPath', 'hooks directory ' + other];
      text = 'hooks-secret';
    } else {
      throw new Error(`unknown control ${JSON.stringify(kind)}`);
    }
    const result = runDriver({ mode: 'pair', repos: [a, b], env: envList(f) });
    try {
      checkChanges(result, want);
      checkRetained(result, text, f.hooks);
      verdict = 'match';
    } catch (e) {
      if (!(e instanceof assert.AssertionError)) throw e;
      verdict = 'mismatch';
    }
  } catch (e) {
    console.log(`error: ${e.message}`);
    process.exitCode = 2;
  } finally {
    fs.rmSync(f.dir, { recursive: true, force: true });
    removeDriver();
  }
  if (verdict) {
    console.log(verdict);
    process.exitCode = verdict === 'match' ? 0 : 1;
  }
} else {
  const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');

  After(function () {
    if (this.pinHook) fs.rmSync(this.pinHook.dir, { recursive: true, force: true });
  });
  AfterAll(removeDriver);

  function fixture(world) {
    assert.ok(world.pinHook, 'no fixture: a Given step must create the repositories first');
    return world.pinHook;
  }

  // commands parses "git <args> [&& git <args>...]", arguments separated by single spaces;
  // HOOK_SCRIPT stands for the fixture's recording hook script.
  function commands(f, text) {
    return text.split(' && ').map(c => {
      const words = c.split(' ');
      assert.equal(words[0], 'git', `not a git command: ${JSON.stringify(c)}`);
      return words.slice(1).map(w => (w === 'HOOK_SCRIPT' ? f.script : w));
    });
  }

  Given('coord-pin-config-hook-commands: a repository with no hook-section configuration', function () {
    this.pinHook = newFixture();
    addRepository(this.pinHook, 'repo');
  });

  Given('coord-pin-config-hook-commands: the repository has local configuration {string} set to {string}', function (key, value) {
    const f = fixture(this);
    git(f, f.repos[0], ['config', key, value]);
  });

  Given('coord-pin-config-hook-commands: two repositories sharing one hooks directory whose local {string} values are {string} and {string}', function (key, one, two) {
    this.pinHook = newFixture();
    git(this.pinHook, addRepository(this.pinHook, 'one'), ['config', key, one]);
    git(this.pinHook, addRepository(this.pinHook, 'two'), ['config', key, two]);
  });

  Given('coord-pin-config-hook-commands: a hook script that records when it runs', function () {
    const f = fixture(this);
    f.script = path.join(f.dir, 'record-hook.sh');
    fs.writeFileSync(f.script, `#!/bin/sh\nprintf ran >> '${f.marker}'\nexit 0\n`, { mode: 0o755 });
    fs.chmodSync(f.script, 0o755);
  });

  When('coord-pin-config-hook-commands: the pin is taken and compared after {string}', { timeout: 300000 }, function (text) {
    const f = fixture(this);
    f.result = runDriver({ mode: 'compare', repos: [f.repos[0]], env: envList(f), git: commands(f, text) });
  });

  When('coord-pin-config-hook-commands: the pin is taken and compared after adding command-line configuration {string} set to {string}', { timeout: 300000 }, function (key, value) {
    const f = fixture(this);
    f.result = runDriver({ mode: 'compare', repos: [f.repos[0]], env: envList(f), git: [], after_env: ['GIT_CONFIG_COUNT=1', `GIT_CONFIG_KEY_0=${key}`, `GIT_CONFIG_VALUE_0=${value}`] });
  });

  When('coord-pin-config-hook-commands: the pins of the two repositories are compared', { timeout: 300000 }, function () {
    const f = fixture(this);
    f.result = runDriver({ mode: 'pair', repos: f.repos, env: envList(f) });
  });

  Then('coord-pin-config-hook-commands: the comparison reports exactly {string}', function (list) {
    checkChanges(fixture(this).result, list.split(', '));
  });

  Then('coord-pin-config-hook-commands: the comparison reports no change', function () {
    checkChanges(fixture(this).result, []);
  });

  Then('coord-pin-config-hook-commands: no string retained by the pins contains {string}', function (text) {
    const f = fixture(this);
    checkRetained(f.result, text, f.hooks);
  });

  Then('coord-pin-config-hook-commands: the hook script did not run', function () {
    const f = fixture(this);
    assert.ok(!fs.existsSync(f.marker), `taking or comparing the pin ran the configured hook command ${f.script}`);
  });

  Then('coord-pin-config-hook-commands: the existing pin tests pass', { timeout: 300000 }, function () {
    const args = ['test', '-count=1', '-v', '-run', '^TestPin', ...Object.keys(EXISTING)];
    const command = `go ${args.join(' ')}`;
    const res = spawnSync('go', args, { cwd: process.cwd(), env: processEnv(), encoding: 'utf8', timeout: 290000, maxBuffer: 64 << 20 });
    const out = `${res.stdout}${res.stderr}`;
    for (const [pkg, names] of Object.entries(EXISTING)) {
      for (const name of names) {
        const outcome = new RegExp(`^--- (PASS|FAIL|SKIP): ${name} `, 'm').exec(out);
        assert.ok(outcome, `the existing test ${name} (${pkg}) did not run in \`${command}\` (exit ${res.status}): it is absent from the output:\n${out}`);
        assert.equal(outcome[1], 'PASS', `the existing test ${name} (${pkg}) reported ${outcome[1]} in \`${command}\` (exit ${res.status}):\n${out}`);
      }
    }
    assert.equal(res.status, 0, `\`${command}\` failed (exit ${res.status}, signal ${res.signal}, error ${res.error}):\n${out}`);
  });
}
