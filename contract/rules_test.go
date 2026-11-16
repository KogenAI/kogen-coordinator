package contract

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/KogenAI/kogen-coordinator/rules"
)

// TestRulesAPI pins the exported API of package rules that Shape, Build and Review call.
func TestRulesAPI(t *testing.T) {
	if rules.ConfigPath != ".kogen/studio-rules.yaml" || rules.RequestTimeout != 10*time.Second {
		t.Fatal("rules constants changed")
	}
	var _ func(string) (rules.Config, error) = rules.LoadConfig
	var _ func(context.Context, string, rules.Options) (*rules.Snapshot, error) = rules.Load
	var _ = rules.Config{URL: "", WorkspaceID: "", ProductID: "", Repo: "", TokenEnv: "", OnUnavailable: ""}
	var _ = rules.Options{Getenv: os.Getenv, Now: time.Now, Log: func(string) {}, Client: http.DefaultClient}
	var _ = rules.Rule{ID: "", Revision: json.RawMessage(nil), Scope: "", Topic: "", Text: "", Owner: "", Overrides: json.RawMessage(nil)}
	var _ rules.Origin = rules.Live
	if rules.Live != "live" || rules.Cached != "cached" {
		t.Fatal("origins changed")
	}
	e := &rules.Error{Class: "c", Reason: "r"}
	if e.Error() != "c: r" || rules.ClassHold != "rules/hold" || rules.ClassUnavailable != "rules/unavailable" || rules.ClassRefused != "rules/refused" || rules.ClassConfigInvalid != "environment/project_config_invalid" {
		t.Fatal("error shape changed")
	}
	root := t.TempDir()
	if _, err := rules.LoadConfig(root); !errors.Is(err, rules.ErrNotConfigured) {
		t.Fatalf("absent config: %v", err)
	}
	snap := reflect.TypeOf(rules.Snapshot{})
	tags := map[string]string{"Authority": "authority", "Scope": "scope", "Rules": "rules", "ContentHash": "content_hash", "RetrievedAt": "retrieved_at", "Origin": "origin", "FallbackReason": "fallback_reason"}
	if snap.NumField() != len(tags) {
		t.Fatalf("snapshot fields: %d", snap.NumField())
	}
	for name, tag := range tags {
		if f, ok := snap.FieldByName(name); !ok || f.Tag.Get("json") != tag {
			t.Fatalf("snapshot field %s", name)
		}
	}
}

// TestRulesConsumerFixture pins rules/testdata/consumer: the recorded-shape Studio response and
// the snapshot that loading it live yields.
func TestRulesConsumerFixture(t *testing.T) {
	dir := filepath.Join("..", "rules", "testdata", "consumer")
	resp, err := os.ReadFile(filepath.Join(dir, "response.json"))
	if err != nil {
		t.Fatal(err)
	}
	recorded, err := os.ReadFile(filepath.Join(dir, "snapshot.json"))
	if err != nil {
		t.Fatal(err)
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(resp, &top); err != nil || len(top) != 3 || top["product"] == nil || top["repo"] == nil || top["rules"] == nil {
		t.Fatalf("response shape: %v", err)
	}
	var arr []map[string]json.RawMessage
	if err := json.Unmarshal(top["rules"], &arr); err != nil || len(arr) == 0 {
		t.Fatalf("rules: %v", err)
	}
	for _, r := range arr {
		if len(r) != 7 {
			t.Fatalf("rule keys: %v", r)
		}
	}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer synthetic" {
			w.WriteHeader(401)
			return
		}
		w.Write(resp)
	}))
	defer ts.Close()
	root := t.TempDir()
	writeFile(t, root, rules.ConfigPath, "version: 1\nurl: "+ts.URL+"\nworkspace_id: optimum\nproduct_id: kogen\nrepo: kogen-shaping\ntoken_env: TOK\non_unavailable: hold\n")
	snap, err := rules.Load(context.Background(), root, rules.Options{
		Getenv: func(string) string { return "synthetic" },
		Now:    func() time.Time { return time.Date(2026, 11, 16, 10, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(snap)
	var a, b any
	json.Unmarshal(got, &a)
	if err := json.Unmarshal(recorded, &b); err != nil || !reflect.DeepEqual(a, b) {
		t.Fatalf("snapshot differs from the recorded one:\n%s\n%s", got, recorded)
	}
}
