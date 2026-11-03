package durable

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
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

// Append adds an event, dropping oldest events as needed to honor the bounds.
func (s *RunStore) Append(id string, event RunEvent) error {
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

// Finish replaces the summary without changing the event tail.
func (s *RunStore) Finish(id, outcome, reason string, evidence []string) error {
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
