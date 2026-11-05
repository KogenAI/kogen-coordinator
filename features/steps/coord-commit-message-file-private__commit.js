// Steps of coord-commit-message-file-private: git.Repo.Commit on a real repository with a fake git
// first on PATH, through a Go driver built from the repository root. Each fixture is a repository with
// one baseline commit (README.md "readme\n"), the identity Fixture <fixture@example.invalid>,
// commit.gpgsign=false, no global or system configuration and an empty hooks folder of its own
// (core.hooksPath). Its candidate edits README.md and adds app.txt; the driver snapshots it with
// Repo.Tree and commits it as "Add the app" / add-app with the message file <fixture>/run/commit-message.txt.
//
// The fake git appends every invocation's arguments to a log (the driver empties the log just before
// Commit, so the log holds exactly the git commands Commit ran). For `git commit` it records what it
// finds at the -F path (kind, permission bits, bytes), then, by the fixture's behaviour, runs the
// real git ("pass"), prints "fake git commit refuses" and exits 1 ("fail"), or holds until released
// and exits 0 ("hold").
//
// Run directly, `node <this file> good|bad` is the observer control: the same driver, fake git and
// checks on fixtures whose outcomes are the same before and after the change (a plain commit, a
// regular leftover that already has mode 0600, a failing and a held fake git commit, and read-only
// repositories, which refuse before any git command or file write). good pairs each check with its
// true outcome, bad with another fixture or value.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = 'coord-commit-message-file-private: ';
const TITLE = 'Add the app';
const SLUG = 'add-app';
const MESSAGE = `${TITLE}\n\nKogen-Intent: ${SLUG}\n`;
const REFUSAL = 'fake git commit refuses';

const driverSource = `package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-loop/sys"
)

type request struct {
	Dir         string   \`json:"dir"\`
	Env         []string \`json:"env"\`
	Title       string   \`json:"title"\`
	Slug        string   \`json:"slug"\`
	MessageFile string   \`json:"message_file"\`
	Log         string   \`json:"log"\`
	State       string   \`json:"state"\`
	Interrupt   bool     \`json:"interrupt"\`
	ReadOnly    bool     \`json:"read_only"\`
}

type result struct {
	head string
	err  error
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fmt.Fprintln(os.Stderr, "request:", err)
		os.Exit(2)
	}
	repo := git.New(req.Dir, req.Env)
	start := repo.Head()
	tree, err := repo.Tree(start, nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Tree:", err)
		os.Exit(1)
	}
	if req.ReadOnly {
		repo = repo.Observing()
	}
	spec := git.CommitSpec{Tree: tree, Start: start, Title: req.Title, Slug: req.Slug, MessageFile: req.MessageFile}
	s := sys.NewWith(req.Env, req.Dir)
	if err := os.WriteFile(req.Log, nil, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "log:", err)
		os.Exit(1)
	}
	done := make(chan result, 1)
	go func() { head, err := repo.Commit(s, spec); done <- result{head, err} }()
	out := map[string]any{"start": start, "tree": tree, "error": nil, "never_started": false}
	if req.Interrupt {
		started := false
		for i := 0; i < 3000 && !started; i++ {
			if _, err := os.Stat(filepath.Join(req.State, "started")); err == nil {
				started = true
			} else {
				time.Sleep(20 * time.Millisecond)
			}
		}
		out["never_started"] = !started
		if started {
			s.Interrupt("SIGINT")
			time.Sleep(200 * time.Millisecond)
		}
		os.WriteFile(filepath.Join(req.State, "release"), nil, 0o644)
	}
	r := <-done
	out["head"] = r.head
	if r.err != nil {
		var in *sys.Interrupted
		if errors.As(r.err, &in) {
			out["error"] = map[string]any{"interrupted": in.Signal}
		} else if e, ok := sys.AsError(r.err); ok {
			out["error"] = map[string]any{"class": e.Class, "reason": e.Reason, "exit": e.Exit, "detail": e.Detail, "lines": e.Lines}
		} else {
			out["error"] = map[string]any{"other": r.err.Error()}
		}
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

// The process environment without Git's own variables: Go builds run with it.
function processEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return env;
}

let driverDir = null;
function driverBinary() {
  if (driverDir) return path.join(driverDir, 'driver');
  driverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-message-private-driver-'));
  const file = path.join(driverDir, 'main.go');
  fs.writeFileSync(file, driverSource);
  const res = spawnSync('go', ['build', '-o', path.join(driverDir, 'driver'), file], { cwd: process.cwd(), env: processEnv(), encoding: 'utf8', timeout: 280000 });
  assert.equal(res.status, 0, `go build of the commit driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  return path.join(driverDir, 'driver');
}

