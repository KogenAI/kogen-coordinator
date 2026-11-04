package project

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/KogenAI/kogen-coordinator/durable"
)

func approvalFolder(t *testing.T, root string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Dir(ApprovalPath(root, "atomic-demo")))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

type flushRecord struct {
	name, temp, target string
	targetExists       bool
}

// observeFlushes records every durable.Sync call with the flushed file and the approval path's
// state at that moment; act, when set, runs on the flushed file.
func observeFlushes(t *testing.T, target string, act func(*os.File)) *[]flushRecord {
	t.Helper()
	var got []flushRecord
	durable.ObserveSyncInTests(func(f *os.File) {
		r := flushRecord{name: f.Name()}
		if b, err := os.ReadFile(f.Name()); err == nil {
			r.temp = string(b)
		}
		if b, err := os.ReadFile(target); err == nil {
			r.target, r.targetExists = string(b), true
		}
		got = append(got, r)
		if act != nil {
			act(f)
		}
	})
	t.Cleanup(func() { durable.ObserveSyncInTests(nil) })
	return &got
}

var (
	atomicA = Approval{Slug: "atomic-demo", SHA256: "h1", Approver: "Ada", ApprovedAt: "2026-11-04T00:00:00Z"}
	atomicB = Approval{Slug: "atomic-demo", SHA256: "h2", Base: "abc123", Approver: "Ada", ApprovedAt: "2026-11-04T01:00:00Z"}
)

func TestWriteApprovalFreshFlushesTempOnceBeforeRename(t *testing.T) {
	root := t.TempDir()
	path := ApprovalPath(root, "atomic-demo")
	want, _ := EncodeApproval(atomicA)
	got := observeFlushes(t, path, nil)
	if err := WriteApproval(root, atomicA); err != nil {
		t.Fatal(err)
	}
	if len(*got) != 1 {
		t.Fatalf("flushes %d", len(*got))
	}
	r := (*got)[0]
	if filepath.Dir(r.name) != filepath.Dir(path) || r.name == path || r.temp != string(want) || r.targetExists {
		t.Errorf("flush %+v", r)
	}
	if b, err := os.ReadFile(path); err != nil || string(b) != string(want) {
		t.Errorf("file %q %v", b, err)
	}
	if fi, err := os.Stat(path); err != nil || fi.Mode().Perm()&^0o022 != 0o644&^0o022 {
		t.Errorf("mode %v %v", fi, err)
	}
	if f := approvalFolder(t, root); !slices.Equal(f, []string{"atomic-demo.json"}) {
		t.Errorf("folder %v", f)
	}
}

func TestWriteApprovalOverwriteKeepsOldAtFlush(t *testing.T) {
	root := t.TempDir()
	path := ApprovalPath(root, "atomic-demo")
	if err := WriteApproval(root, atomicA); err != nil {
		t.Fatal(err)
	}
	oldB, _ := EncodeApproval(atomicA)
	newB, _ := EncodeApproval(atomicB)
	got := observeFlushes(t, path, nil)
	if err := WriteApproval(root, atomicB); err != nil {
		t.Fatal(err)
	}
	if len(*got) != 1 || (*got)[0].target != string(oldB) || (*got)[0].temp != string(newB) {
		t.Errorf("flushes %+v", *got)
	}
	if b, _ := os.ReadFile(path); string(b) != string(newB) {
		t.Errorf("file %q", b)
	}
	if f := approvalFolder(t, root); !slices.Equal(f, []string{"atomic-demo.json"}) {
		t.Errorf("folder %v", f)
	}
}

func TestWriteApprovalRenameFailureLeavesNoTemp(t *testing.T) {
	root := t.TempDir()
	path := ApprovalPath(root, "atomic-demo")
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "keep"), []byte("keep\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteApproval(root, atomicA); err == nil {
		t.Error("no error")
	}
	if f := approvalFolder(t, root); !slices.Equal(f, []string{"atomic-demo.json"}) {
		t.Errorf("folder %v", f)
	}
	if b, _ := os.ReadFile(filepath.Join(path, "keep")); string(b) != "keep\n" {
		t.Errorf("keep %q", b)
	}
}

func TestWriteApprovalFlushFailureKeepsOldApproval(t *testing.T) {
	root := t.TempDir()
	path := ApprovalPath(root, "atomic-demo")
	if err := WriteApproval(root, atomicA); err != nil {
		t.Fatal(err)
	}
	oldB, _ := EncodeApproval(atomicA)
	got := observeFlushes(t, path, func(f *os.File) { f.Close() })
	if err := WriteApproval(root, atomicB); err == nil {
		t.Error("no error")
	}
	if len(*got) != 1 {
		t.Errorf("flushes %d", len(*got))
	}
	if b, _ := os.ReadFile(path); string(b) != string(oldB) {
		t.Errorf("file %q", b)
	}
	if f := approvalFolder(t, root); !slices.Equal(f, []string{"atomic-demo.json"}) {
		t.Errorf("folder %v", f)
	}
}
