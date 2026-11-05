// Steps of coord-commit-trailer-survives-hooks: git.Repo.Commit on a real repository whose
// commit hooks rewrite the commit message, through a Go driver built from the repository root.
// Each fixture is a repository with one baseline commit (README.md "readme\n"), the test identity
// Fixture <fixture@example.invalid>, commit.gpgsign=false, no global or system configuration, and
// a hooks directory of its own named by core.hooksPath. Its candidate edits README.md and adds
// app.txt; the driver snapshots it with Repo.Tree and commits it as "Add the app" / add-app.
//
// Run directly, `node <this file> good|bad` is the observer control: the same driver and checks on
// a commit without hooks and on one whose post-commit hook adds a commit on top (an existing
// hook_changed_commit case). good pairs each fixture with its true outcome, bad with the other one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TITLE = 'Add the app';
const SLUG = 'add-app';
const UNDO_REFLOG = 'kogen: undo the unverified commit';

const driverSource = `package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-loop/sys"
)

type request struct {
	Dir         string   \`json:"dir"\`
	Env         []string \`json:"env"\`
	Title       string   \`json:"title"\`
	Slug        string   \`json:"slug"\`
	MessageFile string   \`json:"message_file"\`
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
	spec := git.CommitSpec{Tree: tree, Start: start, Title: req.Title, Slug: req.Slug, MessageFile: req.MessageFile}
	head, err := repo.Commit(sys.NewWith(req.Env, req.Dir), spec)
	out := map[string]any{"start": start, "tree": tree, "head": head, "error": nil}
	if err != nil {
		if e, ok := sys.AsError(err); ok {
			out["error"] = map[string]any{"class": e.Class, "reason": e.Reason, "exit": e.Exit, "detail": e.Detail, "lines": e.Lines}
		} else {
			out["error"] = map[string]any{"other": err.Error()}
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
  driverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-trailer-driver-'));
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

function git(f, args) {
  const res = spawnSync('git', args, { cwd: f.repo, env: f.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
  return res.stdout;
}

function write(f, rel, content) {
  fs.writeFileSync(path.join(f.repo, rel), content);
}

// newFixture is the baseline repository with the candidate edits in its working tree.
function newFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-trailer-'));
  const f = { dir, repo: path.join(dir, 'repo'), hooks: path.join(dir, 'hooks'), home: path.join(dir, 'home'), messageFile: path.join(dir, 'commit-message.txt') };
  fs.mkdirSync(f.repo);
  fs.mkdirSync(f.hooks);
  fs.mkdirSync(f.home);
  f.env = { ...processEnv(), HOME: f.home, XDG_CONFIG_HOME: path.join(dir, 'xdg'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  git(f, ['init', '-q']);
  git(f, ['config', 'user.name', 'Fixture']);
  git(f, ['config', 'user.email', 'fixture@example.invalid']);
  git(f, ['config', 'commit.gpgsign', 'false']);
  git(f, ['config', 'core.hooksPath', f.hooks]);
  write(f, 'README.md', 'readme\n');
  git(f, ['add', '.']);
  git(f, ['commit', '-qm', 'baseline']);
  f.start = git(f, ['rev-parse', 'HEAD']).trim();
  write(f, 'app.txt', 'verified edit\n');
  write(f, 'README.md', 'readme\nchanged\n');
  return f;
}

function hook(f, name, script) {
  const file = path.join(f.hooks, name);
  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`);
  fs.chmodSync(file, 0o755);
}

