package rules_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/KogenAI/kogen-coordinator/rules"
)

const token = "synthetic-token-unit"

type fx struct {
	t      *testing.T
	root   string
	ts     *httptest.Server
	status int
	body   string
	reqs   int
	query  map[string]string
	tok    string
	logs   []string
}

func rulesBody(rev string) string {
	return `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":` + rev + `,"scope":"repo","topic":"t","text":"<x> & y","owner":"o","overrides":null}]}`
}

func newFx(t *testing.T, policy string) *fx {
	f := &fx{t: t, root: t.TempDir(), body: rulesBody("1"), tok: token}
	f.ts = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.reqs++
		f.query = map[string]string{}
		for k, v := range r.URL.Query() {
			f.query[k] = v[0]
		}
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(401)
			return
		}
		if f.status != 0 {
			w.WriteHeader(f.status)
			return
		}
		w.Write([]byte(f.body))
	}))
	t.Cleanup(f.ts.Close)
	f.config("version: 1\nurl: " + f.ts.URL + "\nworkspace_id: w\nproduct_id: kogen\nrepo: r\ntoken_env: TOK\non_unavailable: " + policy + "\n")
	return f
}

func (f *fx) config(text string) {
	p := filepath.Join(f.root, rules.ConfigPath)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		f.t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fx) load() (*rules.Snapshot, error) {
	return rules.Load(context.Background(), f.root, rules.Options{
		Getenv: func(string) string { return f.tok },
		Now:    func() time.Time { return time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC) },
		Log:    func(l string) { f.logs = append(f.logs, l) },
	})
}

func class(err error) string {
	var e *rules.Error
	if errors.As(err, &e) {
		return e.Class + "/" + e.Reason
	}
	return "other:" + err.Error()
}

func TestLiveAndHash(t *testing.T) {
	f := newFx(t, "hold")
	s, err := f.load()
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(`[{"id":"a","revision":1,"scope":"repo","topic":"t","text":"<x> & y","owner":"o","overrides":null}]`))
	if s.ContentHash != "sha256:"+hex.EncodeToString(sum[:]) || s.Origin != rules.Live || s.Authority != "advisory" || s.FallbackReason != "" {
		t.Fatalf("snapshot: %+v", s)
	}
	if f.query["workspace_id"] != "w" || f.query["product_id"] != "kogen" || f.query["repo"] != "r" || len(f.query) != 3 {
		t.Fatalf("query: %v", f.query)
	}
	if len(f.logs) != 1 || !strings.HasPrefix(f.logs[0], "studio-rules: origin=live hash="+s.ContentHash+" rules=1 retrieved_at=2026-01-02T03:04:05Z fallback=none") {
		t.Fatalf("log: %v", f.logs)
	}
}

func TestOutageUsesVerifiedSameScopeCache(t *testing.T) {
	f := newFx(t, "hold")
	live, err := f.load()
	if err != nil {
		t.Fatal(err)
	}
	f.status = 502
	c, err := f.load()
	if err != nil || c.Origin != rules.Cached || c.FallbackReason != "http_502" || c.ContentHash != live.ContentHash {
		t.Fatalf("cached: %+v %v", c, err)
	}
	f.status, f.body = 0, "{"
	c, err = f.load()
	if err != nil || c.FallbackReason != "malformed_response" || c.ContentHash != live.ContentHash {
		t.Fatalf("malformed: %+v %v", c, err)
	}
	f.config(strings.Replace(readConfig(t, f), "repo: r", "repo: other", 1))
	f.status = 503
	if _, err := f.load(); class(err) != "rules/hold/http_503" {
		t.Fatalf("other scope: %v", err)
	}
}

func readConfig(t *testing.T, f *fx) string {
	b, err := os.ReadFile(filepath.Join(f.root, rules.ConfigPath))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestRefusedNeverReadsCache(t *testing.T) {
	f := newFx(t, "unavailable")
	if _, err := f.load(); err != nil {
		t.Fatal(err)
	}
	f.status = 403
	if s, err := f.load(); s != nil || class(err) != "rules/refused/http_403" {
		t.Fatalf("403: %v %v", s, err)
	}
	f.status, f.tok = 0, ""
	before := f.reqs
	if s, err := f.load(); s != nil || class(err) != "rules/refused/token_missing" || f.reqs != before {
		t.Fatalf("missing token: %v %v", s, err)
	}
}

func TestPolicyWithoutCache(t *testing.T) {
	for policy, want := range map[string]string{"hold": "rules/hold/http_500", "unavailable": "rules/unavailable/http_500"} {
		f := newFx(t, policy)
		f.status = 500
		if s, err := f.load(); s != nil || class(err) != want {
			t.Fatalf("%s: %v %v", policy, s, err)
		}
	}
}

func TestMalformedResponses(t *testing.T) {
	good := `{"id":"a","revision":1,"scope":"s","topic":"t","text":"x","owner":"o","overrides":null}`
	for name, body := range map[string]string{
		"not-object":      `[]`,
		"rules-null":      `{"product":"kogen","repo":"r","rules":null}`,
		"wrong-product":   `{"product":"x","repo":"r","rules":[]}`,
		"null-revision":   `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":null,"scope":"s","topic":"t","text":"x","owner":"o","overrides":null}]}`,
		"no-overrides":    `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"s","topic":"t","text":"x","owner":"o"}]}`,
		"empty-owner":     `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"s","topic":"t","text":"x","owner":"","overrides":null}]}`,
		"numeric-text":    `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"s","topic":"t","text":1,"owner":"o","overrides":null}]}`,
		"duplicate-id":    `{"product":"kogen","repo":"r","rules":[` + good + `,` + strings.Replace(good, `"topic":"t"`, `"topic":"u"`, 1) + `]}`,
		"duplicate-topic": `{"product":"kogen","repo":"r","rules":[` + good + `,` + strings.Replace(good, `"id":"a"`, `"id":"b"`, 1) + `]}`,
	} {
		f := newFx(t, "hold")
		f.body = body
		if s, err := f.load(); s != nil || class(err) != "rules/hold/malformed_response" {
			t.Fatalf("%s: %v %v", name, s, err)
		}
	}
	f := newFx(t, "hold")
	f.body = `{"product":"kogen","repo":"r","rules":[]}`
	if s, err := f.load(); err != nil || len(s.Rules) != 0 {
		t.Fatalf("empty rules are valid: %v %v", s, err)
	}
}

func TestTamperedCacheCountsAsAbsent(t *testing.T) {
	f := newFx(t, "hold")
	if _, err := f.load(); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(f.root, ".kogen", "local", "studio-rules", "*.json"))
	if len(files) != 1 {
		t.Fatalf("cache files: %v", files)
	}
	b, _ := os.ReadFile(files[0])
	os.WriteFile(files[0], []byte(strings.Replace(string(b), `& y`, `& z`, 1)), 0o644)
	f.status = 503
	if s, err := f.load(); s != nil || class(err) != "rules/hold/http_503" {
		t.Fatalf("tampered: %v %v", s, err)
	}
}

