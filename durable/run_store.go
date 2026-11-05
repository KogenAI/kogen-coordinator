package durable

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

const maxRunBytes = 65536
const maxRunEvents = 32

// RunEvent is an ordered stage observation supplied by the caller.
type RunEvent struct {
	Stage   string    `json:"stage"`
	At      time.Time `json:"at"`
	Attempt string    `json:"attempt"`
}

// RunRecord contains a bounded event tail and independently retained summary.
type RunRecord struct {
	ID       string     `json:"id"`
	Events   []RunEvent `json:"events"`
	Omitted  uint64     `json:"omitted"`
	Outcome  string     `json:"outcome"`
	Reason   string     `json:"reason"`
	Evidence []string   `json:"evidence"`
}

type storedRun struct {
	Version int `json:"version"`
	RunRecord
}

// RunLockWait is how long Append and Finish wait for the lock of a run record before they
// return `run record "<id>": lock still held after <wait>` without reading or writing the record.
const RunLockWait = 10 * time.Second

var (
	runLockMu   sync.Mutex
	runLockWait = RunLockWait
)

// OverrideRunLockWait is the test seam: until the returned restore is called, every RunStore in
// the process waits at most wait (positive) for a run record lock instead of RunLockWait.
// restore puts back the value that was in effect before the call. No setting or configuration
// key changes the wait.
func OverrideRunLockWait(wait time.Duration) (restore func()) {
	runLockMu.Lock()
	prev := runLockWait
	runLockWait = wait
	runLockMu.Unlock()
	return func() {
		runLockMu.Lock()
		runLockWait = prev
		runLockMu.Unlock()
	}
}

func currentRunLockWait() time.Duration {
	runLockMu.Lock()
	defer runLockMu.Unlock()
	return runLockWait
}

// lock takes the exclusive advisory flock on <root>/<id>.lock, next to the record, on a file
// descriptor of its own, so goroutines and processes exclude each other. The kernel drops the
// lock when its holder ends in any way, so a lock file left by a dead process never blocks.
// The lock file is created when missing and never removed. The returned function unlocks and
// closes it. The ID must be valid.
func (s *RunStore) lock(id string) (unlock func(), err error) {
	f, err := os.OpenFile(filepath.Join(s.root, id+".lock"), os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return nil, err
	}
	wait := currentRunLockWait()
	deadline := time.Now().Add(wait)
	for {
		err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return func() {
				syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
				f.Close()
			}, nil
		}
		if err != syscall.EWOULDBLOCK && err != syscall.EINTR {
			f.Close()
			return nil, err
		}
		if !time.Now().Before(deadline) {
			f.Close()
			return nil, fmt.Errorf("run record %q: lock still held after %s", id, wait)
		}
		time.Sleep(time.Millisecond)
	}
}

// RunStore stores independent run records in a caller-owned retention directory.
type RunStore struct{ root string }

// OpenRunStore creates the retention directory if necessary.
func OpenRunStore(root string) (*RunStore, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}
	return &RunStore{root: root}, nil
}

func validRunID(id string) bool {
	if id == "" {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func (s *RunStore) path(id string) (string, error) {
	if !validRunID(id) {
		return "", fmt.Errorf("invalid run ID %q", id)
	}
	return filepath.Join(s.root, id+".json"), nil
}

// Read returns a record, or an error wrapping os.ErrNotExist if absent.
func (s *RunStore) Read(id string) (RunRecord, error) {
	path, err := s.path(id)
	if err != nil {
		return RunRecord{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return RunRecord{}, err
	}
	var record storedRun
	if err := json.Unmarshal(data, &record); err != nil {
		return RunRecord{}, err
	}
	if record.Version != 1 || record.ID != id {
		return RunRecord{}, fmt.Errorf("invalid run record %q", id)
	}
	if record.Events == nil {
		record.Events = []RunEvent{}
	}
	if record.Evidence == nil {
		record.Evidence = []string{}
	}
	return record.RunRecord, nil
}

func (s *RunStore) load(id string) (RunRecord, error) {
	r, err := s.Read(id)
	if errors.Is(err, os.ErrNotExist) {
		return RunRecord{ID: id, Events: []RunEvent{}, Evidence: []string{}}, nil
	}
	return r, err
}

func encodeRun(r RunRecord) ([]byte, error) {
	return json.Marshal(storedRun{Version: 1, RunRecord: r})
}

// Append adds an event, dropping oldest events as needed to honor the bounds. The read,
// change and replace of the record is serialized per run ID across goroutines and processes by
// an exclusive flock on <root>/<id>.lock, released before Append returns. A call that has not
// obtained the lock within RunLockWait returns `run record "<id>": lock still held after
// <wait>` without reading or writing the record. An invalid ID returns an error before any
// file is created.
func (s *RunStore) Append(id string, event RunEvent) error {
	if _, err := s.path(id); err != nil {
		return err
	}
	unlock, err := s.lock(id)
	if err != nil {
		return err
	}
	defer unlock()
	r, err := s.load(id)
	if err != nil {
		return err
	}
	event.At = event.At.UTC()
	r.Events = append(r.Events, event)
	for {
		data, err := encodeRun(r)
		if err != nil {
			return err
		}
		if len(r.Events) <= maxRunEvents && len(data) <= maxRunBytes {
			return s.write(id, data)
		}
		if len(r.Events) == 1 {
			return fmt.Errorf("run event exceeds record size limit")
		}
		r.Events = r.Events[1:]
		r.Omitted++
	}
}

// Finish replaces the summary without changing the event tail. It takes the same per-run-ID
// lock, waits at most RunLockWait and returns the same error as Append when the lock stays held.
func (s *RunStore) Finish(id, outcome, reason string, evidence []string) error {
	if _, err := s.path(id); err != nil {
		return err
	}
	unlock, err := s.lock(id)
	if err != nil {
		return err
	}
	defer unlock()
	r, err := s.load(id)
	if err != nil {
		return err
	}
	r.Outcome, r.Reason = outcome, reason
	r.Evidence = append([]string{}, evidence...)
	data, err := encodeRun(r)
	if err != nil {
		return err
	}
	if len(data) > maxRunBytes {
		return fmt.Errorf("run summary exceeds record size limit")
	}
	return s.write(id, data)
}

func (s *RunStore) write(id string, data []byte) error {
	path, err := s.path(id)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(s.root, ".run-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = Sync(f); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), path); err != nil {
		return err
	}
	dir, err := os.Open(s.root)
	if err != nil {
		return err
	}
	err = Sync(dir)
	closeErr := dir.Close()
	if err != nil {
		return err
	}
	return closeErr
}

// List returns sorted IDs of regular record files.
func (s *RunStore) List() ([]string, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		id := strings.TrimSuffix(name, ".json")
		if !validRunID(id) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if info.Mode().IsRegular() {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids, nil
}
