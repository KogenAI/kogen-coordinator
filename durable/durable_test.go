package durable

import (
	"os"
	"path/filepath"
	"testing"
)

func TestObserveSyncInTestsCallsFnWithTheFileOnEverySync(t *testing.T) {
	t.Cleanup(func() { ObserveSyncInTests(nil) })
	f, err := os.Create(filepath.Join(t.TempDir(), "synced"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var seen []*os.File
	ObserveSyncInTests(func(g *os.File) { seen = append(seen, g) })
	if err := Sync(f); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 1 || seen[0] != f {
		t.Fatalf("observed %v, want the file once", seen)
	}

	// A later call replaces fn.
	var other int
	ObserveSyncInTests(func(*os.File) { other++ })
	Sync(f)
	if len(seen) != 1 || other != 1 {
		t.Fatalf("replaced observer: old saw %d, new saw %d", len(seen), other)
	}

	// fn is called also when syncing is skipped, and its error is not the flush's.
	skip.Store(true)
	t.Cleanup(func() { skip.Store(false) })
	g, err := os.Create(filepath.Join(t.TempDir(), "closed"))
	if err != nil {
		t.Fatal(err)
	}
	g.Close()
	if err := Sync(g); err != nil || other != 2 {
		t.Fatalf("skipped Sync = %v after %d observations, want nil after 2", err, other)
	}

	ObserveSyncInTests(nil)
	Sync(f)
	if other != 2 {
		t.Fatalf("a removed observer was called")
	}
}
