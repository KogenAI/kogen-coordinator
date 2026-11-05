package git

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

const (
	testBound = 1500 * time.Millisecond
	testSlack = 2 * time.Second
)

// hangingGit is a fake git for a Repo's PATH. In mode "hang" (or in "hang-blobs" for
// cat-file only) it echoes its environment to stderr, records its pid and the pid of a
// background sleep in $FAKE_PIDS and waits for it; otherwise it runs the real git.
const hangingGit = `#!/bin/sh
hang() {
  printf '%s %s\n' "$GIT_AUTHOR_NAME" "$DEADLINE_SECRET" >&2
  echo $$ >> "$FAKE_PIDS"
  sleep 600 &
  echo $! >> "$FAKE_PIDS"
  wait
  exit 0
}
case "$FAKE_MODE" in
hang) hang ;;
hang-blobs) if [ "$1" = cat-file ]; then hang; fi ;;
hang-rev-parse) if [ "$1" = rev-parse ]; then hang; fi ;;
fail) printf 'partial out\n'; printf 'fatal: fake failure\n' >&2; exit 1 ;;
esac
exec "$REAL_GIT" "$@"
`

// fakeGit is a fixture whose Repo finds the fake git first on PATH in the given mode.
func fakeGit(t *testing.T, mode string) (f *fixture, pids string) {
	t.Helper()
	f = newFixture(t)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(hangingGit), 0o755); err != nil {
		t.Fatal(err)
	}
	pids = filepath.Join(t.TempDir(), "pids")
	real, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	f.Env = append(append([]string(nil), f.Env...),
		"PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
		"FAKE_MODE="+mode, "FAKE_PIDS="+pids, "REAL_GIT="+real, "DEADLINE_SECRET=base-secret-7f3a")
	f.Repo = New(f.Dir, f.Env)
	return f, pids
}

func recordedPids(t *testing.T, file string) []int {
	t.Helper()
	data, _ := os.ReadFile(file)
	var pids []int
	for _, field := range strings.Fields(string(data)) {
		pid, err := strconv.Atoi(field)
		if err != nil {
			t.Fatal(err)
		}
		pids = append(pids, pid)
	}
	return pids
}

func running(pid int) bool {
	data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return false
	}
	state := data[strings.LastIndexByte(string(data), ')')+2]
	return state != 'Z'
}

