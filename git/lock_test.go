package git

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"kogen-loop/sys"
)

// The helper process takes the lock, reports ready, and waits to be killed.
func init() {
	if p := os.Getenv("KOGEN_LOCK_HELPER"); p != "" {
		l := NewLock(p)
		if res, err := l.Acquire(); err != nil || res.Status == Held {
			os.Exit(3)
		}
		os.WriteFile(p+".ready", []byte("ok"), 0o644)
		time.Sleep(time.Minute)
		os.Exit(0)
	}
}

func lockPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), ".kogen", "local", "build.lock")
}

func startHolder(t *testing.T, path string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), "KOGEN_LOCK_HELPER="+path)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		if _, err := os.Stat(path + ".ready"); err == nil {
			return cmd
		}
		time.Sleep(25 * time.Millisecond)
	}
	cmd.Process.Kill()
	t.Fatal("the helper did not take the lock")
	return nil
}

func TestAcquireCreatesTheLocalFolderAndTakesAFreeLock(t *testing.T) {
	path := lockPath(t)
	l := NewLock(path)
	res, err := l.Acquire()
	if err != nil || res.Status != Acquired {
		t.Fatalf("Acquire = %+v, %v", res, err)
	}
	b, _ := os.ReadFile(path)
	want := "kogen-build-lock 1\npid " + strconv.Itoa(os.Getpid()) + "\ntoken " + l.Token() + "\n"
	if string(b) != want || len(l.Token()) != 24 {
		t.Fatalf("lock content %q, want %q", b, want)
	}
	l.Release()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("Release left the lock file")
	}
	l.Release() // repeated release does nothing
}

func TestAcquireRefusesALiveLockAndHeldObservesIt(t *testing.T) {
	path := lockPath(t)
	first := NewLock(path)
	if res, _ := first.Acquire(); res.Status != Acquired {
		t.Fatal(res)
	}
	defer first.Release()
	second := NewLock(path)
	res, err := second.Acquire()
	if err != nil || res.Status != Held || res.PID != strconv.Itoa(os.Getpid()) {
		t.Fatalf("second Acquire = %+v, %v", res, err)
	}
	second.Release() // must not remove the first owner's lock
	if held, _ := NewLock(path).Held(); !held {
		t.Fatal("Held = false for a held lock")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("the losing contender removed the owner's lock")
	}
}

// AUT-4: the kernel drops the lock of a killed owner, so the next Build takes it without
// a stale-lock path or notice.
func TestAKilledOwnersLockIsTakenWithoutANotice(t *testing.T) {
	path := lockPath(t)
	os.MkdirAll(filepath.Dir(path), 0o755)
	cmd := startHolder(t, path)
	if held, _ := NewLock(path).Held(); !held {
		cmd.Process.Kill()
		t.Fatal("the helper's lock is not held")
	}
	res, _ := NewLock(path).Acquire()
	if res.Status != Held || res.PID != strconv.Itoa(cmd.Process.Pid) {
		cmd.Process.Kill()
		t.Fatalf("while the helper runs: %+v", res)
	}
	cmd.Process.Signal(syscall.SIGKILL)
	cmd.Wait()
	var out bytes.Buffer
	s := sys.NewWith(nil, t.TempDir())
	s.Stderr = &out
	l, err := AcquireBuild(filepath.Dir(filepath.Dir(filepath.Dir(path))), s)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Release()
	if out.Len() != 0 {
		t.Fatalf("notice after a killed owner: %q", out.String())
	}
}

func TestLocksLeftByAnEarlierKogen(t *testing.T) {
	alive := strconv.Itoa(os.Getppid())
	for _, c := range []struct {
		name, pid string
		dir       bool
		status    LockStatus
	}{
		{"pid file of a dead process", "987654321", false, RemovedStale},
		{"pid file of a running process", alive, false, Held},
		{"directory of a dead process", "987654321", true, RemovedStale},
		{"directory of a running process", alive, true, Held},
	} {
		t.Run(c.name, func(t *testing.T) {
			path := lockPath(t)
			os.MkdirAll(filepath.Dir(path), 0o755)
			if c.dir {
				os.Mkdir(path, 0o755)
				os.WriteFile(filepath.Join(path, "0123abcd"), []byte(c.pid+"\n"), 0o644)
			} else {
				os.WriteFile(path, []byte(c.pid+"\n"), 0o644)
			}
			if held, _ := NewLock(path).Held(); held != (c.status == Held) {
				t.Fatalf("Held = %v", held)
			}
			l := NewLock(path)
			res, err := l.Acquire()
			defer l.Release()
			if err != nil || res.Status != c.status || res.PID != c.pid {
				t.Fatalf("Acquire = %+v, %v", res, err)
			}
		})
	}
}

