// Steps of coord-baseline-intent-walk-errors-visible: project.Baseline over a real fixture Intent
// folder (readable, absent, with a mode-000 subfolder or a dangling symlink), run through a small
// Go driver built with go build, and its result judged as an error naming a path or an exact
// ordered file list.
const assert = require('node:assert/strict');

function checkFailure(result, name) {
  assert.equal(typeof result.error, 'string', `Baseline returned no error; files ${JSON.stringify(result.files)}`);
  assert.ok(result.error.includes(name), `Baseline error ${JSON.stringify(result.error)} does not name ${name}`);
  assert.deepEqual(result.files, [], `Baseline returned files ${JSON.stringify(result.files)} with its error`);
}

function checkFiles(result, expected) {
  assert.equal(result.error, null, `Baseline failed: ${result.error}`);
  assert.deepEqual(result.files, expected, 'Baseline files differ');
}

if (require.main === module) {
  // Observer controls: a correct failure (good) and the unchanged code's silently shorter list (bad)
  // for the unreadable-subfolder fixture, plus the readable list in both.
  const listed = ['.kogen/intents/demo/intent.md', '.kogen/intents/demo/acceptance.feature', '.kogen/intents/demo/fixtures/data.txt', '.kogen/intents/demo/notes.txt', '.kogen/project.yaml', '.kogen/models.yaml'];
  const failure = process.argv[2] === 'good'
    ? { files: [], error: 'intent folder: open /tmp/walk-errors-x/root/.kogen/intents/demo/fixtures: permission denied' }
    : { files: ['.kogen/intents/demo/intent.md', '.kogen/intents/demo/acceptance.feature', '.kogen/intents/demo/notes.txt', '.kogen/project.yaml', '.kogen/models.yaml'], error: null };
  try {
    checkFiles({ files: listed.slice(), error: null }, listed);
    checkFailure(failure, '.kogen/intents/demo/fixtures');
    console.log('match');
  } catch (_) { console.log('mismatch'); process.exitCode = 1; }
} else {
  const { Given, When, Then, After } = require('@cucumber/cucumber');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');

  const driver = `package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	files, err := project.Baseline(os.Args[1], os.Args[2], &project.Config{})
	if files == nil {
		files = []string{}
	}
	out := map[string]any{"files": files, "error": nil}
	if err != nil {
		out["error"] = err.Error()
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

  const intentDir = slug => '.kogen/intents/' + slug;

  // Restores owner access below dir so the fixture can be removed.
  function restore(dir) {
    let entries;
    try { fs.chmodSync(dir, 0o755); entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) if (e.isDirectory()) restore(path.join(dir, e.name));
  }

  After(function () {
    if (this.walk) {
      restore(this.walk.dir);
      fs.rmSync(this.walk.dir, { recursive: true, force: true });
    }
  });

  Given('coord-baseline-intent-walk-errors-visible: a fixture repository', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-errors-'));
    const root = path.join(dir, 'root');
    fs.mkdirSync(root);
    this.walk = { dir, root };
  });

  Given('coord-baseline-intent-walk-errors-visible: the Intent {string} has the files:', function (slug, table) {
    for (const [name] of table.raw()) {
      const full = path.join(this.walk.root, intentDir(slug), name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, name + '\n');
    }
  });

  Given('coord-baseline-intent-walk-errors-visible: the Intent {string} has a dangling symlink {string}', function (slug, name) {
    const full = path.join(this.walk.root, intentDir(slug), name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.symlinkSync('missing-target', full);
    assert.ok(fs.lstatSync(full).isSymbolicLink() && !fs.existsSync(full), `fixture: ${name} is not a dangling symlink`);
  });

  Given('coord-baseline-intent-walk-errors-visible: the Intent {string} folder {string} is made unreadable', function (slug, name) {
    const full = path.join(this.walk.root, intentDir(slug), name);
    fs.chmodSync(full, 0);
    let code = null;
    try { fs.readdirSync(full); } catch (e) { code = e.code; }
    assert.ok(code === 'EACCES' || code === 'EPERM', `fixture: mode-000 folder ${name} is still readable (read error ${code}); acceptance needs an unprivileged user`);
  });

  When('coord-baseline-intent-walk-errors-visible: I compute the baseline of {string}', { timeout: 180000 }, function (slug) {
    const src = path.join(this.walk.dir, 'driver', 'main.go');
    const bin = path.join(this.walk.dir, 'driver', 'baseline-driver');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, driver);
    const build = spawnSync('go', ['build', '-o', bin, src], { cwd: process.cwd(), encoding: 'utf8', timeout: 150000 });
    assert.equal(build.status, 0, `go build of the Baseline driver failed (status ${build.status}, signal ${build.signal}, error ${build.error}):\n${build.stdout}${build.stderr}`);
    const res = spawnSync(bin, [this.walk.root, slug], { encoding: 'utf8', timeout: 25000 });
    assert.equal(res.status, 0, `the Baseline driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
    this.walk.result = JSON.parse(res.stdout);
  });

  Then('coord-baseline-intent-walk-errors-visible: the baseline fails with an error naming {string}', function (name) {
    checkFailure(this.walk.result, name);
  });

  Then('coord-baseline-intent-walk-errors-visible: the baseline succeeds with:', function (table) {
    checkFiles(this.walk.result, table.raw().map(([p]) => p));
  });
}
