package project

import (
	"flag"
	"fmt"
	"os"
	"sync"
	"testing"
)

// update is the one switch of the golden tests: `go test ./... -update` rewrites the recorded
// outputs that no longer match the current code's output, and nothing else. Without it every
// golden test only compares. The flag exists in test files only; kogen has no such option.
var update = flag.Bool("update", false, "rewrite drifted recorded outputs of the golden files from the current output")

// goldenUpdate collects the drifted recorded outputs of one golden file for one test, and writes
// the file once when the test ends. Each flush reads the file again, so the updates of several
// tests, one after another, all survive.
type goldenUpdate struct {
	t    *testing.T
	file string
	mu   sync.Mutex
	sets []goldenSet
}

type goldenSet struct {
	path  []any
	value any
}

// updatesOf returns the updater of a golden file (a path relative to the package directory) for
// the test t.
func updatesOf(t *testing.T, file string) *goldenUpdate {
	t.Helper()
	u := &goldenUpdate{t: t, file: file}
	if *update {
		t.Cleanup(u.flush)
	}
	return u
}

// record replaces the recorded value at path (object keys and array indexes) by value when
// updating, and reports whether it did. Without -update it does nothing and reports false, so
// the caller fails the test as before:
//
//	if !u.record(got, "render", i, "text") { t.Errorf(...) }
func (u *goldenUpdate) record(value any, path ...any) bool {
	if !*update {
		return false
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	u.sets = append(u.sets, goldenSet{path, value})
	return true
}

func (u *goldenUpdate) flush() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if len(u.sets) == 0 {
		return
	}
	b, err := os.ReadFile(u.file)
	if err != nil {
		u.t.Errorf("update %s: %v", u.file, err)
		return
	}
	doc, err := decodeJSON(b)
	if err != nil {
		u.t.Errorf("update %s: %v", u.file, err)
		return
	}
	for _, s := range u.sets {
		if doc, err = setPath(doc, s.path, s.value); err != nil {
			u.t.Errorf("update %s: %v", u.file, err)
			return
		}
	}
	out, err := EncodeJSON(doc)
	if err != nil {
		u.t.Errorf("update %s: %v", u.file, err)
		return
	}
	out = append(out, '\n')
	if string(out) == string(b) {
		return
	}
	if err := WriteJSONAtomic(u.file, doc); err != nil {
		u.t.Errorf("update %s: %v", u.file, err)
	}
}

// setPath returns doc with the value at path replaced.
func setPath(doc any, path []any, value any) (any, error) {
	if len(path) == 0 {
		return value, nil
	}
	switch key := path[0].(type) {
	case string:
		m, ok := doc.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("no object at %v", path)
		}
		if _, ok := m[key]; !ok {
			return nil, fmt.Errorf("no key %q", key)
		}
		v, err := setPath(m[key], path[1:], value)
		if err != nil {
			return nil, err
		}
		m[key] = v
	case int:
		a, ok := doc.([]any)
		if !ok || key < 0 || key >= len(a) {
			return nil, fmt.Errorf("no index %d", key)
		}
		v, err := setPath(a[key], path[1:], value)
		if err != nil {
			return nil, err
		}
		a[key] = v
	default:
		return nil, fmt.Errorf("bad path element %v", path[0])
	}
	return doc, nil
}
