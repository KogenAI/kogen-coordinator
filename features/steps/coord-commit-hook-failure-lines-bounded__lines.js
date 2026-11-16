// Steps of coord-commit-hook-failure-lines-bounded: git.Repo.Commit and git.Repo.CommitPaths on a
// real repository whose commit hooks fail or rewrite the commit, through a Go driver built from the
// repository root. Each fixture is a repository with one baseline commit (README.md "readme\n"), the
// test identity Fixture <fixture@example.invalid>, commit.gpgsign=false, no global or system
// configuration, and a hooks directory of its own named by core.hooksPath. Its candidate edits
// README.md and adds app.txt. "commit" snapshots it with Repo.Tree and calls Repo.Commit as
// "Add the app" / add-app; "paths" calls Repo.CommitPaths with the subject "Add Kogen configuration",
// the path README.md and hadHead=true.
//
// Run directly, `node <this file> good|bad` is the observer control: the same driver and checks on
// three outcomes the change leaves as they are (a failing hook with 3 lines through Commit and
// through CommitPaths, and a hook that changed two paths). good pairs each fixture with its true
// outcome, bad with a wrong one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TITLE = 'Add the app';
const SLUG = 'add-app';
const SUBJECT = 'Add Kogen configuration';
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
	Mode        string   \`json:"mode"\`
	Dir         string   \`json:"dir"\`
	Env         []string \`json:"env"\`
	Title       string   \`json:"title"\`
	Slug        string   \`json:"slug"\`
	Subject     string   \`json:"subject"\`
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
	s := sys.NewWith(req.Env, req.Dir)
	var head string
	var err error
	if req.Mode == "paths" {
		head, err = repo.CommitPaths(s, req.Subject, []string{"README.md"}, true)
	} else {
		tree, terr := repo.Tree(start, nil)
		if terr != nil {
			fmt.Fprintln(os.Stderr, "Tree:", terr)
			os.Exit(1)
		}
		head, err = repo.Commit(s, git.CommitSpec{Tree: tree, Start: start, Title: req.Title, Slug: req.Slug, MessageFile: req.MessageFile})
	}
	out := map[string]any{"start": start, "head": head, "error": nil}
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
  driverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-lines-driver-'));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-lines-'));
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

function run(f, mode) {
  const env = Object.entries(f.env).map(([k, v]) => `${k}=${v}`);
  const req = { mode, dir: f.repo, env, title: TITLE, slug: SLUG, subject: SUBJECT, message_file: f.messageFile };
  const res = spawnSync(driverBinary(), [], { input: JSON.stringify(req), env: processEnv(), encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  assert.equal(res.status, 0, `the commit driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
  f.result = JSON.parse(res.stdout);
  assert.equal(f.result.start, f.start, `the driver started from ${f.result.start}, not the baseline commit ${f.start}`);
}

function checkRefused(f, cls, reason, exit, detail) {
  const r = f.result;
  assert.notEqual(r.error, null, `the commit landed ${r.head} instead of failing with ${cls}/${reason}: ${detail}`);
  assert.deepEqual({ class: r.error.class, reason: r.error.reason, exit: r.error.exit }, { class: cls, reason, exit }, `the commit failed with ${JSON.stringify(r.error)}`);
  assert.equal(r.error.detail, detail, 'the error detail is not the expected one');
  assert.equal(r.head, '', `a commit id ${r.head} came back with the error`);
}

function checkLines(f, count, first, last) {
  const r = f.result;
  assert.notEqual(r.error, null, `the commit landed ${r.head} instead of failing, so there are no hook lines`);
  const lines = r.error.lines || [];
  assert.equal(lines.length, count, `the refusal carries ${lines.length} lines, not ${count}: first ${JSON.stringify(lines[0])}, last ${JSON.stringify(lines[lines.length - 1])}`);
  assert.equal(lines[0], first, 'the first line of the refusal is not the expected one');
  assert.equal(lines[lines.length - 1], last, 'the last line of the refusal is not the expected one');
}

function checkHeadAtStart(f) {
  assert.equal(git(f, ['rev-parse', 'HEAD']).trim(), f.start, 'HEAD is not the start commit');
}

function checkNothingStaged(f) {
  assert.equal(git(f, ['diff', '--cached', '--name-only']), '', 'a path is still staged');
}

function checkUndone(f, detail) {
  checkRefused(f, 'candidate', 'hook_changed_commit', 1, detail);
  checkHeadAtStart(f);
  const reflog = git(f, ['reflog', '-1', '--format=%gs']);
  assert.equal(reflog, `${UNDO_REFLOG}\n`, `the latest HEAD reflog entry is not Kogen's undo: ${JSON.stringify(reflog)}`);
}

function hookFile(n) {
  return `hook-${String(n).padStart(2, '0')}.txt`;
}