func TestAcquireBuildMessages(t *testing.T) {
	root := t.TempDir()
	path := BuildLockPath(root)
	os.MkdirAll(filepath.Dir(path), 0o755)
	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	os.WriteFile(path, []byte(strconv.Itoa(cmd.Process.Pid)+"\n"), 0o644)
	old := time.Unix(1, 0)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	s := sys.NewWith(nil, root)
	s.Stderr = &out
	l, err := AcquireBuild(root, s)
	if err != nil || out.String() != "kogen: removed the lock of a Build that is no longer running\n" {
		t.Fatalf("stale: %v %q", err, out.String())
	}
	_, err = AcquireBuild(root, s)
	e, ok := sys.AsError(err)
	if !ok || e.Error() != "environment/build_running: a Build is running in this repository (pid "+strconv.Itoa(os.Getpid())+")" || e.Exit != 3 {
		t.Fatalf("held: %v", err)
	}
	l.Release()
}

func TestLockOwnerDiagnostics(t *testing.T) {
	path := lockPath(t)
	if pid, token, held := LockOwner(path); pid != "" || token != "" || held {
		t.Fatal("owner of a missing lock")
	}
	l := NewLock(path)
	l.Acquire()
	pid, token, held := LockOwner(path)
	if pid != strconv.Itoa(os.Getpid()) || token != l.Token() || !held {
		t.Fatalf("LockOwner = %q %q %v", pid, token, held)
	}
	l.Release()
}

func TestLockAcquireContendersNeverBothWin(t *testing.T) {
	path := lockPath(t)
	for round := 0; round < 20; round++ {
		var wins atomic.Int32
		var wg sync.WaitGroup
		var locks []*Lock
		var mu sync.Mutex
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				l := NewLock(path)
				if res, err := l.Acquire(); err == nil && res.Status != Held {
					wins.Add(1)
					mu.Lock()
					locks = append(locks, l)
					mu.Unlock()
				}
			}()
		}
		wg.Wait()
		if wins.Load() != 1 {
			t.Fatalf("round %d: %d winners", round, wins.Load())
		}
		for _, l := range locks {
			l.Release()
		}
	}
}

func TestProcessAliveIsKillZero(t *testing.T) {
	if !processAlive(os.Getpid()) || processAlive(987654321) {
		t.Fatal("processAlive")
	}
	if strings.TrimSpace("x") == "" {
		t.Fatal()
	}
}

func TestLegacyOwnershipMetadata(t *testing.T) {
	stamp := time.Date(2020, 1, 2, 3, 4, 5, 0, time.Local)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name, comm, pid string
		uid             int
		start           time.Time
		alive, held     bool
	}{
		{"after", "unrelated", "424242", os.Geteuid(), stamp.Add(time.Second), true, false},
		{"same-name", filepath.Base(exe), "424242", os.Geteuid(), stamp.Add(time.Second), true, true},
		{"before", "unrelated", "424242", os.Geteuid(), stamp.Add(-time.Second), true, true},
		{"equal", "unrelated", "424242", os.Geteuid(), stamp, true, true},
		{"foreign", "unrelated", "424242", os.Geteuid() + 1, stamp.Add(-time.Second), true, false},
		{"dead", "unrelated", "424242", os.Geteuid(), stamp, false, false},
		{"empty", "unrelated", "", os.Geteuid(), stamp, true, false},
		{"text", "unrelated", "not-a-pid", os.Geteuid(), stamp, true, false},
		{"zero", "unrelated", "0", os.Geteuid(), stamp, true, false},
	} {
		for _, dir := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/dir=%v", c.name, dir), func(t *testing.T) {
				path := lockPath(t)
				if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
					t.Fatal(err)
				}
				owner := path
				if dir {
					if err := os.Mkdir(path, 0755); err != nil {
						t.Fatal(err)
					}
					owner = filepath.Join(path, "owner")
				}
				if err := os.WriteFile(owner, []byte(c.pid), 0644); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(owner, stamp, stamp); err != nil {
					t.Fatal(err)
				}
				bin := t.TempDir()
				script := fmt.Sprintf("#!/bin/sh\nprintf '%%s\\n' '%d %s %s'\n", c.uid, c.comm, c.start.Format("Mon Jan _2 15:04:05 2006"))
				if err := os.WriteFile(filepath.Join(bin, "ps"), []byte(script), 0755); err != nil {
					t.Fatal(err)
				}
				t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
				l := NewLock(path)
				l.alive = func(int) bool { return c.alive }
				held, err := l.Held()
				if err != nil || held != c.held {
					t.Fatalf("Held = %v, %v", held, err)
				}
				res, err := l.Acquire()
				defer l.Release()
				want := RemovedStale
				if c.held {
					want = Held
				}
				if err != nil || res.Status != want || res.PID != c.pid {
					t.Fatalf("Acquire = %+v, %v", res, err)
				}
			})
		}
	}
}

