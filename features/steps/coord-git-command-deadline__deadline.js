// Steps of coord-git-command-deadline: the git package's Git commands under a wall-time bound,
// through a Go driver built from the repository root against the exported API: git.New, RunEnv,
// OKEnv, Materialize (whose blobs come from the `cat-file --batch` stream), Tree and Commit, the
// constants git.CommandTimeout and git.CommitTimeout, the seam git.OverrideTimeouts and the error
// type *git.TimeoutError.
//
// A fake `git` first on PATH acts by FAKE_MODE: hang (every call hangs), fail (exits 1 with stdout
// and stderr text), big (prints 1 MiB in two halves 0.5 s apart, exits 0) or hang-blobs (only
// `cat-file` hangs; everything else runs the real git, REAL_GIT). A hanging fake or commit hook
// writes the environment values it received to stderr and records the pid of its shell and of its
// background `sleep 600` in FAKE_PIDS, so a scenario can check that none of them is left.
//
// Run directly, `node <this file> good|bad` is the observer control: the same fake, result
// comparison and leftover-process check on a hanging fake whose whole process group is killed
// (good) and on one where only its shell is killed, leaving its sleep running (bad).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const BASE_SECRET = 'base-secret-7f3a';
const EXTRA_SECRET = 'extra-secret-91c2';
const SLACK_MS = 2000;

const FAKE = `#!/bin/sh
hang() {
  printf '%s %s\\n' "$GIT_AUTHOR_NAME" "$KOGEN_DEADLINE_SECRET" >&2
  echo $$ >> "$FAKE_PIDS"
  sleep 600 &
  echo $! >> "$FAKE_PIDS"
  wait
  exit 0
}
case "$FAKE_MODE" in
hang) hang ;;
fail) printf 'partial out\\n'; printf 'fatal: fake failure\\n' >&2; exit 1 ;;
big) head -c 524288 /dev/zero | tr '\\000' a; sleep 0.5; head -c 524288 /dev/zero | tr '\\000' a; exit 0 ;;
hang-blobs) if [ "$1" = cat-file ]; then hang; fi; exec "$REAL_GIT" "$@" ;;
esac
echo "fake git: unknown FAKE_MODE $FAKE_MODE" >&2
exit 97
`;

const HOOKS = {
  'sleeps 2.5 s': 'sleep 2.5\nexit 0\n',
  'never returns': 'echo $$ >> "$FAKE_PIDS"\nsleep 600 &\necho $! >> "$FAKE_PIDS"\nwait\nexit 0\n',
};

const FAKE_MODES = {
  'sleeps far past the bound': 'hang',
  'exits 1 with stderr text': 'fail',
  'prints 1 MiB and exits 0 inside the bound': 'big',
  'hangs only in the cat-file blob stream': 'hang-blobs',
};

// The process environment without Git's own variables and without global or system Git configuration.
function baseEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function realGit() {
  const res = spawnSync('sh', ['-c', 'command -v git'], { env: baseEnv(), encoding: 'utf8' });
  assert.equal(res.status, 0, `no git on PATH: ${res.stderr}`);
  return res.stdout.trim();
}

function writeFake(dir) {
  const bin = path.join(dir, 'fakebin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), FAKE, { mode: 0o755 });
  return bin;
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// compareResult compares the keys of the expected JSON object with the same keys of actual.
function compareResult(actual, expectedText) {
  const expected = JSON.parse(expectedText);
  const got = {};
  for (const k of Object.keys(expected)) got[k] = actual[k];
  assert.deepEqual(got, expected);
}

function recordedPids(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number) : [];
}

// alive is true for a process that exists and is not a zombie.
function alive(pid) {
  const res = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  const stat = (res.stdout || '').trim();
  return res.status === 0 && stat !== '' && !stat.startsWith('Z');
}

// assertNoneLeft: the hanging fake (or hook) recorded its shell and its sleep, and within 1 s
// none of them is running.
function assertNoneLeft(file) {
  const pids = recordedPids(file);
  assert.ok(pids.length >= 2, `the hanging fake recorded ${pids.length} processes in ${file}; want its shell and its sleep (did it start?)`);
  let left = pids.filter(alive);
  for (let i = 0; i < 10 && left.length > 0; i++) {
    sleepMs(100);
    left = left.filter(alive);
  }
  assert.deepEqual(left, [], `processes of the hanging fake are still running after the call returned: ${left.join(', ')} of ${pids.join(', ')}`);
}

function killRecorded(file) {
  for (const pid of recordedPids(file)) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) { /* gone */ }
  }
}

