// Steps of the Intent coord-build-lock-holder-judgment. Each scenario generates one Go test file
// (package git, deleted afterwards) that holds or contends for a lock, or runs the ps fallback, and
// prints one line HJ_OBS=<JSON> of raw observations. The judges below compare them with the
// expectations written in the feature file.
//
// Observer controls: `node features/steps/coord-build-lock-holder-judgment__judgment.js good|bad`
// judges recorded observations (good: a correct implementation; bad: a wrong one).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LOCK_GO = `package git

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestHolderJudgmentLockProbe(t *testing.T) {
	root := t.TempDir()
	path := BuildLockPath(root)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(os.Getenv("HJ_CONTENT")), 0o644); err != nil {
		t.Fatal(err)
	}
	holder, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer holder.Close()
	if err := syscall.Flock(int(holder.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	obs := map[string]any{}
	s := sys.NewWith(nil, root)
	s.Stderr = &bytes.Buffer{}
	l, err := AcquireBuild(root, s)
	if err == nil {
		l.Release()
		obs["build_error"] = ""
	} else {
		obs["build_error"] = err.Error()
		if e, ok := sys.AsError(err); ok {
			obs["build_exit"] = e.Exit
		}
	}
	res, aerr := NewLock(path).Acquire()
	obs["acquire_status"] = map[LockStatus]string{Acquired: "Acquired", RemovedStale: "RemovedStale", Held: "Held"}[res.Status]
	obs["acquire_pid"] = res.PID
	obs["acquire_error"] = fmt.Sprint(aerr)
	pid, token, held := LockOwner(path)
	obs["owner_pid"], obs["owner_token"], obs["owner_held"] = pid, token, held
	after, _ := os.ReadFile(path)
	obs["content_after"] = string(after)
	b, _ := json.Marshal(obs)
	fmt.Println("HJ_OBS=" + string(b))
}
`;

const PS_GO = `package git

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"
)

