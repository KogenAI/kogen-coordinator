// Steps of the Intent k-local-lineups-checks. Each scenario makes its own Git repository in a new
// temporary folder: one main commit holding .kogen/project.yaml and a .gitignore that ignores
// .kogen/local/, then host-local files under .kogen/local/. A small Go driver, built once per run
// from this checkout's module, calls project.LoadConfig on that repository and, for a Build, then
// git.Repo.Tree and git.Repo.Commit, as kogen-build does; it prints JSON. The checkout itself is
// never written. Git runs without global or system configuration, hooks or signing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, After} = require('@cucumber/cucumber');

const PREFIX = 'k-local-lineups-checks: ';
const REPO = path.resolve(__dirname, '..', '..');
const SLOW = {timeout: 600000};

const DRIVER = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	mode, root, scratch := os.Args[1], os.Args[2], os.Args[3]
	out := map[string]any{}
	defer func() {
		b, err := json.Marshal(out)
		if err != nil {
			panic(err)
		}
		fmt.Println(string(b))
	}()
	hide := func(s string) string { return strings.ReplaceAll(s, root, "<root>") }
	cfg, err := project.LoadConfig(root)
	if err != nil {
		e, ok := sys.AsError(err)
		if !ok {
			out["error"] = map[string]any{"text": hide(err.Error())}
			return
		}
		lines := []string{}
		for _, l := range e.Lines {
			lines = append(lines, hide(l))
		}
		out["error"] = map[string]any{"class": e.Class, "reason": e.Reason, "exit": e.Exit, "detail": hide(e.Detail), "lines": lines}
		return
	}
	checks := []map[string]string{}
	for _, c := range cfg.Checks {
		checks = append(checks, map[string]string{"name": c.Name, "run": c.Run})
	}
	roles := []map[string]string{}
	for _, name := range project.ModelRoles {
		r := cfg.Models[name]
		roles = append(roles, map[string]string{"role": name, "executor": r.Executor, "provider": r.Provider, "model": r.Model, "effort": r.Effort})
	}
	out["checks"], out["roles"] = checks, roles
	if mode != "build" {
		return
	}
	repo := git.New(root, nil)
	start := repo.Head()
	tree, err := repo.Tree(start, nil)
	if err != nil {
		out["build_error"] = hide(err.Error())
		return
	}
	head, err := repo.Commit(sys.NewWith(os.Environ(), root), git.CommitSpec{
		Tree: tree, Start: start, Title: "Add the notes", Slug: "add-notes",
		MessageFile: filepath.Join(scratch, "commit-message.txt"),
	})
	if err != nil {
		out["build_error"] = hide(err.Error())
		return
	}
	out["start"], out["head"] = start, head
}
`;

let driverBinary;

// driver builds the Go driver once per process from this checkout's module.
function driver() {
  if (driverBinary) return driverBinary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-local-lineups-checks-driver-'));
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

function state(world) {
  assert.ok(world.kLocalLineupsChecks, 'no project: the Background step did not run');
  return world.kLocalLineupsChecks;
}

function git(fx, ...args) {
  const r = spawnSync('git', args, {cwd: fx.root, env: fx.env, encoding: 'utf8'});
  assert.equal(r.status, 0, `git ${args.join(' ')} in ${fx.root} exited ${r.status} ${r.error || ''}:\n${r.stdout}${r.stderr}`);
  return r.stdout;
}

function write(fx, rel, text) {
  const file = path.join(fx.root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

function run(fx, mode) {
  const bin = driver();
  const r = spawnSync(bin, [mode, fx.root, fx.scratch], {cwd: fx.root, env: fx.env, encoding: 'utf8'});
  assert.equal(r.status, 0, `the driver (${mode} ${fx.root}) exited ${r.status} ${r.error || ''}:\n${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}

function loaded(fx) {
  assert.ok(fx.result, 'the configuration was not loaded');
  assert.equal(fx.result.error, undefined, `the load failed: ${JSON.stringify(fx.result.error)}`);
  return fx.result;
}

After(function() {
  if (this.kLocalLineupsChecks) fs.rmSync(this.kLocalLineupsChecks.base, {recursive: true, force: true});
});

