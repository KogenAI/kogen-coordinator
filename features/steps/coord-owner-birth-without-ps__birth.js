const { Then } = require('@cucumber/cucumber');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

// judgeReport compares a case's verdicts with the expected ones; notes only explain a failure.
function judgeReport(name, actual, expected) {
  const { notes, ...verdicts } = actual;
  assert.deepEqual(verdicts, expected, `case ${name}: verdicts ${JSON.stringify(verdicts)}, notes ${JSON.stringify(notes || [])}`);
}

// judgeFailure requires no birth, a return within the bound and a one-line error naming each fragment.
function judgeFailure(name, actual, within, fragments) {
  assert.equal(actual.birth, '', `case ${name}: a birth was returned: ${JSON.stringify(actual)}`);
  assert.equal(actual.within, within, `case ${name}: returned after ${actual.within}, not within ${within}`);
  assert.notEqual(actual.error, '', `case ${name}: no error`);
  assert.doesNotMatch(actual.error, /[\r\n]/, `case ${name}: error is not one line: ${JSON.stringify(actual.error)}`);
  for (const f of fragments) {
    assert.ok(actual.error.includes(f), `case ${name}: error ${JSON.stringify(actual.error)} does not name ${JSON.stringify(f)}`);
  }
}

const controls = {
  good: [
    () => judgeReport('acquire-without-ps',
      { acquire: 'ok', stderr: '', lock: { pid: 'self', token: 'lock', held: true }, owner: { error: '', pid: 'self', token: 'lock', birth: 'ps' }, notes: [] },
      { acquire: 'ok', stderr: '', lock: { pid: 'self', token: 'lock', held: true }, owner: { error: '', pid: 'self', token: 'lock', birth: 'ps' } }),
    () => judgeReport('ps-format', { self: 'held', owner: 'held', running: 'held', exited: 'stale', notes: ['exited: error process 4242 start time could not be read'] },
      { self: 'held', owner: 'held', running: 'held', exited: 'stale' }),
    () => judgeFailure('timeout', { birth: '', within: '7s', error: 'process 99999999 start time could not be read: open /proc/99999999/stat: no such file or directory; ps -p 99999999 timed out after 5s' },
      '7s', ['process 99999999 start time could not be read', '/proc/99999999/stat', 'ps -p 99999999', 'timed out after 5s']),
  ],
  bad: [
    () => judgeReport('acquire-without-ps',
      { acquire: 'ok', stderr: '', lock: { pid: 'self', token: 'lock', held: true }, owner: { error: 'ps -p 4242: exec: "ps": executable file not found in $PATH', pid: '"0", want "4242"', token: '"<nil>", want "abc"', birth: '"", want "Thu Nov  5 04:11:23 2026"' }, notes: [] },
      { acquire: 'ok', stderr: '', lock: { pid: 'self', token: 'lock', held: true }, owner: { error: '', pid: 'self', token: 'lock', birth: 'ps' } }),
    () => judgeReport('legacy', { running: { held: false, owner_held: false, status: 'RemovedStale', pid: 'owner', error: '' }, exited: { held: false, owner_held: false, status: 'Acquired', pid: '', error: '' } },
      { running: { held: true, owner_held: true, status: 'Held', pid: 'owner', error: '' }, exited: { held: false, owner_held: false, status: 'RemovedStale', pid: 'owner', error: '' } }),
    () => judgeReport('ps-format', { self: 'held', owner: 'held', running: 'stale', exited: 'stale', notes: ['running: birth "Thu Nov  5 04:18:07 2026", error <nil>, recorded "Thu Nov 5 04:18:07 2026"'] },
      { self: 'held', owner: 'held', running: 'held', exited: 'stale' }),
    () => judgeFailure('timeout', { birth: '', within: '30.012s', error: 'process 99999999 start time could not be read: open /proc/99999999/stat: no such file or directory; ps -p 99999999 timed out after 5s' },
      '7s', ['process 99999999 start time could not be read', '/proc/99999999/stat', 'ps -p 99999999', 'timed out after 5s']),
    () => judgeFailure('timeout', { birth: 'Thu Jan  1 00:00:00 2015', within: '7s', error: '' },
      '7s', ['process 99999999 start time could not be read', '/proc/99999999/stat', 'ps -p 99999999', 'timed out after 5s']),
    () => judgeFailure('both-fail', { birth: '', within: '7s', error: 'ps -p 99999999: exec: "ps": executable file not found in $PATH' },
      '7s', ['process 99999999 start time could not be read', '/proc/99999999/stat', 'ps -p 99999999']),
    () => judgeFailure('both-fail', { birth: '', within: '7s', error: 'process 99999999 start time could not be read:\nopen /proc/99999999/stat: no such file or directory\nps -p 99999999: exit status 1' },
      '7s', ['process 99999999 start time could not be read', '/proc/99999999/stat', 'ps -p 99999999']),
  ],
};