// assertStopped checks that the hanging fake started its shell and its sleep and that
// neither is running.
func assertStopped(t *testing.T, file string) {
	t.Helper()
	pids := recordedPids(t, file)
	if len(pids) < 2 {
		t.Fatalf("the hanging process recorded %d pids, want its shell and its sleep", len(pids))
	}
	for _, pid := range pids {
		for i := 0; i < 20 && running(pid); i++ {
			time.Sleep(50 * time.Millisecond)
		}
		if running(pid) {
			t.Errorf("process %d is still running", pid)
			syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}

func wantTimeout(t *testing.T, err error, text string, args ...string) *TimeoutError {
	t.Helper()
	var te *TimeoutError
	if !errors.As(err, &te) {
		t.Fatalf("error = %v, want *TimeoutError", err)
	}
	equal(t, "error text", err.Error(), text)
	equal(t, "args", strings.Join(te.Args, "\x00"), strings.Join(args, "\x00"))
	equal(t, "timeout", te.Timeout, testBound)
	for _, secret := range []string{"base-secret-7f3a", "extra-secret-91c2"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("error text %q leaks %q", err, secret)
		}
	}
	return te
}

func wantWithinBound(t *testing.T, start time.Time) {
	t.Helper()
	took := time.Since(start)
	if took < testBound || took > testBound+testSlack {
		t.Fatalf("returned after %v, want between %v and %v", took, testBound, testBound+testSlack)
	}
}

func TestBoundsAreDocumentedConstants(t *testing.T) {
	equal(t, "command", CommandTimeout.String(), "10m0s")
	equal(t, "commit", CommitTimeout.String(), "1h0m0s")
}

func TestOverrideTimeoutsRestoresThePreviousValues(t *testing.T) {
	restoreOuter := OverrideTimeouts(time.Second, 2*time.Second)
	restoreInner := OverrideTimeouts(3*time.Second, 4*time.Second)
	equal(t, "inner command", commandTimeout(), 3*time.Second)
	equal(t, "inner commit", commitTimeout(), 4*time.Second)
	restoreInner()
	equal(t, "outer command", commandTimeout(), time.Second)
	equal(t, "outer commit", commitTimeout(), 2*time.Second)
	restoreOuter()
	equal(t, "command", commandTimeout(), CommandTimeout)
	equal(t, "commit", commitTimeout(), CommitTimeout)
}

func TestRunnerStopsAHangingCommandWithItsChildren(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, pids := fakeGit(t, "hang")
	start := time.Now()
	res, err := f.RunEnv([]string{"GIT_AUTHOR_NAME=extra-secret-91c2"}, "status", "--porcelain")
	wantTimeout(t, err, "git status --porcelain timed out after 1.5s", "status", "--porcelain")
	wantWithinBound(t, start)
	equal(t, "status", res.Status, -1)
	assertStopped(t, pids)
}

func TestRunnerNamesAtMostFourArgumentsWithoutTheReadOnlyPrefix(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, pids := fakeGit(t, "hang")
	start := time.Now()
	_, err := f.Observing().OK("log", "-1", "--format=%s", "--no-color", "HEAD")
	wantTimeout(t, err, "git log -1 --format=%s --no-color timed out after 1.5s", "log", "-1", "--format=%s", "--no-color")
	wantWithinBound(t, start)
	assertStopped(t, pids)
}

func TestRunnerKeepsTheOutcomeOfACommandInsideItsBound(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, _ := fakeGit(t, "fail")
	res, err := f.Run("status", "--porcelain")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "status", res.Status, 1)
	equal(t, "stdout", res.Stdout, "partial out\n")
	equal(t, "stderr", res.Stderr, "fatal: fake failure\n")
	_, err = f.OK("status", "--porcelain")
	var ce *CommandError
	if !errors.As(err, &ce) {
		t.Fatalf("error = %v, want *CommandError", err)
	}
	equal(t, "error text", err.Error(), "git status --porcelain failed (status 1): fatal: fake failure")
}

func TestRunnerReturnsTheCompleteOutputOfASlowCommand(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f := newFixture(t)
	script := "#!/bin/sh\nhead -c 524288 /dev/zero | tr '\\000' a\nsleep 0.5\nhead -c 524288 /dev/zero | tr '\\000' a\n"
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "git"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	res, err := New(f.Dir, append(append([]string(nil), f.Env...), "PATH="+dir+":"+os.Getenv("PATH"))).Run("status")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "status", res.Status, 0)
	equal(t, "stdout bytes", len(res.Stdout), 1<<20)
}

func TestMaterializeReportsABlobStreamTimeout(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, pids := fakeGit(t, "hang-blobs")
	tree := must(f.Resolve("HEAD^{tree}"))
	start := time.Now()
	_, err := f.Materialize(tree, t.TempDir())
	wantTimeout(t, err, "git cat-file --batch timed out after 1.5s", "cat-file", "--batch")
	wantWithinBound(t, start)
	assertStopped(t, pids)
}

func TestRestoreTreeStopsABlobStreamThatDoesNotEnd(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, pids := fakeGit(t, "hang-blobs")
	from := must(f.Resolve("HEAD^{tree}"))
	f.write(t, "added.txt", "added\n")
	to := must(f.Tree(f.Head(), nil))
	start := time.Now()
	restored, err := f.RestoreTree(to, from) // only a removal: no blob is read
	if err != nil {
		t.Fatal(err)
	}
	wantWithinBound(t, start)
	equal(t, "restored", len(restored), 1)
	equal(t, "change", restored[0], Restored{Path: "added.txt", Change: "added"})
	assertStopped(t, pids)
}

