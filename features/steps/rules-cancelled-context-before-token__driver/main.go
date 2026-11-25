package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-coordinator/rules"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type loadError struct {
	Kind   string `json:"kind"`
	Class  string `json:"class,omitempty"`
	Reason string `json:"reason,omitempty"`
	Text   string `json:"text,omitempty"`
}

func describe(err error) *loadError {
	switch err {
	case nil:
		return nil
	case context.Canceled:
		return &loadError{Kind: "context.Canceled"}
	case context.DeadlineExceeded:
		return &loadError{Kind: "context.DeadlineExceeded"}
	}
	if e, ok := err.(*rules.Error); ok {
		return &loadError{Kind: "*rules.Error", Class: e.Class, Reason: e.Reason}
	}
	return &loadError{Kind: "other", Text: err.Error()}
}

type observation struct {
	Error       *loadError      `json:"error"`
	Snapshot    *rules.Snapshot `json:"snapshot"`
	Requests    int64           `json:"requests"`
	TokenLookup bool            `json:"token_lookup"`
	CacheRead   bool            `json:"cache_read"`
}

// watchCache replaces the verified cache file with a FIFO serving the same bytes.
// The writer cannot open until a reader opens; it records that rendezvous before
// supplying bytes, so even Load reading and discarding them is observable.
func watchCache(root string) (func() (bool, error), error) {
	paths, err := filepath.Glob(filepath.Join(root, ".kogen", "local", "studio-rules", "*.json"))
	if err != nil || len(paths) != 1 {
		return nil, fmt.Errorf("expected one primed cache file, got %v: %v", paths, err)
	}
	file := paths[0]
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	if err := os.Remove(file); err != nil {
		return nil, err
	}
	if err := syscall.Mkfifo(file, 0o600); err != nil {
		return nil, err
	}
	var opened atomic.Bool
	done := make(chan error, 1)
	go func() {
		w, err := os.OpenFile(file, os.O_WRONLY, 0)
		if err == nil {
			opened.Store(true)
			_, err = w.Write(data)
			closeErr := w.Close()
			if err == nil {
				err = closeErr
			}
		}
		done <- err
	}()
	return func() (bool, error) {
		read := opened.Load()
		if !read {
			// Release the writer by consuming the bytes only after measuring Load.
			if _, err := os.ReadFile(file); err != nil {
				return false, err
			}
		}
		return read, <-done
	}, nil
}

func run(state string) (observation, error) {
	root, err := os.MkdirTemp("", "rules-precedence-")
	if err != nil {
		return observation{}, err
	}
	defer os.RemoveAll(root)

	var outage atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if outage.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		io.WriteString(w, `{"product":"kogen","repo":"r","rules":[]}`)
	}))
	defer server.Close()
	config := filepath.Join(root, rules.ConfigPath)
	if err := os.MkdirAll(filepath.Dir(config), 0o755); err != nil {
		return observation{}, err
	}
	body := "version: 1\nurl: " + server.URL + "\nworkspace_id: w\nproduct_id: kogen\nrepo: r\ntoken_env: TOK\non_unavailable: hold\n"
	if err := os.WriteFile(config, []byte(body), 0o600); err != nil {
		return observation{}, err
	}

	var requests atomic.Int64
	client := server.Client()
	base := client.Transport
	client.Timeout = rules.RequestTimeout
	client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		return base.RoundTrip(r)
	})
	opts := rules.Options{
		Client: client,
		Getenv: func(string) string { return "synthetic-token-unit" },
	}
	live, err := rules.Load(context.Background(), root, opts)
	if err != nil || live == nil || live.Origin != rules.Live {
		return observation{}, fmt.Errorf("prime live cache: snapshot=%+v error=%v", live, err)
	}
	outage.Store(true)
	cached, err := rules.Load(context.Background(), root, opts)
	if err != nil || cached == nil || cached.Origin != rules.Cached || cached.ContentHash != live.ContentHash {
		return observation{}, fmt.Errorf("verify primed cache: snapshot=%+v error=%v", cached, err)
	}
	before := requests.Load()

	ctx := context.Background()
	switch state {
	case "active":
	case "cancelled":
		c, cancel := context.WithCancel(ctx)
		cancel()
		ctx = c
	case "expired":
		c, cancel := context.WithDeadline(ctx, time.Unix(0, 0))
		defer cancel()
		ctx = c
	default:
		return observation{}, fmt.Errorf("unknown context state %q", state)
	}
	finishCacheWatch, err := watchCache(root)
	if err != nil {
		return observation{}, err
	}
	var lookup atomic.Bool
	opts.Getenv = func(string) string {
		lookup.Store(true)
		return ""
	}
	snapshot, err := rules.Load(ctx, root, opts)
	cacheRead, watchErr := finishCacheWatch()
	return observation{describe(err), snapshot, requests.Load() - before, lookup.Load(), cacheRead}, watchErr
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "expected one context state")
		os.Exit(2)
	}
	result, err := run(os.Args[1])
	if err == nil {
		err = json.NewEncoder(os.Stdout).Encode(result)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
}