// `node <this file> good|bad` checks the judges: every good control is accepted, every bad one rejected.
if (require.main === module) {
  const mode = process.argv[2];
  const results = controls[mode].map(c => { try { c(); return true; } catch (_) { return false; } });
  if (mode === 'good' && results.every(Boolean)) { console.log('accepted'); process.exit(0); }
  if (mode === 'bad' && results.every(r => !r)) { console.log('rejected'); process.exit(1); }
  console.log('controls disagree: ' + JSON.stringify(results));
  process.exit(2);
}

const helpers = String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// psLayout is how ` + '`ps -o lstart=`' + String.raw` prints a start time in the C locale.
const psLayout = "Mon Jan _2 15:04:05 2006"

var (
	notes    []string
	cleanups []func()
)

func main() { observe() }

func cleanup() {
	for i := len(cleanups) - 1; i >= 0; i-- {
		cleanups[i]()
	}
	cleanups = nil
}

// fail reports a broken observation (not a product verdict) and exits 1.
func fail(format string, args ...any) {
	cleanup()
	fmt.Fprintf(os.Stderr, "observe: "+format+"\n", args...)
	os.Exit(1)
}

func tempDir() string {
	dir, err := os.MkdirTemp("", "owner-birth-")
	if err != nil {
		fail("temp dir: %v", err)
	}
	cleanups = append(cleanups, func() { os.RemoveAll(dir) })
	return dir
}

// psBirth is the birth an older build recorded: ` + '`ps -p <pid> -o lstart=`' + String.raw` in the C locale.
func psBirth(pid int) string {
	cmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "lstart=")
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	out, err := cmd.Output()
	if err != nil {
		fail("ps -p %d -o lstart=: %v", pid, err)
	}
	birth := strings.TrimSpace(string(out))
	if birth == "" {
		fail("ps -p %d -o lstart= printed nothing", pid)
	}
	return birth
}

func cleanEnv() []string {
	var env []string
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(kv, "GIT_") && !strings.HasPrefix(kv, "KOGEN_") {
			env = append(env, kv)
		}
	}
	return env
}

// startSleep starts a child process that runs until stop ends it.
func startSleep() *exec.Cmd {
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		fail("sleep: %v", err)
	}
	cmd := exec.Command(sleep, "120")
	if err := cmd.Start(); err != nil {
		fail("start %s: %v", sleep, err)
	}
	cleanups = append(cleanups, func() { stop(cmd) })
	return cmd
}

// stop kills the child and reaps it, so its pid names no process any more.
func stop(cmd *exec.Cmd) {
	if cmd.ProcessState == nil {
		cmd.Process.Kill()
		cmd.Wait()
	}
}

// emptyPath leaves PATH with one empty folder, so no ps can be found.
func emptyPath() {
	os.Setenv("PATH", tempDir())
	if p, err := exec.LookPath("ps"); err == nil {
		fail("ps is still found at %s", p)
	}
}

// verdict judges a recorded owner birth against the birth read now: held when they are equal.
func verdict(label, birth string, err error, recorded string) string {
	if err == nil && birth == recorded {
		return "held"
	}
	notes = append(notes, fmt.Sprintf("%s: birth %q, error %v, recorded %q", label, birth, err, recorded))
	return "stale"
}

func same(got, want, name string) string {
	if got == want {
		return name
	}
	return fmt.Sprintf("%q, want %q", got, want)
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func emit(v map[string]any) {
	if notes != nil {
		v["notes"] = notes
	}
	b, err := json.Marshal(v)
	if err != nil {
		fail("json: %v", err)
	}
	cleanup()
	fmt.Println("BIRTH_RESULT=" + string(b))
}
`;

const lockHelpers = String.raw`package main

import (
	"os"
	"path/filepath"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
)

// writeLegacy writes a lock of an earlier Kogen naming pid, as a plain pid file or a
// directory holding an owner file (OBSERVE_FORMAT=directory), with the given mtime.
func writeLegacy(path, pid string, mtime time.Time) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fail("%v", err)
	}
	owner := path
	if os.Getenv("OBSERVE_FORMAT") == "directory" {
		if err := os.Mkdir(path, 0o755); err != nil {
			fail("%v", err)
		}
		owner = filepath.Join(path, "owner")
	}
	if err := os.WriteFile(owner, []byte(pid+"\n"), 0o644); err != nil {
		fail("%v", err)
	}
	if err := os.Chtimes(owner, mtime, mtime); err != nil {
		fail("%v", err)
	}
}