function removeDriver() {
  if (driverDir) fs.rmSync(driverDir, { recursive: true, force: true });
  driverDir = null;
}

function realGit() {
  const res = spawnSync('sh', ['-c', 'command -v git'], { env: processEnv(), encoding: 'utf8' });
  assert.equal(res.status, 0, `no git on PATH: ${res.stdout}${res.stderr}`);
  return res.stdout.trim();
}

function git(f, args) {
  const res = spawnSync(f.realGit, args, { cwd: f.repo, env: f.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
  return res.stdout;
}

function fakeGit(f) {
  return `#!/bin/sh
printf '%s\\n' "$*" >> '${f.log}'
if [ "$1" = commit ]; then
  msg=
  prev=
  for a in "$@"; do
    if [ "$prev" = -F ]; then msg=$a; fi
    prev=$a
  done
  if [ -L "$msg" ]; then kind=symlink; elif [ -f "$msg" ]; then kind=regular; elif [ -e "$msg" ]; then kind=other; else kind=missing; fi
  printf '%s\\n' "$kind" > '${f.state}/seen-kind'
  if [ "$kind" = regular ]; then
    { stat -c %a "$msg" 2>/dev/null || stat -f %Lp "$msg"; } > '${f.state}/seen-mode'
    cat "$msg" > '${f.state}/seen-message'
  fi
  case "$(cat '${f.state}/behaviour')" in
    fail) echo '${REFUSAL}'; exit 1 ;;
    hold) trap '' TERM HUP INT; touch '${f.state}/started'; while [ ! -f '${f.state}/release' ]; do sleep 0.02; done; exit 0 ;;
  esac
fi
exec '${f.realGit}' "$@"
`;
}

// newFixture is the baseline repository with the candidate edits in its working tree, the fake git
// first on PATH (behaviour "pass") and no file at the message path.
function newFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-message-private-'));
  const f = {
    dir, repo: path.join(dir, 'repo'), hooks: path.join(dir, 'hooks'), home: path.join(dir, 'home'),
    bin: path.join(dir, 'bin'), state: path.join(dir, 'state'), log: path.join(dir, 'git.log'),
    run: path.join(dir, 'run'), victim: path.join(dir, 'victim.txt'), missing: path.join(dir, 'missing-target.txt'),
    realGit: realGit(), readOnly: false,
  };
  f.messageFile = path.join(f.run, 'commit-message.txt');
  for (const d of [f.repo, f.hooks, f.home, f.bin, f.state, f.run]) fs.mkdirSync(d);
  const base = processEnv();
  f.env = { ...base, PATH: `${f.bin}${path.delimiter}${base.PATH || ''}`, HOME: f.home, XDG_CONFIG_HOME: path.join(dir, 'xdg'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  fs.writeFileSync(path.join(f.bin, 'git'), fakeGit(f));
  fs.chmodSync(path.join(f.bin, 'git'), 0o755);
  fs.writeFileSync(path.join(f.state, 'behaviour'), 'pass\n');
  git(f, ['init', '-q']);
  git(f, ['config', 'user.name', 'Fixture']);
  git(f, ['config', 'user.email', 'fixture@example.invalid']);
  git(f, ['config', 'commit.gpgsign', 'false']);
  git(f, ['config', 'core.hooksPath', f.hooks]);
  fs.writeFileSync(path.join(f.repo, 'README.md'), 'readme\n');
  git(f, ['add', '.']);
  git(f, ['commit', '-qm', 'baseline']);
  f.start = git(f, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(f.repo, 'app.txt'), 'verified edit\n');
  fs.writeFileSync(path.join(f.repo, 'README.md'), 'readme\nchanged\n');
  return f;
}

function behave(f, behaviour) {
  fs.writeFileSync(path.join(f.state, 'behaviour'), `${behaviour}\n`);
}

function linkToVictim(f, content) {
  fs.writeFileSync(f.victim, content);
  fs.chmodSync(f.victim, 0o644);
  fs.symlinkSync(f.victim, f.messageFile);
}

function leftover(f, content, mode) {
  fs.writeFileSync(f.messageFile, content);
  fs.chmodSync(f.messageFile, mode);
}

function readOptional(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function commit(f, interrupt) {
  const env = Object.entries(f.env).map(([k, v]) => `${k}=${v}`);
  const req = { dir: f.repo, env, title: TITLE, slug: SLUG, message_file: f.messageFile, log: f.log, state: f.state, interrupt: !!interrupt, read_only: f.readOnly };
  const res = spawnSync(driverBinary(), [], { input: JSON.stringify(req), env: processEnv(), encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  assert.equal(res.status, 0, `the commit driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  f.result = JSON.parse(res.stdout);
  assert.equal(f.result.start, f.start, `the driver started from ${f.result.start}, not the baseline commit ${f.start}`);
  assert.equal(f.result.never_started, false, 'the held fake git commit never started, so the interrupt was not sent while git commit ran');
  f.gitLog = fs.readFileSync(f.log, 'utf8');
  const kind = readOptional(path.join(f.state, 'seen-kind'));
  f.seen = kind === null ? null : {
    kind: kind.trim(),
    mode: (readOptional(path.join(f.state, 'seen-mode')) || '').trim(),
    message: readOptional(path.join(f.state, 'seen-message')),
  };
}

function head(f) {
  return git(f, ['rev-parse', 'HEAD']).trim();
}

function rawMessage(f, id) {
  const raw = git(f, ['cat-file', 'commit', id]);
  const at = raw.indexOf('\n\n');
  assert.ok(at >= 0, `commit ${id} has no message separator:\n${raw}`);
  return raw.slice(at + 2);
}

function checkSeenMode(f, mode) {
  assert.ok(f.seen, `git commit never ran, so no message file was seen (git commands Commit ran: ${JSON.stringify(f.gitLog)}; result ${JSON.stringify(f.result)})`);
  assert.equal(f.seen.kind, 'regular', `git commit found ${f.seen.kind} at the message path, not a regular file`);
  assert.equal(f.seen.mode, mode, `the message file had mode ${f.seen.mode} while git commit ran, not ${mode}`);
}

function checkSeenMessage(f, want) {
  assert.ok(f.seen, `git commit never ran, so no message file was seen (result ${JSON.stringify(f.result)})`);
  assert.equal(f.seen.kind, 'regular', `git commit found ${f.seen.kind} at the message path, not a regular file`);
  assert.equal(JSON.stringify(f.seen.message), JSON.stringify(want), 'git commit read another message');
}

function checkLanded(f, want) {
  const r = f.result;
  assert.equal(r.error, null, `Commit failed instead of landing: ${JSON.stringify(r.error)}`);
  const now = head(f);
  assert.equal(r.head, now, `Commit returned ${r.head}, but HEAD is ${now}`);
  assert.notEqual(now, f.start, 'HEAD is still the start commit');
  assert.equal(git(f, ['rev-parse', 'HEAD^']).trim(), f.start, 'the landed commit is not on top of the start commit');
  assert.equal(git(f, ['rev-parse', 'HEAD^{tree}']).trim(), r.tree, 'the landed tree is not the reviewed tree');
  assert.equal(JSON.stringify(rawMessage(f, now)), JSON.stringify(want), `the message of the landed commit ${now} is not the expected one`);
}

function checkGone(f) {
  let st = null;
  try {
    st = fs.lstatSync(f.messageFile);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  assert.equal(st, null, `the message file ${f.messageFile} still exists after Commit returned (${st && (st.isSymbolicLink() ? 'symbolic link' : st.isFile() ? 'regular file' : 'other')})`);
}

function checkRefused(f, text) {
  const r = f.result;
  const want = text.split('<message file>').join(f.messageFile);
  assert.notEqual(r.error, null, `Commit returned ${r.head} instead of refusing with ${JSON.stringify(want)}`);
  assert.deepEqual(r.error, { other: want }, 'Commit did not refuse with exactly this plain (unclassified) error');
  assert.equal(r.head, '', `Commit returned a commit id ${r.head} with its error`);
}

function checkNoGit(f) {
  assert.equal(f.gitLog, '', `Commit ran git commands although it refused:\n${f.gitLog}`);
}

function checkHeadAtStart(f) {
  assert.equal(head(f), f.start, 'HEAD is not the start commit');
}

function checkVictim(f, want) {
  assert.equal(JSON.stringify(fs.readFileSync(f.victim, 'utf8')), JSON.stringify(want), 'the victim file changed');
}

function checkLinkKept(f, target) {
  let st = null;
  try {
    st = fs.lstatSync(f.messageFile);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  assert.ok(st && st.isSymbolicLink(), `the message path ${f.messageFile} is no longer a symbolic link`);
  assert.equal(fs.readlinkSync(f.messageFile), target, 'the symbolic link points elsewhere');
}

function checkMissingTargetAbsent(f) {
  assert.equal(fs.existsSync(f.missing), false, `the link target ${f.missing} was created`);
}

function checkDirectoryKept(f) {
  let st = null;
  try {
    st = fs.lstatSync(f.messageFile);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  assert.ok(st && st.isDirectory(), `the message path ${f.messageFile} is no longer a directory`);
  assert.deepEqual(fs.readdirSync(f.messageFile), [], 'the directory at the message path is not empty');
}

function checkCommitFailed(f, detail, lines) {
  const r = f.result;
  assert.notEqual(r.error, null, `Commit returned ${r.head} instead of failing with environment/commit_failed`);
  assert.deepEqual(r.error, { class: 'environment', reason: 'commit_failed', exit: 3, detail, lines }, 'Commit did not fail with exactly this error');
  assert.equal(r.head, '', `Commit returned a commit id ${r.head} with its error`);
}

function checkInterrupted(f, signal) {
  const r = f.result;
  assert.deepEqual(r.error, { interrupted: signal }, `Commit did not return *sys.Interrupted for ${signal}`);
  assert.equal(r.head, '', `Commit returned a commit id ${r.head} with its error`);
}

const OLD = 'Old title from an interrupted commit\n\nA body line that is longer than the new message.\n\nKogen-Intent: old-slug\n';

if (require.main === module) {
  const kind = process.argv[2];
  const lines = [];
  const fixtures = [];
  const fixture = () => { const f = newFixture(); fixtures.push(f); return f; };
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
    const plain = fixture();
    commit(plain);
    const kept = fixture();
    leftover(kept, OLD, 0o600);
    commit(kept);
    const failing = fixture();
    behave(failing, 'fail');
    commit(failing);
    const held = fixture();
    behave(held, 'hold');
    commit(held, true);
    const link = fixture();
    link.readOnly = true;
    linkToVictim(link, 'victim bytes\n');
    commit(link);
    const dangling = fixture();
    dangling.readOnly = true;
    fs.symlinkSync(dangling.missing, dangling.messageFile);
    commit(dangling);
    const directory = fixture();
    directory.readOnly = true;
    fs.mkdirSync(directory.messageFile);
    commit(directory);
    const fresh = fixture();
    fresh.readOnly = true;
    commit(fresh);
    const READONLY = 'git: read-only repository cannot commit';
    verdict('lands', () => checkLanded(good ? plain : failing, MESSAGE));
    verdict('seen-mode', () => checkSeenMode(kept, good ? '600' : '644'));
    verdict('seen-message', () => checkSeenMessage(kept, good ? MESSAGE : OLD));
    verdict('refused', () => checkRefused(good ? link : plain, READONLY));
    verdict('no-git', () => checkNoGit(good ? link : plain));
    verdict('victim', () => checkVictim(link, good ? 'victim bytes\n' : MESSAGE));
    verdict('link-kept', () => checkLinkKept(good ? link : fresh, link.victim));
    verdict('missing-target', () => { checkLinkKept(good ? dangling : directory, dangling.missing); checkMissingTargetAbsent(dangling); });
    verdict('directory-kept', () => checkDirectoryKept(good ? directory : fresh));
    verdict('gone', () => checkGone(good ? fresh : link));
    verdict('head-start', () => checkHeadAtStart(good ? failing : plain));
    verdict('commit-failed', () => checkCommitFailed(good ? failing : plain, 'git commit failed (status 1); the verified changes are left uncommitted', [REFUSAL]));
    verdict('interrupted', () => checkInterrupted(good ? held : failing, 'SIGINT'));
    console.log(lines.join('\n'));
    process.exitCode = lines.every(l => l.endsWith(': match')) ? 0 : 1;
  } catch (e) {
    console.log(`error: ${e.message}`);
    process.exitCode = 2;
  } finally {
    for (const f of fixtures) fs.rmSync(f.dir, { recursive: true, force: true });
    removeDriver();
  }
} else {
  const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');

  After(function () {
    if (this.messagePrivate) fs.rmSync(this.messagePrivate.dir, { recursive: true, force: true });
  });
  AfterAll(removeDriver);

  function fixtureOf(world) {
    assert.ok(world.messagePrivate, 'no fixture: a Given step must create the repository first');
    return world.messagePrivate;
  }

  function committed(world) {
    const f = fixtureOf(world);
    assert.ok(f.result, 'no commit: a When step must commit the candidate first');
    return f;
  }

  Given(P + 'a repository with a verified candidate and a fake git first on PATH', function () {
    this.messagePrivate = newFixture();
  });

  Given(P + 'nothing exists at the message path', function () {
    const f = fixtureOf(this);
    assert.equal(fs.existsSync(f.messageFile), false, `${f.messageFile} exists`);
  });

  Given(P + 'the message path is a symbolic link to a victim file containing:', function (content) {
    linkToVictim(fixtureOf(this), `${content}\n`);
  });

  Given(P + 'the message path is a symbolic link to a missing file', function () {
    const f = fixtureOf(this);
    fs.symlinkSync(f.missing, f.messageFile);
  });

  Given(P + 'the message path is an empty directory', function () {
    fs.mkdirSync(fixtureOf(this).messageFile);
  });

  Given(P + 'the message path is a leftover regular file with mode 0644 containing:', function (content) {
    leftover(fixtureOf(this), `${content}\n`, 0o644);
  });

  Given(P + 'the fake git commit prints {string} and exits 1', function (text) {
    assert.equal(text, REFUSAL, 'the fake git prints only its fixed refusal');
    behave(fixtureOf(this), 'fail');
  });

  Given(P + 'the fake git commit holds until it is released', function () {
    behave(fixtureOf(this), 'hold');
  });

  When(P + 'Kogen commits the candidate as {string} for the Intent {string}', { timeout: 300000 }, function (title, slug) {
    assert.deepEqual([title, slug], [TITLE, SLUG], 'the steps commit only the fixture title and slug');
    commit(fixtureOf(this));
  });

  When(P + 'Kogen commits the candidate and the caller interrupts with SIGINT while git commit runs', { timeout: 300000 }, function () {
    commit(fixtureOf(this), true);
  });

  Then(P + 'git commit found a regular message file with mode {string}', function (mode) {
    checkSeenMode(committed(this), mode);
  });

  Then(P + 'git commit read the message:', function (want) {
    checkSeenMessage(committed(this), `${want}\n`);
  });

  Then(P + 'the commit lands on top of the start commit with the message:', function (want) {
    checkLanded(committed(this), `${want}\n`);
  });

  Then(P + 'nothing exists at the message path after Commit returned', function () {
    checkGone(committed(this));
  });

  Then(P + 'Commit is refused with the plain error {string}', function (text) {
    checkRefused(committed(this), text);
  });

  Then(P + 'Commit ran no git command', function () {
    checkNoGit(committed(this));
  });

  Then(P + 'HEAD is still the start commit', function () {
    checkHeadAtStart(committed(this));
  });

  Then(P + 'the victim file still contains:', function (want) {
    checkVictim(committed(this), `${want}\n`);
  });

  Then(P + 'the message path is still the symbolic link to the victim file', function () {
    const f = committed(this);
    checkLinkKept(f, f.victim);
  });

  Then(P + 'the message path is still the symbolic link and its missing target was not created', function () {
    const f = committed(this);
    checkLinkKept(f, f.missing);
    checkMissingTargetAbsent(f);
  });

  Then(P + 'the message path is still an empty directory', function () {
    checkDirectoryKept(committed(this));
  });

  Then(P + 'Commit fails with the class environment, the reason commit_failed, exit 3, the detail {string} and the lines:', function (detail, lines) {
    checkCommitFailed(committed(this), detail, lines.split('\n'));
  });

  Then(P + 'Commit returns the interrupt {string}', function (signal) {
    checkInterrupted(committed(this), signal);
  });
}