func TestHolderJudgmentPSProbe(t *testing.T) {
	ms, _ := strconv.Atoi(os.Getenv("HJ_MS"))
	ms2, _ := strconv.Atoi(os.Getenv("HJ_MS2"))
	obs := map[string]any{}
	switch os.Getenv("HJ_KIND") {
	case "birth":
		fakeSleepingPS(t)
		defer overridePSBound(time.Duration(ms) * time.Millisecond)()
		begin := time.Now()
		birth, err := ProcessBirth(99999999)
		obs["took_ms"] = time.Since(begin).Milliseconds()
		obs["birth"] = birth
		obs["error"] = fmt.Sprint(err)
	case "held":
		fakeSleepingPS(t)
		defer overridePSBound(time.Duration(ms) * time.Millisecond)()
		l := NewLock(writeLegacyLock(t, false, 424242, time.Now()))
		l.alive = func(int) bool { return true }
		begin := time.Now()
		held, err := l.Held()
		obs["took_ms"] = time.Since(begin).Milliseconds()
		obs["held"] = held
		obs["error"] = fmt.Sprint(err)
	case "restore":
		outer := overridePSBound(time.Duration(ms) * time.Millisecond)
		inner := overridePSBound(time.Duration(ms2) * time.Millisecond)
		obs["both"] = psTimeout().String()
		inner()
		obs["after_inner"] = psTimeout().String()
		outer()
		obs["after_outer"] = psTimeout().String()
	}
	b, _ := json.Marshal(obs)
	fmt.Println("HJ_OBS=" + string(b))
}
`;

const FILES = { lock: ['zz_hj_lock_test.go', LOCK_GO, 'TestHolderJudgmentLockProbe'], ps: ['zz_hj_ps_test.go', PS_GO, 'TestHolderJudgmentPSProbe'] };

function runProbe(group, env) {
  const [name, source, test] = FILES[group];
  const file = path.join(process.cwd(), 'git', name);
  fs.writeFileSync(file, source);
  try {
    const r = spawnSync('go', ['test', './git', '-run', '^' + test + '$', '-count=1', '-v'], {
      cwd: process.cwd(), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 110000,
    });
    const output = (r.stdout || '') + (r.stderr || '');
    const m = output.match(/^HJ_OBS=(.*)$/m);
    return { output, code: r.status, obs: m ? JSON.parse(m[1]) : null };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const unescape = (s) => s.replace(/\\n/g, '\n');

const judges = {
  build(obs, exp) {
    assert.equal(obs.build_error, exp.message);
    assert.equal(obs.build_exit, exp.exit);
  },
  acquire(obs, exp) {
    assert.equal(obs.acquire_status, 'Held');
    assert.equal(obs.acquire_pid, exp.pid);
    assert.equal(obs.content_after, exp.content);
  },
  owner(obs, exp) {
    assert.equal(obs.owner_pid, exp.pid);
    assert.equal(obs.owner_token, exp.token);
    assert.equal(obs.owner_held, exp.held);
  },
  birth(obs, exp) {
    assert.equal(obs.birth, '');
    assert.ok(obs.error.endsWith(exp.suffix), `error ${obs.error} does not end with ${exp.suffix}`);
    assert.ok(obs.took_ms < exp.seconds * 1000, `took ${obs.took_ms} ms`);
  },
  held(obs, exp) {
    assert.equal(obs.held, false);
    assert.equal(obs.error, '<nil>');
    assert.ok(obs.took_ms < exp.seconds * 1000, `took ${obs.took_ms} ms`);
  },
  restore(obs, exp) {
    assert.equal(obs.after_inner, exp.inner);
    assert.equal(obs.after_outer, exp.outer);
  },
};

const MSG = 'environment/build_running: a Build is running in this repository (pid ';
const lockObs = (o) => ({ build_error: MSG + 'not recorded)', build_exit: 3, acquire_status: 'Held', acquire_pid: '', owner_pid: '', owner_token: '', owner_held: true, content_after: '', ...o });
const KNOWN = [
  ['empty-build', 'build', { message: MSG + 'not recorded)', exit: 3 }, lockObs({}), lockObs({ build_error: MSG + ')' })],
  ['empty-acquire', 'acquire', { pid: '', content: '' }, lockObs({}), lockObs({ content_after: 'x' })],
  ['text-build', 'build', { message: MSG + 'not recorded)', exit: 3 }, lockObs({ content_after: 'not-a-pid' }), lockObs({ build_error: MSG + 'not-a-pid)' })],
  ['recorded-build', 'build', { message: MSG + '4242)', exit: 3 }, lockObs({ build_error: MSG + '4242)', acquire_pid: '4242' }), lockObs({})],
  ['recorded-acquire', 'acquire', { pid: '4242', content: 'kogen-build-lock 1\npid 4242\ntoken abc\n' }, lockObs({ acquire_pid: '4242', content_after: 'kogen-build-lock 1\npid 4242\ntoken abc\n' }), lockObs({ content_after: 'kogen-build-lock 1\npid 4242\ntoken abc\n' })],
  ['owner', 'owner', { pid: '', token: '', held: true }, lockObs({}), lockObs({ owner_pid: 'not-a-pid' })],
  ['birth', 'birth', { suffix: '; ps -p 99999999 timed out after 200ms', seconds: 2.2 }, { birth: '', error: 'x; ps -p 99999999 timed out after 200ms', took_ms: 230 }, { birth: '', error: 'x; ps -p 99999999 timed out after 5s', took_ms: 5010 }],
  ['held', 'held', { seconds: 2.2 }, { held: false, error: '<nil>', took_ms: 230 }, { held: false, error: '<nil>', took_ms: 5010 }],
  ['restore', 'restore', { inner: '200ms', outer: '5s' }, { after_inner: '200ms', after_outer: '5s' }, { after_inner: '5s', after_outer: '5s' }],
];

function control(kind) {
  let all = true;
  for (const [name, judge, exp, good, bad] of KNOWN) {
    let accepted;
    try { judges[judge](kind === 'good' ? good : bad, exp); accepted = true; } catch (_) { accepted = false; }
    console.log((accepted ? 'accepted ' : 'rejected ') + name);
    if (accepted !== (kind === 'good')) all = false;
  }
  process.exit(kind === 'good' ? (all ? 0 : 1) : (all ? 1 : 0));
}

if (require.main === module) {
  control(process.argv[2]);
} else {
  const { Given, When, Then } = require('@cucumber/cucumber');
  const P = 'coord-build-lock-holder-judgment: ';
  const need = (w) => { assert.ok(w.hj && w.hj.obs, `no observation; go test exit ${w.hj && w.hj.code}: ${w.hj && w.hj.output.slice(-1500)}`); return w.hj.obs; };

  Given(P + 'the Build lock file holds {string} and another open file description holds its flock', function (content) {
    this.hj = { content: unescape(content) };
  });
  When(P + 'AcquireBuild, Acquire and LockOwner contend for the lock', function () {
    Object.assign(this.hj, runProbe('lock', { HJ_CONTENT: this.hj.content }));
  });
  Then(P + 'AcquireBuild is refused with {string} and exit {int}', function (message, exit) {
    judges.build(need(this), { message, exit });
  });
  Then(P + 'Acquire reports Held with pid {string} and the file still holds {string}', function (pid, content) {
    judges.acquire(need(this), { pid, content: unescape(content) });
  });
  Then(P + 'LockOwner returns pid {string}, token {string} and held {word}', function (pid, token, held) {
    judges.owner(need(this), { pid, token, held: held === 'true' });
  });

  Given(P + 'a ps that sleeps 30 seconds is first on PATH and the ps bound is overridden to {int} milliseconds', function (ms) {
    this.hj = { ms };
  });
  When(P + 'ProcessBirth is asked for pid 99999999', function () {
    Object.assign(this.hj, runProbe('ps', { HJ_KIND: 'birth', HJ_MS: String(this.hj.ms) }));
  });
  When(P + 'Held judges a legacy lock of pid 424242 whose process counts as alive', function () {
    Object.assign(this.hj, runProbe('ps', { HJ_KIND: 'held', HJ_MS: String(this.hj.ms) }));
  });
  Then(P + 'it returns an empty birth and an error ending with {string} in less than {float} seconds', function (suffix, seconds) {
    judges.birth(need(this), { suffix, seconds });
  });
  Then(P + 'it returns false with no error in less than {float} seconds', function (seconds) {
    judges.held(need(this), { seconds });
  });

  When(P + 'the ps bound is overridden to {int} milliseconds and then to {int} milliseconds', function (ms, ms2) {
    this.hj = runProbe('ps', { HJ_KIND: 'restore', HJ_MS: String(ms), HJ_MS2: String(ms2) });
  });
  Then(P + 'after the inner restore the ps timeout is {string} and after the outer restore it is {string}', function (inner, outer) {
    judges.restore(need(this), { inner, outer });
  });
}