// judgeLock is what Held, LockOwner and Acquire say about the lock at path.
func judgeLock(path, pid string) map[string]any {
	held, err := git.NewLock(path).Held()
	_, _, ownerHeld := git.LockOwner(path)
	l := git.NewLock(path)
	res, aerr := l.Acquire()
	defer l.Release()
	status := map[git.LockStatus]string{git.Acquired: "Acquired", git.RemovedStale: "RemovedStale", git.Held: "Held"}[res.Status]
	if aerr != nil {
		status = "error: " + aerr.Error()
	}
	return map[string]any{"held": held, "owner_held": ownerHeld, "status": status, "pid": same(res.PID, pid, "owner"), "error": errText(err)}
}
`;

const cases = {
  'acquire-without-ps': { lock: false, source: String.raw`package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func observe() {
	root := filepath.Join(tempDir(), "repo")
	gitInit := exec.Command("git", "init", "-q", root)
	gitInit.Env = append(cleanEnv(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	if out, err := gitInit.CombinedOutput(); err != nil {
		fail("git init: %v\n%s", err, out)
	}
	want := psBirth(os.Getpid())
	self := strconv.Itoa(os.Getpid())
	emptyPath()
	var stderr strings.Builder
	s := sys.NewWith(nil, root)
	s.Stderr = &stderr
	got := map[string]any{}
	l, err := git.AcquireBuild(root, s)
	if err != nil {
		got["acquire"] = err.Error()
		emit(got)
		return
	}
	defer l.Release()
	got["acquire"] = "ok"
	pid, token, held := git.LockOwner(git.BuildLockPath(root))
	got["lock"] = map[string]any{"pid": same(pid, self, "self"), "token": same(token, l.Token(), "lock"), "held": held}
	o, err := project.Owner(l.Token())
	ownerToken := "<nil>"
	if o.Token != nil {
		ownerToken = *o.Token
	}
	got["owner"] = map[string]any{
		"error": errText(err),
		"pid":   same(strconv.Itoa(o.PID), self, "self"),
		"token": same(ownerToken, l.Token(), "lock"),
		"birth": same(o.Birth, want, "ps"),
	}
	got["stderr"] = stderr.String()
	emit(got)
}
` },
  'ps-format': { lock: false, source: String.raw`package main

import (
	"os"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
)

func observe() {
	child := startSleep()
	recorded := psBirth(child.Process.Pid)
	self := psBirth(os.Getpid())
	emptyPath()
	got := map[string]any{}
	b, err := git.ProcessBirth(os.Getpid())
	got["self"] = verdict("self", b, err, self)
	o, err := project.Owner("")
	got["owner"] = verdict("owner", o.Birth, err, self)
	b, err = git.ProcessBirth(child.Process.Pid)
	got["running"] = verdict("running", b, err, recorded)
	stop(child)
	b, err = git.ProcessBirth(child.Process.Pid)
	got["exited"] = verdict("exited", b, err, recorded)
	emit(got)
}
` },
  'legacy': { lock: true, source: String.raw`package main

import (
	"strconv"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
)

func observe() {
	child := startSleep()
	pid := strconv.Itoa(child.Process.Pid)
	path := git.BuildLockPath(tempDir())
	// The lock was written after its owner started.
	writeLegacy(path, pid, time.Now().Add(time.Minute))
	emptyPath()
	got := map[string]any{"running": judgeLock(path, pid)}
	stop(child)
	got["exited"] = judgeLock(path, pid)
	emit(got)
}
` },
  'pid-reuse': { lock: true, source: String.raw`package main

import (
	"strconv"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
)

func observe() {
	child := startSleep()
	pid := child.Process.Pid
	recorded := psBirth(pid)
	started, err := time.ParseInLocation(psLayout, recorded, time.Local)
	if err != nil {
		fail("ps birth %q: %v", recorded, err)
	}
	// An earlier owner with the same pid started an hour before this process.
	earlier := started.Add(-time.Hour).Format(psLayout)
	path := git.BuildLockPath(tempDir())
	// A legacy lock written in 2020 cannot belong to a process started now.
	writeLegacy(path, strconv.Itoa(pid), time.Date(2020, 1, 2, 3, 4, 5, 0, time.Local))
	emptyPath()
	b, err := git.ProcessBirth(pid)
	got := map[string]any{
		"current": verdict("current", b, err, recorded),
		"earlier": verdict("earlier", b, err, earlier),
		"legacy":  judgeLock(path, strconv.Itoa(pid)),
	}
	emit(got)
}
` },
  'timeout': { lock: false, source: String.raw`package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
)

func observe() {
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		fail("sleep: %v", err)
	}
	bin := tempDir()
	// The fake ps keeps a child running past the bound, then would print a birth.
	script := "#!/bin/sh\n" + sleep + " 30\necho 'Thu Jan  1 00:00:00 2015'\n"
	if err := os.WriteFile(filepath.Join(bin, "ps"), []byte(script), 0o755); err != nil {
		fail("%v", err)
	}
	os.Setenv("PATH", bin)
	start := time.Now()
	b, err := git.ProcessBirth(99999999)
	elapsed := time.Since(start)
	within := "7s"
	if elapsed >= 7*time.Second {
		within = elapsed.String()
	}
	emit(map[string]any{"birth": b, "within": within, "error": errText(err)})
}
` },
  'both-fail': { lock: false, source: String.raw`package main