async function observe(good) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-deadline-observer-'));
  const pids = path.join(dir, 'pids');
  try {
    const fake = path.join(writeFake(dir), 'git');
    const env = { ...baseEnv(), REAL_GIT: realGit(), FAKE_PIDS: pids, KOGEN_DEADLINE_SECRET: BASE_SECRET };
    const fail = spawnSync(fake, ['status', '--porcelain'], { env: { ...env, FAKE_MODE: 'fail' }, encoding: 'utf8' });
    compareResult({ status: fail.status, stdout: fail.stdout, stderr: fail.stderr }, '{"status":1,"stdout":"partial out\\n","stderr":"fatal: fake failure\\n"}');
    const big = spawnSync(fake, ['status', '--porcelain'], { env: { ...env, FAKE_MODE: 'big' }, maxBuffer: 8 << 20 });
    compareResult({ status: big.status, stdout_bytes: big.stdout.length, stdout_sha256: sha256(big.stdout), stderr: big.stderr.toString() },
      '{"status":0,"stdout_bytes":1048576,"stdout_sha256":"9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360","stderr":""}');
    const version = spawnSync(fake, ['--version'], { env: { ...env, FAKE_MODE: 'hang-blobs' }, encoding: 'utf8' });
    assert.match(version.stdout, /^git version /);
    const child = spawn(fake, ['cat-file', '--batch'], { env: { ...env, FAKE_MODE: 'hang-blobs' }, detached: true, stdio: 'ignore' });
    const exited = new Promise(resolve => child.on('exit', resolve));
    for (let i = 0; i < 50 && recordedPids(pids).length < 2; i++) await new Promise(r => setTimeout(r, 100));
    process.kill(good ? -child.pid : child.pid, 'SIGKILL');
    await exited;
    assertNoneLeft(pids);
    console.log('match');
  } catch (_) {
    console.log('mismatch');
    process.exitCode = 1;
  } finally {
    killRecorded(pids);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  observe(process.argv[2] === 'good');
} else {
  const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');

  const driverSource = `package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-loop/sys"
)

type request struct {
	Mode        string   \`json:"mode"\`
	Dir         string   \`json:"dir"\`
	Args        []string \`json:"args"\`
	Extra       []string \`json:"extra"\`
	CommandMs   int64    \`json:"command_ms"\`
	CommitMs    int64    \`json:"commit_ms"\`
	Out         string   \`json:"out"\`
	MessageFile string   \`json:"message_file"\`
}

func fail(what string, err error) {
	fmt.Fprintln(os.Stderr, what+":", err)
	os.Exit(1)
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fail("request", err)
	}
	out := map[string]any{}
	if req.Mode == "bounds" {
		var command, commit time.Duration = git.CommandTimeout, git.CommitTimeout
		out["command"], out["commit"] = command.String(), commit.String()
	} else {
		restore := git.OverrideTimeouts(time.Duration(req.CommandMs)*time.Millisecond, time.Duration(req.CommitMs)*time.Millisecond)
		defer restore()
		repo := git.New(req.Dir, nil)
		var op func() error
		switch req.Mode {
		case "run":
			op = func() error {
				res, err := repo.RunEnv(req.Extra, req.Args...)
				out["status"], out["stderr"] = res.Status, res.Stderr
				out["stdout_bytes"] = len(res.Stdout)
				sum := sha256.Sum256([]byte(res.Stdout))
				out["stdout_sha256"] = hex.EncodeToString(sum[:])
				if len(res.Stdout) <= 4096 {
					out["stdout"] = res.Stdout
				}
				return err
			}
		case "ok":
			op = func() error { _, err := repo.OKEnv(req.Extra, req.Args...); return err }
		case "materialize":
			tree, err := repo.Resolve("HEAD^{tree}")
			if err != nil {
				fail("Resolve", err)
			}
			op = func() error { _, err := repo.Materialize(tree, req.Out); return err }
		case "commit":
			start := repo.Head()
			tree, err := repo.Tree(start, nil)
			if err != nil {
				fail("Tree", err)
			}
			out["head_before"] = start
			spec := git.CommitSpec{Tree: tree, Start: start, Title: "Edit the readme", Slug: "edit-readme", MessageFile: req.MessageFile}
			op = func() error { _, err := repo.Commit(sys.NewWith(os.Environ(), req.Dir), spec); return err }
		default:
			fail("mode", errors.New(req.Mode))
		}
		began := time.Now()
		err := op()
		out["elapsed_ms"] = float64(time.Since(began).Microseconds()) / 1000
		hide := func(s string) string {
			if req.MessageFile != "" {
				s = strings.ReplaceAll(s, req.MessageFile, "<message>")
			}
			return s
		}
		out["error"], out["timeout_args"], out["timeout"] = "", nil, ""
		if err != nil {
			out["error"] = hide(err.Error())
			var te *git.TimeoutError
			if errors.As(err, &te) {
				args := make([]string, len(te.Args))
				for i, a := range te.Args {
					args[i] = hide(a)
				}
				out["timeout_args"], out["timeout"] = args, te.Timeout.String()
			}
		}
		if req.Mode == "commit" {
			out["head_after"] = repo.Head()
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fail("encode", err)
	}
}
`;

  let driverDir = null;
  function driver() {
    if (driverDir) return path.join(driverDir, 'driver');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-deadline-driver-'));
    const file = path.join(dir, 'main.go');
    fs.writeFileSync(file, driverSource);
    const res = spawnSync('go', ['build', '-o', path.join(dir, 'driver'), file], { cwd: process.cwd(), env: baseEnv(), encoding: 'utf8', timeout: 280000 });
    if (res.status !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      assert.fail(`go build of the deadline driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
    }
    driverDir = dir;
    return path.join(dir, 'driver');
  }
  AfterAll(function() { if (driverDir) fs.rmSync(driverDir, { recursive: true, force: true }); });

  function state(world) {
    if (!world.deadline) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-deadline-'));
      world.deadline = { dir, pids: path.join(dir, 'pids'), commandMs: 1500, commitMs: 1500, mode: '', result: null, boundMs: 0 };
    }
    return world.deadline;
  }
  After(function() {
    if (!this.deadline) return;
    killRecorded(this.deadline.pids);
    fs.rmSync(this.deadline.dir, { recursive: true, force: true });
  });

  function git(s, args) {
    const res = spawnSync('git', args, { cwd: s.repo, env: s.env, encoding: 'utf8', timeout: 60000 });
    assert.equal(res.status, 0, `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
    return res.stdout;
  }

  // The repository: README.md "readme\n" committed as baseline by Fixture <fixture@example.invalid>,
  // commit.gpgsign false and a hooks folder of its own (core.hooksPath).
  function repository(s) {
    s.repo = path.join(s.dir, 'repo');
    s.hooks = path.join(s.dir, 'hooks');
    s.home = path.join(s.dir, 'home');
    for (const d of [s.repo, s.hooks, s.home]) fs.mkdirSync(d);
    s.env = { ...baseEnv(), HOME: s.home, XDG_CONFIG_HOME: path.join(s.dir, 'xdg') };
    git(s, ['init', '-q']);
    git(s, ['config', 'user.name', 'Fixture']);
    git(s, ['config', 'user.email', 'fixture@example.invalid']);
    git(s, ['config', 'commit.gpgsign', 'false']);
    git(s, ['config', 'core.hooksPath', s.hooks]);
    fs.writeFileSync(path.join(s.repo, 'README.md'), 'readme\n');
    git(s, ['add', '.']);
    git(s, ['commit', '-qm', 'baseline']);
  }

  function runDriver(world, req, boundMs) {
    const s = state(world);
    const env = { ...s.env, KOGEN_DEADLINE_SECRET: BASE_SECRET, FAKE_PIDS: s.pids, REAL_GIT: realGit(), FAKE_MODE: s.mode };
    if (s.bin) env.PATH = s.bin + path.delimiter + env.PATH;
    const full = { dir: s.repo, args: [], extra: [], command_ms: s.commandMs, commit_ms: s.commitMs, out: '', message_file: '', ...req };
    const res = spawnSync(driver(), [], { cwd: s.dir, input: JSON.stringify(full), env, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 8 << 20 });
    assert.ok(res.status === 0 && !res.error, `the deadline driver (${req.mode}) did not finish within 60 s or failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
    s.result = JSON.parse(res.stdout);
    s.boundMs = boundMs;
    return s.result;
  }

  function result(world) {
    assert.ok(world.deadline && world.deadline.result, 'no call has run in this scenario');
    return world.deadline.result;
  }

  Given('coord-git-command-deadline: the command bound is {int} ms and the commit bound is {int} ms', function(command, commit) {
    const s = state(this);
    s.commandMs = command;
    s.commitMs = commit;
  });

  Given('coord-git-command-deadline: a repository whose git first on PATH {string}', function(behavior) {
    const s = state(this);
    s.mode = FAKE_MODES[behavior];
    assert.ok(s.mode, `unknown fake behavior ${JSON.stringify(behavior)}`);
    repository(s);
    s.bin = writeFake(s.dir);
  });

  Given('coord-git-command-deadline: a repository with an edited README whose pre-commit hook {string}', function(behavior) {
    const s = state(this);
    const script = HOOKS[behavior];
    assert.ok(script, `unknown hook behavior ${JSON.stringify(behavior)}`);
    repository(s);
    fs.writeFileSync(path.join(s.hooks, 'pre-commit'), '#!/bin/sh\n' + script, { mode: 0o755 });
    fs.writeFileSync(path.join(s.repo, 'README.md'), 'readme\nedited\n');
  });

  When('coord-git-command-deadline: I read the documented bounds', { timeout: 300000 }, function() {
    const s = state(this);
    s.repo = s.dir;
    s.env = baseEnv();
    runDriver(this, { mode: 'bounds' }, 0);
  });

  When('coord-git-command-deadline: I run git {string}', { timeout: 300000 }, function(args) {
    runDriver(this, { mode: 'run', args: args.split(' '), extra: ['GIT_AUTHOR_NAME=' + EXTRA_SECRET] }, state(this).commandMs);
  });

  When('coord-git-command-deadline: I run git {string} as a command that must succeed', { timeout: 300000 }, function(args) {
    runDriver(this, { mode: 'ok', args: args.split(' '), extra: ['GIT_AUTHOR_NAME=' + EXTRA_SECRET] }, state(this).commandMs);
  });

  When('coord-git-command-deadline: I materialize the HEAD tree', { timeout: 300000 }, function() {
    const s = state(this);
    runDriver(this, { mode: 'materialize', out: path.join(s.dir, 'materialized') }, s.commandMs);
  });

  When('coord-git-command-deadline: I commit the edited README', { timeout: 300000 }, function() {
    const s = state(this);
    runDriver(this, { mode: 'commit', message_file: path.join(s.dir, 'commit-message.txt') }, s.commitMs);
  });

  Then('coord-git-command-deadline: the bounds are {string} for commands and {string} for commits', function(command, commit) {
    const r = result(this);
    assert.deepEqual({ command: r.command, commit: r.commit }, { command, commit });
  });

  Then('coord-git-command-deadline: the error is {string}', function(expected) {
    assert.equal(result(this).error, expected);
  });

  Then('coord-git-command-deadline: the error is a timeout of git {string} after {string}', function(args, timeout) {
    const r = result(this);
    assert.ok(Array.isArray(r.timeout_args), `the error ${JSON.stringify(r.error)} is no *git.TimeoutError`);
    assert.deepEqual({ args: r.timeout_args.join(' '), timeout: r.timeout }, { args, timeout });
  });

  Then('coord-git-command-deadline: the error is not a timeout', function() {
    const r = result(this);
    assert.equal(r.timeout_args, null, `the error ${JSON.stringify(r.error)} is a *git.TimeoutError`);
  });

  Then('coord-git-command-deadline: the error contains no environment value passed to the command', function() {
    const r = result(this);
    for (const secret of [BASE_SECRET, EXTRA_SECRET]) assert.ok(!r.error.includes(secret), `the error ${JSON.stringify(r.error)} contains the environment value ${secret}`);
  });

  Then('coord-git-command-deadline: the call returned after at least the bound and within the bound plus 2 s', function() {
    const s = state(this);
    const ms = result(this).elapsed_ms;
    assert.ok(ms >= s.boundMs && ms <= s.boundMs + SLACK_MS, `the call took ${ms} ms; want at least the bound ${s.boundMs} ms and at most ${s.boundMs + SLACK_MS} ms`);
  });

  Then('coord-git-command-deadline: the call returned before the command bound', function() {
    const s = state(this);
    const ms = result(this).elapsed_ms;
    assert.ok(ms < s.commandMs, `the call took ${ms} ms; want less than the command bound ${s.commandMs} ms`);
  });

  Then('coord-git-command-deadline: no process of the hanging fake or hook remains', function() {
    assertNoneLeft(state(this).pids);
  });

  Then('coord-git-command-deadline: the result is', function(expected) {
    compareResult(result(this), expected);
  });

  Then('coord-git-command-deadline: HEAD is unchanged', function() {
    const r = result(this);
    assert.equal(r.head_after, r.head_before, `HEAD moved from ${r.head_before} to ${r.head_after}`);
  });

  Then('coord-git-command-deadline: HEAD is a new commit on top of the start', function() {
    const s = state(this);
    const r = result(this);
    assert.ok(r.head_after && r.head_after !== r.head_before, `HEAD is still ${r.head_before}`);
    assert.equal(git(s, ['rev-parse', r.head_after + '^']).trim(), r.head_before);
  });
}