func TestLegacyOwnerDiagnosticsAndOwnerMtime(t *testing.T) {
	for _, dir := range []bool{false, true} {
		t.Run(fmt.Sprint(dir), func(t *testing.T) {
			path := lockPath(t)
			os.MkdirAll(filepath.Dir(path), 0755)
			owner := path
			if dir {
				os.Mkdir(path, 0755)
				owner = filepath.Join(path, "owner")
			}
			pid := strconv.Itoa(os.Getpid())
			os.WriteFile(owner, []byte(pid), 0644)
			if dir {
				old := time.Unix(1, 0)
				os.Chtimes(path, old, old)
			}
			p, token, held := LockOwner(path)
			if p != pid || token != "" || !held {
				t.Fatalf("LockOwner = %q %q %v", p, token, held)
			}
			l := NewLock(path)
			res, err := l.Acquire()
			if err != nil || res.Status != Held || res.PID != pid {
				t.Fatalf("Acquire = %+v, %v", res, err)
			}
		})
	}
}

func TestLockSourceOnlySignalsZero(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "lock.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if sel.Sel.Name == "Signal" {
			t.Error("Signal call in lock.go")
		}
		if sel.Sel.Name == "Kill" {
			if len(call.Args) != 2 {
				t.Error("Kill without signal zero")
			} else if lit, ok := call.Args[1].(*ast.BasicLit); !ok || lit.Kind != token.INT || lit.Value != "0" {
				t.Error("Kill with nonzero signal")
			}
		}
		return true
	})
}

func TestLegacyDirectoryOwnerMtimeStale(t *testing.T) {
	path := lockPath(t)
	os.MkdirAll(path, 0755)
	owner := filepath.Join(path, "owner")
	pid := strconv.Itoa(os.Getpid())
	os.WriteFile(owner, []byte(pid), 0644)
	old := time.Unix(1, 0)
	os.Chtimes(owner, old, old)
	bin := t.TempDir()
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s\n' '%d unrelated Mon Jan  2 03:04:05 2020'\n", os.Geteuid())
	os.WriteFile(filepath.Join(bin, "ps"), []byte(script), 0755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	future := time.Date(2021, 1, 1, 0, 0, 0, 0, time.Local)
	os.Chtimes(path, future, future)
	p, token, held := LockOwner(path)
	if p != pid || token != "" || held {
		t.Fatalf("LockOwner = %q %q %v", p, token, held)
	}
	if _, err := os.Stat(owner); err != nil {
		t.Fatal(err)
	}
}

func TestLegacyMissingMetadataIsStale(t *testing.T) {
	path := lockPath(t)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), 0644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", t.TempDir())
	l := NewLock(path)
	held, err := l.Held()
	if err != nil || held {
		t.Fatalf("Held = %v, %v", held, err)
	}
	res, err := l.Acquire()
	defer l.Release()
	if err != nil || res.Status != RemovedStale {
		t.Fatalf("Acquire = %+v, %v", res, err)
	}
}
