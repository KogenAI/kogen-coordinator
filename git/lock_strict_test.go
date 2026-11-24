package git

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestAcquireBuildStrict(t *testing.T) {
	root := t.TempDir()
	l, err := AcquireBuildStrict(root)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Release()
	p, token, held := LockOwner(BuildLockPath(root))
	if p != strconv.Itoa(os.Getpid()) || token == "" || token != l.Token() || !held {
		t.Fatalf("custody: %q %q %v", p, token, held)
	}
	done := make(chan error, 2)
	go func() {
		l, err := AcquireBuild(root, sys.NewWith(nil, root))
		if l != nil {
			l.Release()
			done <- errors.New("normal contender acquired")
			return
		}
		if err == nil {
			done <- errors.New("normal contender not refused")
			return
		}
		done <- nil
	}()
	go func() {
		l, err := AcquireBuildStrict(root)
		if l != nil || !errors.Is(err, ErrBuildLockExists) {
			done <- errors.New("strict contender not refused")
			return
		}
		done <- nil
	}()
	for i := 0; i < 2; i++ {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("contender blocked")
		}
	}

	l.Release()
	if l.Token() != "" {
		t.Fatal("token retained")
	}
	if _, err := os.Lstat(BuildLockPath(root)); !os.IsNotExist(err) {
		t.Fatalf("lock remains: %v", err)
	}
}

func TestAcquireBuildStrictOccupied(t *testing.T) {
	for _, kind := range []string{"file", "directory", "symlink", "held"} {
		t.Run(kind, func(t *testing.T) {
			root := t.TempDir()
			path := BuildLockPath(root)
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				t.Fatal(err)
			}
			var owner *Lock
			switch kind {
			case "file":
				if err := os.WriteFile(path, []byte("data"), 0644); err != nil {
					t.Fatal(err)
				}
			case "directory":
				if err := os.Mkdir(path, 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(path, "owner"), []byte("data"), 0644); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				if err := os.Symlink("missing", path); err != nil {
					t.Fatal(err)
				}
			case "held":
				var err error
				owner, err = AcquireBuildStrict(root)
				if err != nil {
					t.Fatal(err)
				}
				defer owner.Release()
			}
			before, err := os.Lstat(path)
			if err != nil {
				t.Fatal(err)
			}
			target := path
			if kind == "directory" {
				target = filepath.Join(path, "owner")
			}
			data, _ := os.ReadFile(target)
			p, token, held := LockOwner(path)
			l, err := AcquireBuildStrict(root)
			if l != nil || !errors.Is(err, ErrBuildLockExists) {
				t.Fatalf("got %v %v", l, err)
			}
			after, err := os.Lstat(path)
			if err != nil || !os.SameFile(before, after) {
				t.Fatal("entry changed")
			}
			got, _ := os.ReadFile(target)
			if string(got) != string(data) {
				t.Fatal("contents changed")
			}
			p2, token2, held2 := LockOwner(path)
			if p != p2 || token != token2 || held != held2 {
				t.Fatal("owner changed")
			}
		})
	}
}

func TestAcquireBuildStrictAfterAbsence(t *testing.T) {
	root := t.TempDir()
	path := BuildLockPath(root)
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("arrived"), 0644); err != nil {
		t.Fatal(err)
	}
	if l, err := AcquireBuildStrict(root); l != nil || !errors.Is(err, ErrBuildLockExists) {
		t.Fatalf("%v %v", l, err)
	}
	b, err := os.ReadFile(path)
	if err != nil || string(b) != "arrived" {
		t.Fatal("artifact changed")
	}
}

func TestAcquireBuildStrictRelease(t *testing.T) {
	root := t.TempDir()
	path := BuildLockPath(root)
	l, err := AcquireBuildStrict(root)
	if err != nil {
		t.Fatal(err)
	}
	moved := path + ".old"
	if err := os.Rename(path, moved); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(moved, path); err != nil {
		t.Fatal(err)
	}
	l.Release()
	if st, err := os.Lstat(path); err != nil || st.Mode()&os.ModeSymlink == 0 {
		t.Fatal("replacement removed")
	}
	if l.Token() != "" {
		t.Fatal("token retained")
	}
}

func TestAcquireBuildStrictError(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".kogen"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	l, err := AcquireBuildStrict(root)
	if l != nil || err == nil || errors.Is(err, ErrBuildLockExists) {
		t.Fatalf("%v %v", l, err)
	}
}
