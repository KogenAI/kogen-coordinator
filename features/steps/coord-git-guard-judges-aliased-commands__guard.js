// Steps of coord-git-guard-judges-aliased-commands: the command guard of kogen-coordinator's git
// package (Repo.Run and Repo.OK) on a real repository, through a Go driver built from the repository
// root. A fixture is a repository with one commit (README.md "readme\n"), the identity
// Fixture <fixture@example.invalid>, and no global or system Git configuration. Run directly,
// `node <this file> good|bad` is the observer control: the same driver and checks on two outcomes
// that do not change with the feature (a plain push refusal and an ordinary log call).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const driverSource = `package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/git"
)

type request struct {
	Mode string   \`json:"mode"\`
	Dir  string   \`json:"dir"\`
	Env  []string \`json:"env"\`
	Args []string \`json:"args"\`
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fmt.Fprintln(os.Stderr, "request:", err)
		os.Exit(2)
	}
	repo := git.New(req.Dir, req.Env)
	out := map[string]any{"error": "", "forbidden": false, "status": 0, "stdout": ""}
	var err error
	if req.Mode == "ok" {
		var s string
		s, err = repo.OK(req.Args...)
		out["stdout"] = s
	} else {
		var res git.Result
		res, err = repo.Run(req.Args...)
		out["stdout"], out["status"] = res.Stdout, res.Status
	}
	if err != nil {
		out["error"] = err.Error()
		out["forbidden"] = errors.Is(err, git.ErrForbidden)
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

function processEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return env;
}

let driverDir = null;
function driverBinary() {
  if (driverDir) return path.join(driverDir, 'driver');
  driverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-guard-driver-'));
  const file = path.join(driverDir, 'main.go');
  fs.writeFileSync(file, driverSource);
  const res = spawnSync('go', ['build', '-o', path.join(driverDir, 'driver'), file], { cwd: process.cwd(), env: processEnv(), encoding: 'utf8', timeout: 280000 });
  assert.equal(res.status, 0, `go build of the guard driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  return path.join(driverDir, 'driver');
}

function removeDriver() {
  if (driverDir) fs.rmSync(driverDir, { recursive: true, force: true });
  driverDir = null;
}

