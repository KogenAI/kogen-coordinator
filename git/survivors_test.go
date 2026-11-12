package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"testing"
	"time"
)

// The zombie helper builds a process group that cannot disappear. Role "hook" runs inside
// the hook's group and starts "parent" in a group of its own; "parent" starts a child that
// joins the hook's group, exits at once and is never waited for. The unreaped child keeps
// the hook's group alive after every signal, until "parent" is killed.
func init() {
	switch os.Getenv("KOGEN_ZOMBIE_ROLE") {
	case "hook":
		self, _ := os.Executable()
		parent := exec.Command(self)
		parent.Env = append(os.Environ(), "KOGEN_ZOMBIE_ROLE=parent", "KOGEN_ZOMBIE_PGID="+strconv.Itoa(syscall.Getpgrp()))
		parent.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		if err := parent.Start(); err != nil {
			os.Exit(3)
		}
		time.Sleep(10 * time.Minute)
		os.Exit(0)
	case "parent":
		pgid, _ := strconv.Atoi(os.Getenv("KOGEN_ZOMBIE_PGID"))
		os.WriteFile(os.Getenv("KOGEN_ZOMBIE_PIDFILE"), []byte(strconv.Itoa(os.Getpid())), 0o644)
		child := exec.Command("/bin/sh", "-c", "exit 0")
		child.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pgid: pgid}
		if err := child.Start(); err != nil {
			os.Exit(3)
		}
		time.Sleep(10 * time.Minute)
		os.Exit(0)
	}
}

func TestCommitReportsAHookWhoseGroupOutlastsTheGraceAsTimedOut(t *testing.T) {
	f, spec := candidate(t)
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	pidfile := filepath.Join(t.TempDir(), "parent.pid")
	f.hook(t, "pre-commit", "KOGEN_ZOMBIE_ROLE=hook KOGEN_ZOMBIE_PIDFILE='"+pidfile+"' '"+self+"'\n")
	t.Cleanup(func() {
		if data, err := os.ReadFile(pidfile); err == nil {
			if pid, err := strconv.Atoi(string(data)); err == nil {
				syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	})
	s, _ := f.session()
	defer OverrideTimeouts(8*time.Second, testBound)()
	_, err = f.Commit(s, spec)
	wantTimeout(t, err, "git commit -q -F "+spec.MessageFile+" timed out after 1.5s", "commit", "-q", "-F", spec.MessageFile)
	equal(t, "head", f.Head(), spec.Start)
}

// A rival unlinks the lock file between Acquire's open and flock whenever it can flock the
// file itself, which proves nobody owns it. An owner's file is therefore never unlinked, and
// an Acquire that returns ownership must own the inode the path names.
func TestAcquireNeverOwnsAFileThatWasUnlinkedUnderIt(t *testing.T) {
	path := lockPath(t)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			f, err := os.OpenFile(path, os.O_RDWR, 0o644)
			if err != nil {
				continue
			}
			if syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) == nil && sameFile(f, path) {
				os.Remove(path)
			}
			f.Close()
		}
	}()
	defer func() { close(stop); wg.Wait() }()
	for round := 0; round < 20000; round++ {
		l := NewLock(path)
		res, err := l.Acquire()
		if err != nil {
			t.Fatal(err)
		}
		if res.Status == Held {
			continue
		}
		owned := sameFile(l.f, path)
		l.Release()
		if !owned {
			t.Fatalf("round %d: Acquire owns a lock file that the path no longer names", round)
		}
	}
}