function commit(f) {
  const env = Object.entries(f.env).map(([k, v]) => `${k}=${v}`);
  const req = { dir: f.repo, env, title: TITLE, slug: SLUG, message_file: f.messageFile };
  const res = spawnSync(driverBinary(), [], { input: JSON.stringify(req), env: processEnv(), encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  assert.equal(res.status, 0, `the commit driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  f.result = JSON.parse(res.stdout);
  assert.equal(f.result.start, f.start, `the driver started from ${f.result.start}, not the baseline commit ${f.start}`);
}

// madeCommit is the commit Kogen made: the latest HEAD reflog entry whose parent is the start.
function madeCommit(f) {
  const entries = git(f, ['log', '-g', '--format=%H %P', 'HEAD']).split('\n').filter(Boolean).map(l => l.split(' '));
  const made = entries.find(([id, ...parents]) => id !== f.start && parents.length === 1 && parents[0] === f.start);
  assert.ok(made, `no commit on top of the start ${f.start} is in the HEAD reflog:\n${entries.map(e => e.join(' ')).join('\n')}`);
  return made[0];
}

// rawMessage is the message bytes of a commit object, after its header.
function rawMessage(f, id) {
  const raw = git(f, ['cat-file', 'commit', id]);
  const at = raw.indexOf('\n\n');
  assert.ok(at >= 0, `commit ${id} has no message separator:\n${raw}`);
  return raw.slice(at + 2);
}

function checkMessage(f, want) {
  const id = madeCommit(f);
  assert.equal(JSON.stringify(rawMessage(f, id)), JSON.stringify(want), `the message of the commit Kogen made (${id}) is not the expected one`);
}

function checkLands(f) {
  const r = f.result;
  assert.equal(r.error, null, `Commit failed instead of landing: ${JSON.stringify(r.error)}`);
  const head = git(f, ['rev-parse', 'HEAD']).trim();
  assert.equal(r.head, head, `Commit returned ${r.head}, but HEAD is ${head}`);
  assert.notEqual(head, f.start, 'HEAD is still the start commit');
  assert.equal(git(f, ['rev-parse', 'HEAD^']).trim(), f.start, 'the landed commit is not on top of the start commit');
  assert.equal(git(f, ['rev-parse', 'HEAD^{tree}']).trim(), r.tree, 'the landed tree is not the reviewed tree');
}

function checkUndone(f, detail) {
  const r = f.result;
  assert.notEqual(r.error, null, `Commit landed ${r.head} instead of failing with candidate/hook_changed_commit: ${detail}`);
  assert.deepEqual({ class: r.error.class, reason: r.error.reason, exit: r.error.exit }, { class: 'candidate', reason: 'hook_changed_commit', exit: 1 }, `Commit failed with ${JSON.stringify(r.error)}`);
  assert.equal(r.error.detail, detail, 'the error detail is not the expected one');
  assert.equal(r.head, '', `Commit returned a commit id ${r.head} with its error`);
  assert.equal(git(f, ['rev-parse', 'HEAD']).trim(), f.start, 'HEAD is not back at the start commit');
  const reflog = git(f, ['reflog', '-1', '--format=%gs']);
  assert.equal(reflog, `${UNDO_REFLOG}\n`, `the latest HEAD reflog entry is not Kogen's undo: ${JSON.stringify(reflog)}`);
}

function checkWorkTree(f) {
  assert.equal(fs.readFileSync(path.join(f.repo, 'app.txt'), 'utf8'), 'verified edit\n', 'app.txt lost the verified edit');
  assert.equal(fs.readFileSync(path.join(f.repo, 'README.md'), 'utf8'), 'readme\nchanged\n', 'README.md lost the verified edit');
  assert.equal(git(f, ['status', '--porcelain', '--untracked-files=all']), 'M  README.md\nA  app.txt\n', 'the working tree and index are not the candidate on top of the start commit');
}

const SNEAKY = (f) => `[ -f '${f.dir}/sneaked' ] && exit 0\ntouch '${f.dir}/sneaked'\ngit commit -q --allow-empty -m sneaky`;
const ITSELF = 'a commit hook changed the commit itself; the commit was undone and the changes are left in place';

if (require.main === module) {
  const kind = process.argv[2];
  const lines = [];
  const fixtures = [];
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
    const plain = newFixture();
    const sneaky = newFixture();
    fixtures.push(plain, sneaky);
    hook(sneaky, 'post-commit', SNEAKY(sneaky));
    commit(plain);
    commit(sneaky);
    const good = kind === 'good';
    verdict('lands', () => checkLands(good ? plain : sneaky));
    verdict('message', () => checkMessage(plain, good ? `${TITLE}\n\nKogen-Intent: ${SLUG}\n` : `${TITLE}\n\nKogen-Intent: other-slug\n`));
    verdict('undone', () => { checkUndone(good ? sneaky : plain, ITSELF); checkWorkTree(good ? sneaky : plain); });
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
    if (this.commitTrailer) fs.rmSync(this.commitTrailer.dir, { recursive: true, force: true });
  });
  AfterAll(removeDriver);

  function fixture(world) {
    assert.ok(world.commitTrailer, 'no fixture: a Given step must create the repository first');
    return world.commitTrailer;
  }

  function landed(world) {
    const f = fixture(world);
    assert.ok(f.result, 'no commit: a When step must commit the candidate first');
    return f;
  }

  Given('coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks', function () {
    this.commitTrailer = newFixture();
  });

  Given('coord-commit-trailer-survives-hooks: a {string} hook that runs:', function (name, script) {
    hook(fixture(this), name, script);
  });

  When('coord-commit-trailer-survives-hooks: Kogen commits the candidate as {string} for the Intent {string}', { timeout: 300000 }, function (title, slug) {
    assert.deepEqual([title, slug], [TITLE, SLUG], 'the steps commit only the fixture title and slug');
    commit(fixture(this));
  });

  Then('coord-commit-trailer-survives-hooks: the commit Kogen made has the message:', function (want) {
    checkMessage(landed(this), `${want}\n`);
  });

  Then('coord-commit-trailer-survives-hooks: the commit lands on top of the start commit with the reviewed tree', function () {
    checkLands(landed(this));
  });

  Then('coord-commit-trailer-survives-hooks: the commit is undone with the detail {string}', function (detail) {
    checkUndone(landed(this), detail);
  });

  Then('coord-commit-trailer-survives-hooks: the verified changes are left in place', function () {
    checkWorkTree(landed(this));
  });
}
