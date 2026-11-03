package durable

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestRunStoreTransitions(t *testing.T) {
	root := filepath.Join(t.TempDir(), "records")
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if ids, err := s.List(); err != nil || len(ids) != 0 || ids == nil {
		t.Fatalf("empty list: %v %v", ids, err)
	}
	if _, err := s.Read("missing"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing: %v", err)
	}
	if err := s.Finish("b", "first", "reason", nil); err != nil {
		t.Fatal(err)
	}
	if err := s.Finish("b", "second", "new", []string{"pointer"}); err != nil {
		t.Fatal(err)
	}
	at := time.Date(2025, 1, 2, 3, 4, 5, 123, time.FixedZone("x", 3600))
	for i := 0; i < 33; i++ {
		if err := s.Append("a", RunEvent{Stage: "stage", At: at, Attempt: "attempt"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Append("b", RunEvent{Stage: "after", At: at}); err != nil {
		t.Fatal(err)
	}
	s, err = OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	ids, err := s.List()
	if err != nil || !reflect.DeepEqual(ids, []string{"a", "b"}) {
		t.Fatalf("list: %v %v", ids, err)
	}
	a, err := s.Read("a")
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Events) != 32 || a.Omitted != 1 || !a.Events[0].At.Equal(at) || a.Events[0].At.Location() != time.UTC || a.Events[0].Attempt != "attempt" {
		t.Fatalf("a: %+v", a)
	}
	b, err := s.Read("b")
	if err != nil {
		t.Fatal(err)
	}
	if b.Outcome != "second" || b.Reason != "new" || !reflect.DeepEqual(b.Evidence, []string{"pointer"}) || len(b.Events) != 1 {
		t.Fatalf("b: %+v", b)
	}
	b.Evidence[0] = "changed"
	b.Events[0].Stage = "changed"
	b, err = s.Read("b")
	if err != nil || b.Evidence[0] != "pointer" || b.Events[0].Stage != "after" {
		t.Fatalf("alias: %+v %v", b, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "b.json"))
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	if raw["version"] != float64(1) {
		t.Fatalf("version: %s", data)
	}
}

func TestRunStoreBoundsAndErrors(t *testing.T) {
	root := t.TempDir()
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Finish("run", "", "", nil); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "run.json")
	before, _ := os.ReadFile(path)
	if !bytes.Contains(before, []byte(`"events":[]`)) || !bytes.Contains(before, []byte(`"evidence":[]`)) {
		t.Fatalf("empty arrays: %s", before)
	}
	// Find the precise largest summary that fits the complete encoded record.
	base := len(before)
	if err := s.Finish("run", "", strings.Repeat("x", maxRunBytes-base), nil); err != nil {
		t.Fatal(err)
	}
	full, _ := os.ReadFile(path)
	if len(full) != maxRunBytes {
		t.Fatalf("size %d", len(full))
	}
	if err := s.Finish("run", "", strings.Repeat("x", maxRunBytes-base+1), nil); err == nil {
		t.Fatal("oversize summary accepted")
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(full, after) {
		t.Fatal("summary changed")
	}
	if err := s.Append("run", RunEvent{Stage: "x", At: time.Now()}); err == nil {
		t.Fatal("oversize event accepted")
	}
	after, _ = os.ReadFile(path)
	if !bytes.Equal(full, after) {
		t.Fatal("event changed")
	}
	if err := s.Finish("run", "", "", nil); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if err := s.Append("run", RunEvent{Stage: strings.Repeat("z", 30000), At: time.Unix(0, 0)}); err != nil {
			t.Fatal(err)
		}
	}
	r, err := s.Read("run")
	if err != nil || len(r.Events) != 2 || r.Omitted != 1 {
		t.Fatalf("byte tail: %+v %v", r, err)
	}
	before, _ = os.ReadFile(path)
	for _, id := range []string{"", "../escape", "x.y", "é"} {
		if err := s.Append(id, RunEvent{}); err == nil {
			t.Fatalf("accepted %q", id)
		}
	}
	after, _ = os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("invalid id mutated record")
	}
	if err := os.WriteFile(path, []byte("bad json"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.Append("run", RunEvent{}); err == nil {
		t.Fatal("corruption ignored")
	}
	if err := os.RemoveAll(root); err != nil {
		t.Fatal(err)
	}
	if _, err := s.List(); err == nil {
		t.Fatal("missing root ignored")
	}
}

func TestRunStoreListFiltersEntries(t *testing.T) {
	root := t.TempDir()
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Append("valid_1", RunEvent{}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "bad.name.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "directory.json"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "valid_1.json"), filepath.Join(root, "link.json")); err != nil {
		t.Fatal(err)
	}
	ids, err := s.List()
	if err != nil || !reflect.DeepEqual(ids, []string{"valid_1"}) {
		t.Fatalf("list: %v %v", ids, err)
	}
}
