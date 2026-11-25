package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/KogenAI/kogen-coordinator/rules"
)

type input struct {
	Policy string `json:"policy"`
	Prime  string `json:"prime"`
	Body   string `json:"body"`
}

type observedError struct {
	Class  string `json:"class"`
	Reason string `json:"reason"`
}

type observation struct {
	Error    *observedError  `json:"error"`
	Snapshot *rules.Snapshot `json:"snapshot"`
	Seed     *rules.Snapshot `json:"seed"`
}

func run(in input) (observation, error) {
	root, err := os.MkdirTemp("", "studio-rules-")
	if err != nil {
		return observation{}, err
	}
	defer os.RemoveAll(root)

	const token = "synthetic-token-unit"
	var requests atomic.Int32
	studio := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.Method != http.MethodGet || r.URL.Path != "/api/rules" || q.Get("workspace_id") != "w" || q.Get("product_id") != "kogen" || q.Get("repo") != "r" || r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		body := in.Body
		if requests.Add(1) == 1 && in.Prime != "" {
			body = in.Prime
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, body)
	}))
	defer studio.Close()

	config := filepath.Join(root, rules.ConfigPath)
	if err := os.MkdirAll(filepath.Dir(config), 0o755); err != nil {
		return observation{}, err
	}
	text := fmt.Sprintf("version: 1\nurl: %s\nworkspace_id: w\nproduct_id: kogen\nrepo: r\ntoken_env: TOK\non_unavailable: %s\n", studio.URL, in.Policy)
	if err := os.WriteFile(config, []byte(text), 0o644); err != nil {
		return observation{}, err
	}

	opts := rules.Options{
		Getenv: func(name string) string {
			if name == "TOK" {
				return token
			}
			return ""
		},
		Now: func() time.Time { return time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC) },
	}
	var out observation
	if in.Prime != "" {
		out.Seed, err = rules.Load(context.Background(), root, opts)
		if err != nil {
			return observation{}, fmt.Errorf("prime rules cache: %w", err)
		}
	}
	out.Snapshot, err = rules.Load(context.Background(), root, opts)
	var classified *rules.Error
	switch {
	case errors.As(err, &classified):
		out.Error = &observedError{classified.Class, classified.Reason}
	case err != nil:
		return observation{}, err
	}
	return out, nil
}

func main() {
	var in input
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		log.Fatal(err)
	}
	out, err := run(in)
	if err != nil {
		log.Fatal(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		log.Fatal(err)
	}
}