function git(f, args) {
  const res = spawnSync('git', args, { cwd: f.repo, env: f.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
  return res.stdout;
}

function newFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-guard-'));
  const f = { dir, repo: path.join(dir, 'repo'), home: path.join(dir, 'home') };
  fs.mkdirSync(f.repo);
  fs.mkdirSync(f.home);
  f.env = { ...processEnv(), HOME: f.home, XDG_CONFIG_HOME: path.join(dir, 'xdg'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  git(f, ['init', '-q']);
  git(f, ['config', 'user.name', 'Fixture']);
  git(f, ['config', 'user.email', 'fixture@example.invalid']);
  git(f, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(f.repo, 'README.md'), 'readme\n');
  git(f, ['add', '.']);
  git(f, ['commit', '-qm', 'baseline']);
  return f;
}

// snapshot is what a refused command must leave as it was.
function snapshot(f) {
  const read = (rel) => (fs.existsSync(path.join(f.repo, rel)) ? fs.readFileSync(path.join(f.repo, rel), 'utf8') : null);
  return {
    head: git(f, ['rev-parse', 'HEAD']).trim(),
    headRef: git(f, ['symbolic-ref', 'HEAD']).trim(),
    status: git(f, ['status', '--porcelain']),
    remotes: git(f, ['remote']),
    worktrees: git(f, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length,
    readme: read('README.md'),
    scratch: read('scratch.txt'),
  };
}

function call(f, mode, args) {
  if (!f.before) f.before = snapshot(f);
  const req = { mode, dir: f.repo, env: Object.entries(f.env).map(([k, v]) => `${k}=${v}`), args };
  const res = spawnSync(driverBinary(), [], { input: JSON.stringify(req), env: processEnv(), encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  assert.equal(res.status, 0, `the guard driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  return JSON.parse(res.stdout);
}

function checkRefused(args, r, message) {
  const shown = `git ${args.join(' ')}`;
  assert.equal(r.forbidden, true, `${shown} was not refused with ErrForbidden: status ${r.status}, error ${JSON.stringify(r.error)}, stdout ${JSON.stringify(r.stdout)}`);
  assert.equal(r.error, message, `${shown} was refused with another message`);
}

function checkSame(f) {
  assert.ok(f.before, 'no command ran yet');
  assert.deepEqual(snapshot(f), f.before, 'the repository (HEAD, branch, status, remotes, work trees or files) changed');
}

const split = (s) => s.split('|');

if (require.main === module) {
  const kind = process.argv[2];
  const lines = [];
  let f = null;
  const verdict = (name, fn) => {
    try {
      fn();
      lines.push(`${name}: match`);
    } catch (e) {
      if (!(e instanceof assert.AssertionError)) throw e;
      lines.push(`${name}: mismatch`);
    }
  };
  try {
    if (kind !== 'good' && kind !== 'bad') throw new Error(`unknown control ${JSON.stringify(kind)}`);
    const good = kind === 'good';
    f = newFixture();
    const plain = call(f, 'run', ['push']);
    const ordinary = call(f, 'ok', ['log', '-1', '--format=%s']);
    verdict('plain', () => checkRefused(['push'], plain, good ? 'git command not allowed: git push' : 'git command not allowed: git pull'));
    verdict('ordinary', () => { assert.equal(ordinary.error, ''); assert.equal(ordinary.stdout.trim(), good ? 'baseline' : 'other'); checkSame(f); });
    console.log(lines.join('\n'));
    process.exitCode = lines.every((l) => l.endsWith(': match')) ? 0 : 1;
  } catch (e) {
    console.log(`error: ${e.message}`);
    process.exitCode = 2;
  } finally {
    if (f) fs.rmSync(f.dir, { recursive: true, force: true });
    removeDriver();
  }
} else {
  const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');
  const P = 'coord-git-guard-judges-aliased-commands: ';

  After(function () {
    if (this.guard) fs.rmSync(this.guard.dir, { recursive: true, force: true });
  });
  AfterAll(removeDriver);

  function fixture(world) {
    assert.ok(world.guard, 'no fixture: a Given step must create the repository first');
    return world.guard;
  }

  Given(P + 'a repository with one commit', function () {
    this.guard = newFixture();
  });

  Given(P + 'README.md has an uncommitted edit and scratch.txt is an untracked file', function () {
    const f = fixture(this);
    fs.writeFileSync(path.join(f.repo, 'README.md'), 'readme\nedited\n');
    fs.writeFileSync(path.join(f.repo, 'scratch.txt'), 'scratch\n');
  });

  Given(P + 'the repository configuration defines the alias {string} as {string}', function (name, value) {
    git(fixture(this), ['config', `alias.${name}`, value]);
  });

  When(P + 'the runner runs git with the arguments {string}', { timeout: 300000 }, function (list) {
    const f = fixture(this);
    f.last = { args: split(list), result: call(f, 'run', split(list)) };
  });

  When(P + 'the runner runs git with the arguments {string} as a command that must succeed', { timeout: 300000 }, function (list) {
    const f = fixture(this);
    f.last = { args: split(list), result: call(f, 'ok', split(list)) };
  });

  When(P + 'the runner runs each of these argument lists', { timeout: 300000 }, function (table) {
    const f = fixture(this);
    f.rows = table.raw().map(([list, message]) => ({ args: split(list), message, result: call(f, 'run', split(list)) }));
  });

  Then(P + 'the call is refused with the message {string}', function (message) {
    const f = fixture(this);
    assert.ok(f.last, 'no call ran');
    checkRefused(f.last.args, f.last.result, message);
  });

  Then(P + 'every call is refused with the message in its row', function () {
    const f = fixture(this);
    assert.ok(f.rows && f.rows.length > 0, 'no calls ran');
    for (const row of f.rows) checkRefused(row.args, row.result, row.message);
  });

  Then(P + 'the repository is as it was before the first call', function () {
    checkSame(fixture(this));
  });

  Then(P + 'the file {string} does not exist in the work tree', function (rel) {
    assert.ok(!fs.existsSync(path.join(fixture(this).repo, rel)), `${rel} exists in the work tree`);
  });

  Then(P + 'the call succeeded and its output is {string}', function (output) {
    const f = fixture(this);
    const r = f.last.result;
    assert.equal(r.forbidden, false, `the call was refused: ${r.error}`);
    assert.equal(r.error, '', `the call failed: ${r.error}`);
    assert.equal(r.stdout.replace(/\n$/, ''), output, 'the output is not the expected one');
  });
}
