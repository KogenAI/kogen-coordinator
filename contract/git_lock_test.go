package contract

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
	"kogen-loop/sys"
)

// lock-path, build-running and lock-diagnostics: kogen cli/facts.go and kogen-build build/facts.go
// read the owner of the Build lock; kogen-shaping shape/approve_test.go refuses to approve while
// a Build holds it.
func TestBuildLock(t *testing.T) {
	root := t.TempDir()
	path := git.BuildLockPath(root)
	equal(t, "BuildLockPath", path, filepath.Join(root, ".kogen", "local", "build.lock"))
	pid := strconv.Itoa(os.Getpid())

	if p, token, held := git.LockOwner(path); p != "" || token != "" || held {
		t.Fatalf("LockOwner without a lock = %q %q %v", p, token, held)
	}
	owner := git.NewLock(path)
	equal(t, "Path", owner.Path, path)
	equal(t, "Token before", owner.Token(), "")
	var res git.LockResult = must(owner.Acquire())
	equal(t, "Status", res.Status, git.Acquired)
	token := owner.Token()
	equal(t, "token length", len(token), 24)
	equal(t, "lock file", readFile(t, path), "kogen-build-lock 1\npid "+pid+"\ntoken "+token+"\n")
	gotPID, gotToken, held := git.LockOwner(path)
	equal(t, "LockOwner pid", gotPID, pid)
	equal(t, "LockOwner token", gotToken, token)
	equal(t, "LockOwner held", held, true)
	equal(t, "Held by another value", must(git.NewLock(path).Held()), true)

	// A second Build is refused while the first holds the lock.
	s := sys.NewWith(os.Environ(), root)
	_, err := git.AcquireBuild(root, s)
	e := wantSysError(t, err, "environment", "build_running", 3)
	equal(t, "detail", e.Detail, "a Build is running in this repository (pid "+pid+")")
	contender := git.NewLock(path)
	res = must(contender.Acquire())
	equal(t, "contender Status", res.Status, git.Held)
	equal(t, "contender PID", res.PID, pid)
	contender.Release() // does not remove the owner's lock
	if _, err := os.Stat(path); err != nil {
		t.Fatal("the losing contender removed the owner's lock")
	}

	owner.Release()
	equal(t, "Token after Release", owner.Token(), "")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("Release left the lock file")
	}
	equal(t, "Held after Release", must(git.NewLock(path).Held()), false)
	owner.Release() // repeated release does nothing

	var lock *git.Lock = must(git.AcquireBuild(root, s))
	_, acquiredToken, acquiredHeld := git.LockOwner(path)
	equal(t, "AcquireBuild token", acquiredToken, lock.Token())
	equal(t, "AcquireBuild held", acquiredHeld, true)
	lock.Release()

	// A plain pid file of a process that no longer runs is removed and taken over.
	if err := os.WriteFile(path, []byte("987654321\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	stale := git.NewLock(path)
	res = must(stale.Acquire())
	equal(t, "stale Status", res.Status, git.RemovedStale)
	equal(t, "stale PID", res.PID, "987654321")
	stale.Release()
}