function checkFilesStay(f, from, to) {
  const lo = Number(/^hook-(\d+)\.txt$/.exec(from)[1]);
  const hi = Number(/^hook-(\d+)\.txt$/.exec(to)[1]);
  for (let n = lo; n <= hi; n++) {
    const file = path.join(f.repo, hookFile(n));
    assert.ok(fs.existsSync(file), `${hookFile(n)} is not in the work tree`);
  }
}

const PRINT = (count, exit) => `i=1\nwhile [ $i -le ${count} ]; do echo "line $i"; i=$((i+1)); done\nexit ${exit}`;
const WRITE = (count) => `i=1\nwhile [ $i -le ${count} ]; do f=$(printf 'hook-%02d.txt' $i); echo hook > "$f"; git add "$f"; i=$((i+1)); done`;
const COMMIT_FAILED = 'git commit failed (status 1); the verified changes are left uncommitted';
const PATHS_FAILED = 'git commit failed (status 1); the configuration is left uncommitted';
const TWO = 'a commit hook changed app.txt, hook-made.txt; the commit was undone and the changes are left in place';

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
    const good = kind === 'good';
    const failing = newFixture();
    const failingPaths = newFixture();
    const changed = newFixture();
    fixtures.push(failing, failingPaths, changed);
    hook(failing, 'pre-commit', PRINT(3, 7));
    hook(failingPaths, 'pre-commit', PRINT(3, 1));
    hook(changed, 'pre-commit', "printf 'hook edit\\n' > hook-made.txt\nprintf 'hook edit\\n' > app.txt\ngit add hook-made.txt app.txt");
    run(failing, 'commit');
    run(failingPaths, 'paths');
    run(changed, 'commit');
    verdict('commit', () => { checkLines(failing, good ? 3 : 20, 'line 1', good ? 'line 3' : 'line 30'); checkRefused(failing, 'environment', 'commit_failed', 3, COMMIT_FAILED); checkHeadAtStart(failing); });
    verdict('commitpaths', () => { checkLines(failingPaths, 3, 'line 1', 'line 3'); checkRefused(failingPaths, 'environment', 'commit_failed', 3, good ? PATHS_FAILED : COMMIT_FAILED); checkNothingStaged(failingPaths); });
    verdict('changed', () => checkUndone(changed, good ? TWO : TWO.replace('hook-made.txt', 'hook-made.txt and 0 more')));
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
    if (this.commitLines) fs.rmSync(this.commitLines.dir, { recursive: true, force: true });
  });
  AfterAll(removeDriver);

  function fixture(world) {
    assert.ok(world.commitLines, 'no fixture: a Given step must create the repository first');
    return world.commitLines;
  }

  function ran(world) {
    const f = fixture(world);
    assert.ok(f.result, 'no commit: a When step must commit first');
    return f;
  }

  Given('coord-commit-hook-failure-lines-bounded: a repository with a verified candidate', function () {
    this.commitLines = newFixture();
  });

  Given('coord-commit-hook-failure-lines-bounded: a {string} hook that prints {int} lines and exits {int}', function (name, count, exit) {
    hook(fixture(this), name, PRINT(count, exit));
  });

  Given('coord-commit-hook-failure-lines-bounded: a {string} hook that writes and stages {int} files named hook-01.txt onwards', function (name, count) {
    hook(fixture(this), name, WRITE(count));
  });

  When('coord-commit-hook-failure-lines-bounded: Kogen commits the candidate', { timeout: 300000 }, function () {
    run(fixture(this), 'commit');
  });

  When('coord-commit-hook-failure-lines-bounded: Kogen commits only README.md as the configuration', { timeout: 300000 }, function () {
    run(fixture(this), 'paths');
  });

  Then('coord-commit-hook-failure-lines-bounded: the refusal carries {int} hook lines, the first {string} and the last {string}', function (count, first, last) {
    checkLines(ran(this), count, first, last);
  });

  Then('coord-commit-hook-failure-lines-bounded: the commit is refused as class {string} reason {string} exit {int} with the detail {string}', function (cls, reason, exit, detail) {
    checkRefused(ran(this), cls, reason, exit, detail);
  });

  Then('coord-commit-hook-failure-lines-bounded: the commit is undone with the detail {string}', function (detail) {
    checkUndone(ran(this), detail);
  });

  Then('coord-commit-hook-failure-lines-bounded: HEAD is still the start commit', function () {
    checkHeadAtStart(ran(this));
  });

  Then('coord-commit-hook-failure-lines-bounded: nothing is staged', function () {
    checkNothingStaged(ran(this));
  });

  Then('coord-commit-hook-failure-lines-bounded: the files {string} to {string} are still in the work tree', function (from, to) {
    checkFilesStay(ran(this), from, to);
  });
}
