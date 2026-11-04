// Steps of coord-hash-stream-large-files: the approval hash (project.HashWithUnreadable and
// project.Hash) and the verification input digests (git.Repo.Materialize) of real files, compared
// with an independent Node SHA-256 reference, and the heap allocated during the Go call
// (growth of runtime.MemStats.TotalAlloc, an upper bound of peak heap growth).
const assert = require('node:assert/strict');

const MiB = 1 << 20;

function compareResult(actual, expected) {
  assert.deepEqual(actual, expected, 'the Go result differs from the independent reference');
}

function checkAlloc(alloc, limitMiB) {
  assert.ok(Number.isSafeInteger(alloc) && alloc >= 0, `allocation ${alloc} is not a byte count`);
  assert.ok(alloc < limitMiB * MiB, `heap allocation grew by ${alloc} bytes during the call; the limit is ${limitMiB} MiB (${limitMiB * MiB} bytes)`);
}

if (require.main === module) {
  // Observer controls: the reference of a 268435456-byte sparse file with "tail" at its end, a
  // streaming observation (good) and the unchanged code's observed allocation (bad).
  const hash = 'cc7c2e32cd69056f0907af138fa1105eeb5d2b405f0990f86809406ebd3656d3';
  const reference = { hash, legacy: hash, unreadable: [] };
  const observed = { hash, legacy: hash, unreadable: [], alloc: process.argv[2] === 'good' ? 279200 : 268444552 };
  try {
    compareResult({ hash: observed.hash, legacy: observed.legacy, unreadable: observed.unreadable }, reference);
    checkAlloc(observed.alloc, 16);
    console.log('match');
  } catch (_) { console.log('mismatch'); process.exitCode = 1; }
} else {
  const { Given, When, Then, After } = require('@cucumber/cucumber');
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');

  const driver = `package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"runtime"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	var before, after runtime.MemStats
	out := map[string]any{}
	runtime.GC()
	runtime.ReadMemStats(&before)
	switch os.Args[1] {
	case "hash":
		h, u := project.HashWithUnreadable(os.Args[2], os.Args[3:])
		runtime.ReadMemStats(&after)
		if u == nil {
			u = []string{}
		}
		out["hash"], out["unreadable"], out["legacy"] = h, u, project.Hash(os.Args[2], os.Args[3:])
	case "materialize":
		m, err := git.New(os.Args[2], nil).Materialize(os.Args[3], os.Args[4])
		runtime.ReadMemStats(&after)
		if err != nil {
			fmt.Fprintln(os.Stderr, "materialize:", err)
			os.Exit(1)
		}
		inputs := map[string]any{}
		for p, in := range m.Inputs {
			inputs[p] = map[string]any{"kind": in.Kind, "target": in.Target, "exec": in.Exec, "digest": hex.EncodeToString(in.Digest[:])}
		}
		out["inputs"] = inputs
	}
	out["alloc"] = after.TotalAlloc - before.TotalAlloc
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

  const sha = s => crypto.createHash('sha256').update(s).digest('hex');

  // The independent reference digest: `missing` when opening fails with ENOENT, `unreadable`
  // for any other open or read failure, otherwise the SHA-256 of the bytes read.
  function digestOf(full) {
    let fd;
    try { fd = fs.openSync(full, 'r'); } catch (e) { return e.code === 'ENOENT' ? 'missing' : 'unreadable'; }
    try {
      const h = crypto.createHash('sha256');
      const buf = Buffer.alloc(MiB);
      let n;
      while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
      return h.digest('hex');
    } catch (_) {
      return 'unreadable';
    } finally { fs.closeSync(fd); }
  }

  function runDriver(world, args) {
    const file = path.join(world.chs.dir, 'driver', 'main.go');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, driver);
    const res = spawnSync('go', ['run', file, ...args], { cwd: process.cwd(), encoding: 'utf8', timeout: 280000, maxBuffer: 64 * MiB });
    assert.equal(res.status, 0, `go run ${args[0]} driver failed (status ${res.status}, signal ${res.signal}, error ${res.error}):\n${res.stdout}${res.stderr}`);
    return JSON.parse(res.stdout);
  }

  function cleanEnv() {
    const env = {};
    for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
    return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  }

  function git(cwd, ...args) {
    const res = spawnSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8', timeout: 120000 });
    assert.equal(res.status, 0, `git ${args.join(' ')} failed (status ${res.status}): ${res.stdout}${res.stderr}`);
    return res.stdout.trim();
  }

  function place(world, name) {
    const full = path.join(world.chs.root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    world.chs.paths.push(name);
    return full;
  }

  function patterned(size) {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buf[i] = (i * 131 + (i >>> 9) + 7) & 255;
    return buf;
  }

  After(function () {
    if (this.chs) fs.rmSync(this.chs.dir, { recursive: true, force: true });
  });

  Given('coord-hash-stream-large-files: a fixture directory', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-stream-'));
    const root = path.join(dir, 'root');
    fs.mkdirSync(root);
    this.chs = { dir, root, paths: [] };
  });

  Given('coord-hash-stream-large-files: a sparse file {string} of {int} bytes', function (name, size) {
    const fd = fs.openSync(place(this, name), 'w');
    try {
      fs.ftruncateSync(fd, size);
      fs.writeSync(fd, 'head', 0);
      fs.writeSync(fd, 'tail', size - 4);
    } finally { fs.closeSync(fd); }
    assert.equal(fs.statSync(path.join(this.chs.root, name)).size, size);
  });

  Given('coord-hash-stream-large-files: a file {string} with {int} patterned bytes', function (name, size) {
    fs.writeFileSync(place(this, name), patterned(size));
  });

  Given('coord-hash-stream-large-files: an executable file {string} with {int} patterned bytes', function (name, size) {
    const full = place(this, name);
    fs.writeFileSync(full, patterned(size));
    fs.chmodSync(full, 0o755);
  });

  Given('coord-hash-stream-large-files: an absent path {string}', function (name) {
    place(this, name);
  });

  Given('coord-hash-stream-large-files: a directory {string}', function (name) {
    fs.mkdirSync(place(this, name));
  });

  Given('coord-hash-stream-large-files: a permission-denied file {string}', function (name) {
    const full = place(this, name);
    fs.writeFileSync(full, 'secret');
    fs.chmodSync(full, 0);
  });

  Given('coord-hash-stream-large-files: a symlink {string} to {string}', function (name, target) {
    fs.symlinkSync(target, place(this, name));
  });

  Given('coord-hash-stream-large-files: the recorded parity inputs of case {string}', function (slug) {
    const parity = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'project/testdata/parity.json'), 'utf8'));
    for (const [p, content] of Object.entries(parity.files)) {
      const full = path.join(this.chs.root, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const c = parity.cases.find(c => c.slug === slug);
    assert.ok(c, `no recorded parity case ${slug}`);
    this.chs.paths = c.baseline.slice();
  });

  When('coord-hash-stream-large-files: I compute the approval hash of the fixture paths', { timeout: 300000 }, function () {
    this.chs.result = runDriver(this, ['hash', this.chs.root, ...this.chs.paths]);
  });

  When('coord-hash-stream-large-files: I materialize the fixture as a candidate tree', { timeout: 300000 }, function () {
    git(this.chs.root, 'init', '-q');
    git(this.chs.root, 'add', '-A');
    const tree = git(this.chs.root, 'write-tree');
    this.chs.result = runDriver(this, ['materialize', this.chs.root, tree, path.join(this.chs.dir, 'dst')]);
  });

  Then('coord-hash-stream-large-files: the approval hash equals the independent reference', function () {
    const lines = this.chs.paths.slice().sort().map(p => [p, digestOf(path.join(this.chs.root, p))]);
    const hash = sha(lines.map(([p, d]) => p + '\0' + d + '\n').join(''));
    const { result } = this.chs;
    compareResult({ hash: result.hash, legacy: result.legacy, unreadable: result.unreadable },
      { hash, legacy: hash, unreadable: lines.filter(([, d]) => d === 'unreadable').map(([p]) => p) });
  });

  Then('coord-hash-stream-large-files: the approval hash is {string}', function (want) {
    const { result } = this.chs;
    compareResult({ hash: result.hash, legacy: result.legacy }, { hash: want, legacy: want });
  });

  Then('coord-hash-stream-large-files: the unreadable paths are {string}', function (want) {
    assert.deepEqual(this.chs.result.unreadable, want === '' ? [] : want.split(','));
  });

  Then('coord-hash-stream-large-files: the recorded verification inputs equal the independent reference', function () {
    const expected = {};
    for (const p of this.chs.paths) {
      const full = path.join(this.chs.root, p);
      const st = fs.lstatSync(full);
      expected[p] = st.isSymbolicLink()
        ? { kind: 'symlink', target: fs.readlinkSync(full), exec: 0, digest: '0'.repeat(64) }
        : { kind: 'file', target: '', exec: st.mode & 0o100 ? 0o111 : 0, digest: digestOf(full) };
    }
    compareResult(this.chs.result.inputs, expected);
  });

  Then('coord-hash-stream-large-files: the recorded input {string} is a {string} with target {string} and executable bits {int}', function (name, kind, target, exec) {
    const input = this.chs.result.inputs[name];
    assert.ok(input, `no recorded input ${name}`);
    assert.deepEqual({ kind: input.kind, target: input.target, exec: input.exec }, { kind, target, exec });
  });

  Then('coord-hash-stream-large-files: heap allocation during the call stays under {int} MiB', function (limit) {
    checkAlloc(this.chs.result.alloc, limit);
  });
}