import (
	"time"

	"github.com/KogenAI/kogen-coordinator/git"
)

func observe() {
	emptyPath()
	start := time.Now()
	b, err := git.ProcessBirth(99999999)
	elapsed := time.Since(start)
	within := "7s"
	if elapsed >= 7*time.Second {
		within = elapsed.String()
	}
	emit(map[string]any{"birth": b, "within": within, "error": errText(err)})
}
` },
};

// observe builds and runs one case as a scratch program of this module (`go run`)
// and returns the result line it prints.
function observe(name, format) {
  const c = cases[name];
  assert.ok(c, 'unknown case ' + name);
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.owner-birth-'));
  const pkg = './' + path.basename(dir);
  const command = `go run ${pkg} (case ${name}, format ${format})`;
  try {
    fs.writeFileSync(path.join(dir, 'helpers.go'), helpers);
    if (c.lock) fs.writeFileSync(path.join(dir, 'lock_helpers.go'), lockHelpers);
    fs.writeFileSync(path.join(dir, 'observe.go'), c.source);
    const result = cp.spawnSync('go', ['run', pkg], {
      encoding: 'utf8', timeout: 300000,
      env: { ...process.env, OBSERVE_FORMAT: format },
    });
    const output = (result.stdout || '') + (result.stderr || '') + (result.error ? String(result.error) : '');
    assert.equal(result.status, 0, `${command} exited ${result.status}:\n${output}`);
    const rows = (result.stdout || '').split('\n').filter(s => s.startsWith('BIRTH_RESULT='));
    assert.equal(rows.length, 1, `${command} must print exactly one BIRTH_RESULT line:\n${output}`);
    return JSON.parse(rows[0].slice('BIRTH_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

Then('coord-owner-birth-without-ps: case {string} reports:', { timeout: 360000 }, function (name, expected) {
  judgeReport(name, observe(name, 'file'), JSON.parse(expected));
});

Then('coord-owner-birth-without-ps: case {string} with a {string} legacy lock reports:', { timeout: 360000 }, function (name, format, expected) {
  judgeReport(name, observe(name, format), JSON.parse(expected));
});

Then('coord-owner-birth-without-ps: case {string} returns no birth within {string} and a one-line error naming:', { timeout: 360000 }, function (name, within, table) {
  judgeFailure(name, observe(name, 'file'), within, table.raw().map(r => r[0]));
});

Then('coord-owner-birth-without-ps: the git and project packages vet for {string}', { timeout: 360000 }, function (target) {
  const [goos, goarch] = target.split('/');
  const result = cp.spawnSync('go', ['vet', './git', './project'], {
    encoding: 'utf8', timeout: 300000, env: { ...process.env, GOOS: goos, GOARCH: goarch },
  });
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? String(result.error) : '');
  assert.equal(result.status, 0, `GOOS=${goos} GOARCH=${goarch} go vet ./git ./project exited ${result.status}:\n${output}`);
});
