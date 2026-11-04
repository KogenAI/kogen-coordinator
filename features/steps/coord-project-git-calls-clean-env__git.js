const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LOCATION = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX', 'GIT_QUARANTINE_PATH', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_SHALLOW_FILE'];

// The base environment: no inherited location variables, Git configuration only from the repositories.
function baseEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (LOCATION.includes(k) || k.startsWith('GIT_CONFIG')) delete env[k];
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  return env;
}

function git(cwd, args, env) {
  return execFileSync('git', args, { cwd, env: env || baseEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// target: tracked a.txt (force-added although .gitignore matches it, so only the target's own index lists it),
// user.name "Pat Owner". other: tracked b.txt, user.name "Other". Plus a valid empty index and a zero-byte file.
function fixture(dir) {
  const target = path.join(dir, 'target'), other = path.join(dir, 'other');
  fs.mkdirSync(target); fs.mkdirSync(other);
  git(target, ['init', '-q']);
  fs.writeFileSync(path.join(target, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(target, '.gitignore'), 'a.txt\n');
  git(target, ['add', '-f', 'a.txt', '.gitignore']);
  git(target, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture']);
  git(target, ['config', 'user.name', 'Pat Owner']);
  git(other, ['init', '-q']);
  fs.writeFileSync(path.join(other, 'b.txt'), 'b\n');
  git(other, ['add', 'b.txt']);
  git(other, ['config', 'user.name', 'Other']);
  const emptyIndex = path.join(dir, 'empty.index');
  git(target, ['read-tree', '--empty'], { ...baseEnv(), GIT_INDEX_FILE: emptyIndex });
  const zeroIndex = path.join(dir, 'zero.index');
  fs.writeFileSync(zeroIndex, '');
  return { target, other, emptyIndex, zeroIndex };
}

const ENVIRONMENTS = {
  'a clean environment': () => ({}),
  'GIT_INDEX_FILE set to an empty index': f => ({ GIT_INDEX_FILE: f.emptyIndex }),
  'GIT_INDEX_FILE set to a zero-byte file': f => ({ GIT_INDEX_FILE: f.zeroIndex }),
  'GIT_DIR set to the other repository': f => ({ GIT_DIR: path.join(f.other, '.git') }),
  'GIT_DIR and GIT_INDEX_FILE set to the other repository': f => ({ GIT_DIR: path.join(f.other, '.git'), GIT_INDEX_FILE: path.join(f.other, '.git', 'index') }),
};

function environment(name, f) {
  const extra = ENVIRONMENTS[name];
  if (!extra) throw new Error(`unknown environment ${JSON.stringify(name)}`);
  return { ...baseEnv(), ...extra(f) };
}

// A git placed first on PATH that appends its arguments and whether GIT_DIR and GIT_INDEX_FILE reached it, then runs the real git.
function fakeGit(dir) {
  const real = execFileSync('sh', ['-c', 'command -v git'], { env: baseEnv(), encoding: 'utf8' }).trim();
  const bin = path.join(dir, 'fakebin');
  fs.mkdirSync(bin);
  const script = '#!/bin/sh\n' +
    'printf \'%s|GIT_DIR=%s|GIT_INDEX_FILE=%s\\n\' "$*" "${GIT_DIR+set}" "${GIT_INDEX_FILE+set}" >> "$FAKE_GIT_LOG"\n' +
    'exec "' + real + '" "$@"\n';
  fs.writeFileSync(path.join(bin, 'git'), script, { mode: 0o755 });
  return { bin, log: path.join(dir, 'fake-git.log') };
}

function lines(expected) { return expected === '[]' ? [] : expected.split('\n'); }
function compareFiles(actual, expected) { assert.deepEqual({ files: actual.files, error: actual.error }, { files: lines(expected), error: '' }); }
function compareProblems(actual, expected) { assert.deepEqual(actual.problems, lines(expected)); }
function compareLog(text, expected) { assert.deepEqual(text.split('\n').filter(l => l !== ''), lines(expected)); }

if (require.main === module) {
  const good = process.argv[2] === 'good';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-git-observer-'));
  try {
    const f = fixture(dir);
    const env = environment(good ? 'a clean environment' : 'GIT_DIR and GIT_INDEX_FILE set to the other repository', f);
    const listed = git(f.target, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], env).split('\0').filter(p => p === 'a.txt');
    compareFiles({ files: listed, error: '' }, 'a.txt');
    const fake = fakeGit(dir);
    execFileSync(path.join(fake.bin, 'git'), ['--version'], { cwd: f.target, env: { ...env, FAKE_GIT_LOG: fake.log }, stdio: ['ignore', 'pipe', 'pipe'] });
    compareLog(fs.readFileSync(fake.log, 'utf8'), '--version|GIT_DIR=|GIT_INDEX_FILE=');
    console.log('match');
  } catch (_) { console.log('mismatch'); process.exitCode = 1; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else {
  const { When, Then, AfterAll } = require('@cucumber/cucumber');
  const driverSource = `package main

import (
	"encoding/json"
	"os"

	repogit "github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	mode, root := os.Args[1], os.Args[2]
	out := map[string]any{}
	if mode == "protected" || mode == "all" {
		files, err := project.Protected(root, &project.Config{Protect: []string{"a.txt"}})
		if files == nil {
			files = []string{}
		}
		out["files"], out["error"] = files, ""
		if err != nil {
			out["error"] = err.Error()
		}
	}
	if mode == "all" {
		if r, err := repogit.Open(root, nil); err != nil {
			out["open"] = err.Error()
		} else {
			out["open"] = r.Dir
		}
	}
	if mode == "title" || mode == "all" {
		text := "# " + os.Args[3] + "\\nSlug: demo\\nModel: not applicable — stateless\\nAcceptance:\\n- " + project.FeaturePath("demo") + "\\n## Tests\\n- none: fixture\\n## Feasibility\\n- none\\n"
		overlay := map[string][]byte{project.IntentMDPath("demo"): []byte(text), project.FeaturePath("demo"): []byte("Feature: Fixture\\n  Scenario: Fixture\\n    Then fixture passes\\n")}
		problems := []string{}
		if _, _, err := project.CheckIntent(root, "demo", overlay); err != nil {
			se, ok := sys.AsError(err)
			if !ok {
				panic(err)
			}
			problems = se.Lines
		}
		out["problems"] = problems
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}
`;
  let driverDir = null;
  function driver() {
    if (driverDir) return path.join(driverDir, 'driver');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-git-driver-'));
    fs.writeFileSync(path.join(dir, 'main.go'), driverSource);
    execFileSync('go', ['build', '-o', path.join(dir, 'driver'), path.join(dir, 'main.go')], { env: baseEnv(), encoding: 'utf8', timeout: 110000 });
    driverDir = dir;
    return path.join(dir, 'driver');
  }
  AfterAll(function() { if (driverDir) fs.rmSync(driverDir, { recursive: true, force: true }); });

  function scenario(world, envName, args, recording) {
    const bin = driver();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-git-'));
    try {
      const f = fixture(dir);
      const env = environment(envName, f);
      let fake = null;
      if (recording) {
        fake = fakeGit(dir);
        env.PATH = fake.bin + path.delimiter + env.PATH;
        env.FAKE_GIT_LOG = fake.log;
      }
      world.projectGit = JSON.parse(execFileSync(bin, args(f), { cwd: dir, env, encoding: 'utf8', timeout: 60000 }));
      world.projectGitLog = fake && fs.existsSync(fake.log) ? fs.readFileSync(fake.log, 'utf8') : '';
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  When('coord-project-git-calls-clean-env: I list the protected files with {string}', { timeout: 120000 }, function(envName) {
    scenario(this, envName, f => ['protected', f.target], false);
  });
  When('coord-project-git-calls-clean-env: I check the title {string} with {string}', { timeout: 120000 }, function(title, envName) {
    scenario(this, envName, f => ['title', f.target, title], false);
  });
  When('coord-project-git-calls-clean-env: with a recording git first on PATH and {string}, I list the protected files, open the repository and check the title {string}', { timeout: 120000 }, function(envName, title) {
    scenario(this, envName, f => ['all', f.target, title], true);
  });
  Then('coord-project-git-calls-clean-env: the protected files are', function(expected) { compareFiles(this.projectGit, expected); });
  Then('coord-project-git-calls-clean-env: the title problems are', function(expected) { compareProblems(this.projectGit, expected); });
  Then('coord-project-git-calls-clean-env: the recording git logged', function(expected) { compareLog(this.projectGitLog, expected); });
}
