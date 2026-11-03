package kogenloop_test

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestRefusal(t *testing.T) {
	e := sys.Fail("environment", "invalid", "details", 3)
	var err error = e
	if err == nil || e.Class != "environment" || e.Reason != "invalid" || e.Detail != "details" || e.Exit != 3 {
		t.Fatalf("refusal: %#v", e)
	}
	e.Lines = append(e.Lines, "line one", "line two")
	if !reflect.DeepEqual(e.Lines, []string{"line one", "line two"}) {
		t.Fatal(e.Lines)
	}
	literal := &sys.Error{Class: "candidate", Reason: "changed", Detail: "diagnostic", Exit: 1, Lines: []string{"output"}}
	if literal.Class != "candidate" || literal.Reason != "changed" || literal.Detail != "diagnostic" || literal.Exit != 1 || !reflect.DeepEqual(literal.Lines, []string{"output"}) {
		t.Fatal(literal)
	}
}

func TestRunResults(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	s := sys.NewWith(os.Environ(), root)
	for _, tc := range []struct {
		command string
		status  int
		output  string
	}{
		{`printf '%s\n' "$PWD"; printf error >&2`, 0, dir + "\nerror"},
		{`printf output; printf problem >&2; exit 7`, 7, "outputproblem"},
	} {
		r, err := s.Run(tc.command, dir, sys.Options{KillGroupOnExit: true, Timeout: 10 * time.Second})
		if err != nil || r.Status != tc.status || r.Output != tc.output {
			t.Fatalf("Run: %+v, %v", r, err)
		}
	}
}

func TestProgress(t *testing.T) {
	s := sys.NewWith(nil, t.TempDir())
	var b bytes.Buffer
	s.Stderr = &b
	s.Progress("kogen: removed the lock of a Build that is no longer running")
	if b.String() != "kogen: removed the lock of a Build that is no longer running\n" {
		t.Fatal(b.String())
	}
}

func TestTmpPath(t *testing.T) {
	root := t.TempDir()
	t.Setenv("TMPDIR", root)
	a, b := sys.TmpPath("kogen-index"), sys.TmpPath("kogen-index")
	if a == b {
		t.Fatal("paths are identical")
	}
	for _, p := range []string{a, b} {
		if !filepath.IsAbs(p) || filepath.Dir(p) != root || !strings.HasPrefix(filepath.Base(p), "kogen-index") {
			t.Fatal(p)
		}
		if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("precreated %s: %v", p, err)
		}
		if err := os.WriteFile(p, []byte("index"), 0600); err != nil {
			t.Fatal(err)
		}
	}
}

// FIFO handshakes keep the shell fixtures synchronized without polling or sleeps.
func fifo(t *testing.T, root, name string) *os.File {
	t.Helper()
	p := filepath.Join(root, name)
	if err := syscall.Mkfifo(p, 0600); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(p, os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.Close() })
	return f
}
func await(t *testing.T, f *os.File) {
	t.Helper()
	ch := make(chan error, 1)
	go func() { var b [1]byte; _, err := f.Read(b[:]); ch <- err }()
	select {
	case err := <-ch:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("handshake timed out")
	}
}
func TestFinishOnInterrupt(t *testing.T) {
	root := t.TempDir()
	ready := fifo(t, root, "ready")
	trapped := fifo(t, root, "trapped")
	release := fifo(t, root, "release")
	fifo(t, root, "hold")
	s := sys.NewWith(os.Environ(), root)
	if s.Err() != nil {
		t.Fatal(s.Err())
	}
	done := make(chan error, 1)
	go func() {
		_, err := s.Run(`trap 'printf x > trapped; read x < release; exit 0' TERM; printf x > ready; cat < hold & wait`, root, sys.Options{FinishOnInterrupt: true})
		done <- err
	}()
	t.Cleanup(func() {
		release.Write([]byte("x\n"))
		s.Interrupt("SIGTERM")
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Error("command did not stop")
		}
	})
	await(t, ready)
	s.Interrupt("SIGTERM")
	await(t, trapped)
	var interrupted *sys.Interrupted
	if !errors.As(s.Err(), &interrupted) {
		t.Fatalf("Err = %v", s.Err())
	}
	select {
	case err := <-done:
		t.Fatalf("returned before command finished: %v", err)
	default:
	}
	if _, err := release.Write([]byte("x\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.As(err, &interrupted) {
			t.Fatalf("Run error: %v", err)
		}
		done <- err
	case <-time.After(10 * time.Second):
		t.Fatal("Run did not finish")
	}
}
func TestKillGroupOnExit(t *testing.T) {
	root := t.TempDir()
	fifo(t, root, "ready")
	killed := fifo(t, root, "killed")
	fifo(t, root, "hold")
	s := sys.NewWith(os.Environ(), root)
	done := make(chan error, 1)
	go func() {
		r, err := s.Run(`(trap 'printf x > killed; exit 0' TERM; printf 'x\n' > ready; cat < hold & wait) & read x < ready; exit 0`, root, sys.Options{KillGroupOnExit: true, Timeout: 10 * time.Second})
		if err == nil && r.Status != 0 {
			err = errors.New("unexpected status")
		}
		done <- err
	}()
	t.Cleanup(func() {
		s.Interrupt("SIGTERM")
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Error("command did not stop")
		}
	})
	await(t, killed)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
		done <- err
	case <-time.After(10 * time.Second):
		t.Fatal("group cleanup did not finish")
	}
}