func TestOpenReportsADiscoveryTimeout(t *testing.T) {
	defer OverrideTimeouts(testBound, testBound)()
	f, pids := fakeGit(t, "hang-rev-parse")
	_, err := Open(f.Dir, f.Env)
	wantTimeout(t, err, "git rev-parse --show-toplevel timed out after 1.5s", "rev-parse", "--show-toplevel")
	assertStopped(t, pids)
	if _, ok := Root(f.Dir, f.Env); ok {
		t.Fatal("Root reports a repository after a timed-out discovery")
	}
}

func TestCommitUsesTheCommitBound(t *testing.T) {
	f, spec := candidate(t)
	f.hook(t, "pre-commit", "sleep 2.5\n")
	s, _ := f.session()
	defer OverrideTimeouts(testBound, 8*time.Second)()
	head, err := f.Commit(s, spec)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "head", head, f.Head())
}

func TestCommitStopsAHangingHookAtTheCommitBound(t *testing.T) {
	for _, tc := range []struct {
		name, hook string
		landed     bool
	}{{"pre-commit", "pre-commit", false}, {"post-commit", "post-commit", true}} {
		t.Run(tc.name, func(t *testing.T) {
			f, spec := candidate(t)
			pids := filepath.Join(t.TempDir(), "pids")
			f.hook(t, tc.hook, "echo $$ >> "+pids+"\nsleep 600 &\necho $! >> "+pids+"\nwait\n")
			s, _ := f.session()
			defer OverrideTimeouts(8*time.Second, testBound)()
			start := time.Now()
			_, err := f.Commit(s, spec)
			wantTimeout(t, err, "git commit -q -F "+spec.MessageFile+" timed out after 1.5s", "commit", "-q", "-F", spec.MessageFile)
			wantWithinBound(t, start)
			assertStopped(t, pids)
			equal(t, "head", f.Head(), spec.Start)
			assertNothingAt(t, spec.MessageFile)
		})
	}
}

func TestCommitPathsStopsAHangingHookAtTheCommitBound(t *testing.T) {
	f := newFixture(t)
	pids := filepath.Join(t.TempDir(), "pids")
	f.hook(t, "pre-commit", "echo $$ >> "+pids+"\nsleep 600 &\necho $! >> "+pids+"\nwait\n")
	f.write(t, "extra.txt", "extra\n")
	start := f.Head()
	s, _ := f.session()
	defer OverrideTimeouts(8*time.Second, testBound)()
	_, err := f.CommitPaths(s, "Add extra", []string{"extra.txt"}, true)
	var te *TimeoutError
	if !errors.As(err, &te) {
		t.Fatalf("error = %v, want *TimeoutError", err)
	}
	equal(t, "name", te.Args[0]+" "+te.Args[1]+" "+te.Args[2], "commit -q -F")
	equal(t, "timeout", te.Timeout, testBound)
	assertStopped(t, pids)
	equal(t, "head", f.Head(), start)
	equal(t, "staged", strings.TrimSpace(f.git(t, "diff", "--cached", "--name-only")), "")
}

func TestCheckCommitMsgStopsAHangingHookAtTheCommitBound(t *testing.T) {
	f := newFixture(t)
	pids := filepath.Join(t.TempDir(), "pids")
	f.hook(t, "commit-msg", "echo $$ >> "+pids+"\nsleep 600 &\necho $! >> "+pids+"\nwait\n")
	s, _ := f.session()
	defer OverrideTimeouts(8*time.Second, testBound)()
	start := time.Now()
	err := f.CheckCommitMsg(s, "Add the app", "add-app")
	wantTimeout(t, err, "git hook run --ignore-missing commit-msg timed out after 1.5s", "hook", "run", "--ignore-missing", "commit-msg")
	wantWithinBound(t, start)
	assertStopped(t, pids)
}