func TestUnconfiguredAndConfigErrors(t *testing.T) {
	root := t.TempDir()
	s, err := rules.Load(context.Background(), root, rules.Options{})
	if s != nil || !errors.Is(err, rules.ErrNotConfigured) {
		t.Fatalf("unconfigured: %v %v", s, err)
	}
	if _, err := os.Stat(filepath.Join(root, ".kogen")); err == nil {
		t.Fatal("unconfigured load created files")
	}
	valid := "version: 1\nurl: https://studio.example/\nworkspace_id: w\nproduct_id: p\nrepo: r\ntoken_env: T\non_unavailable: hold\n"
	for name, c := range map[string]struct{ text, key string }{
		"token":      {valid + "token: SECRETVALUE\n", "token"},
		"scheme":     {strings.Replace(valid, "https", "ftp", 1), "url"},
		"policy":     {strings.Replace(valid, "hold", "retry", 1), "on_unavailable"},
		"no-version": {strings.Replace(valid, "version: 1\n", "", 1), "version"},
		"duplicate":  {valid + "repo: z\n", "repo"},
		"empty":      {strings.Replace(valid, "token_env: T", "token_env:", 1), "token_env"},
	} {
		dir := t.TempDir()
		os.MkdirAll(filepath.Join(dir, ".kogen"), 0o755)
		os.WriteFile(filepath.Join(dir, rules.ConfigPath), []byte(c.text), 0o644)
		_, err := rules.LoadConfig(dir)
		var re *rules.Error
		if !errors.As(err, &re) || re.Class != "environment/project_config_invalid" || !strings.Contains(re.Reason, c.key) || !strings.Contains(re.Reason, rules.ConfigPath) || strings.Contains(err.Error(), "SECRETVALUE") {
			t.Fatalf("%s: %v", name, err)
		}
	}
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".kogen"), 0o755)
	os.WriteFile(filepath.Join(dir, rules.ConfigPath), []byte("# team file\n"+valid), 0o644)
	cfg, err := rules.LoadConfig(dir)
	if err != nil || cfg.URL != "https://studio.example" || cfg.WorkspaceID != "w" || cfg.TokenEnv != "T" {
		t.Fatalf("valid: %+v %v", cfg, err)
	}
}

func TestNoTokenBytes(t *testing.T) {
	f := newFx(t, "hold")
	f.load()
	f.status = 503
	f.load()
	f.tok = "other-secret"
	f.load()
	for _, l := range f.logs {
		if strings.Contains(l, token) || strings.Contains(l, "other-secret") {
			t.Fatalf("log leaks: %s", l)
		}
	}
	filepath.WalkDir(f.root, func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			b, _ := os.ReadFile(p)
			if strings.Contains(string(b), token) {
				t.Fatalf("file leaks: %s", p)
			}
		}
		return nil
	})
}

func TestUnreachable(t *testing.T) {
	f := newFx(t, "unavailable")
	f.ts.Close()
	if _, err := f.load(); class(err) != "rules/unavailable/unreachable" {
		t.Fatalf("%v", err)
	}
}

func TestCacheVerifiesRawRevisionAndOverridesWithHTMLCharacters(t *testing.T) {
	f := newFx(t, "hold")
	f.body = `{"product":"kogen","repo":"r","rules":[{"id":"a","revision":"r&5","scope":"repo","topic":"t","text":"x","owner":"o","overrides":"a<b"}]}`
	live, err := f.load()
	if err != nil {
		t.Fatal(err)
	}
	f.status = 503
	c, err := f.load()
	if err != nil || c.Origin != rules.Cached || c.ContentHash != live.ContentHash || string(c.Rules[0].Revision) != `"r&5"` {
		t.Fatalf("cache unusable: %+v %v", c, err)
	}
}