Given(PREFIX + 'a project whose main commit holds the configuration:', SLOW, function(text) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'k-local-lineups-checks-'));
  const fx = {base, root: path.join(base, 'repo'), scratch: path.join(base, 'scratch')};
  this.kLocalLineupsChecks = fx;
  const home = path.join(base, 'home');
  const hooks = path.join(base, 'hooks');
  for (const dir of [fx.root, fx.scratch, home, hooks]) fs.mkdirSync(dir, {recursive: true});
  fx.env = isolatedEnv(home);
  git(fx, 'init', '-q', '-b', 'main');
  git(fx, 'config', 'user.name', 'Fixture');
  git(fx, 'config', 'user.email', 'fixture@example.invalid');
  git(fx, 'config', 'core.hooksPath', hooks);
  git(fx, 'config', 'commit.gpgsign', 'false');
  fx.committed = text + '\n';
  write(fx, '.gitignore', '.kogen/local/\n');
  write(fx, '.kogen/project.yaml', fx.committed);
  git(fx, 'add', '.');
  git(fx, 'commit', '-qm', 'main');
  fx.main = git(fx, 'rev-parse', 'HEAD').trim();
});

Given(PREFIX + 'the host-local file {string} contains:', function(rel, text) {
  assert.ok(rel.startsWith('.kogen/local/'), `${rel} is not under .kogen/local/`);
  write(state(this), rel, text + '\n');
});

Given(PREFIX + 'the working copy of .kogen\\/project.yaml is replaced with:', function(text) {
  write(state(this), '.kogen/project.yaml', text + '\n');
});

When(PREFIX + 'Kogen loads the project configuration', SLOW, function() {
  const fx = state(this);
  fx.result = run(fx, 'load');
});

When(PREFIX + 'a Build on the main commit lands the new file {string} containing {string}', SLOW, function(rel, content) {
  const fx = state(this);
  write(fx, rel, content + '\n');
  fx.result = run(fx, 'build');
});

Then(PREFIX + 'the checkout has nothing to commit', function() {
  const fx = state(this);
  assert.equal(git(fx, 'status', '--porcelain', '--untracked-files=all'), '', 'git status --porcelain --untracked-files=all is not empty');
  assert.equal(git(fx, 'rev-parse', 'HEAD').trim(), fx.main);
});

Then(PREFIX + 'the checks are:', function(table) {
  assert.deepEqual(loaded(state(this)).checks, table.hashes());
});

Then(PREFIX + 'the roles are:', function(table) {
  assert.deepEqual(loaded(state(this)).roles, table.hashes());
});

Then(PREFIX + 'the load fails naming {string} with the lines:', function(rel, text) {
  const fx = state(this);
  assert.ok(fx.result && fx.result.error, `the load succeeded: ${JSON.stringify(fx.result)}`);
  assert.deepEqual(fx.result.error, {
    class: 'environment', reason: 'project_config_invalid', exit: 3, detail: '<root>/' + rel, lines: text.split('\n'),
  });
});

Then(PREFIX + 'the committed configuration is unchanged and nothing is left to commit', function() {
  const fx = state(this);
  assert.equal(fs.readFileSync(path.join(fx.root, '.kogen/project.yaml'), 'utf8'), fx.committed, 'the working copy of .kogen/project.yaml changed');
  assert.equal(git(fx, 'show', 'HEAD:.kogen/project.yaml'), fx.committed, '.kogen/project.yaml at HEAD differs from the main commit');
  assert.equal(git(fx, 'status', '--porcelain', '--untracked-files=all'), '', 'git status --porcelain --untracked-files=all is not empty');
});

Then(PREFIX + 'the parent of the landed commit is exactly the main commit', function() {
  const fx = state(this);
  const result = loaded(fx);
  assert.equal(result.build_error, undefined, `the Build failed: ${result.build_error}`);
  assert.ok(result.head, `no commit landed: ${JSON.stringify(result)}`);
  assert.equal(result.start, fx.main, 'the Build did not start on the main commit');
  assert.equal(git(fx, 'rev-parse', 'HEAD').trim(), result.head, 'HEAD is not the landed commit');
  assert.equal(git(fx, 'rev-list', '--parents', '-n', '1', result.head).trim(), `${result.head} ${fx.main}`);
});

Then(PREFIX + 'the landed commit changes only {string}', function(rel) {
  const fx = state(this);
  assert.equal(git(fx, 'diff-tree', '--no-commit-id', '--name-only', '-r', fx.main, fx.result.head), rel + '\n');
});

Then(PREFIX + 'the files of the landed commit are:', function(text) {
  const fx = state(this);
  assert.deepEqual(git(fx, 'ls-tree', '-r', '--name-only', fx.result.head).split('\n').filter(Boolean), text.split('\n'));
});

Then(PREFIX + 'no commit landed and HEAD is still the main commit', function() {
  const fx = state(this);
  assert.equal(fx.result.head, undefined, `a commit landed: ${JSON.stringify(fx.result)}`);
  assert.equal(git(fx, 'rev-parse', 'HEAD').trim(), fx.main);
  assert.equal(git(fx, 'rev-list', '--count', 'HEAD').trim(), '1');
});
