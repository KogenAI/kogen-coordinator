package rules

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/KogenAI/kogen-coordinator/durable"
)

// RequestTimeout is the timeout of the default HTTP client.
const RequestTimeout = 10 * time.Second

// maxBody bounds the response read; a larger response is malformed.
const maxBody = 16 << 20

// Origin tells whether a snapshot was just retrieved or came from the verified cache.
type Origin string

const (
	Live   Origin = "live"
	Cached Origin = "cached"
)

// Options are the optional inputs of Load.
type Options struct {
	Getenv func(string) string
	Now    func() time.Time
	Log    func(line string)
	Client *http.Client
}

// Scope is the scope a snapshot was loaded for.
type Scope struct {
	WorkspaceID string `json:"workspace_id"`
	ProductID   string `json:"product_id"`
	Repo        string `json:"repo"`
}

// Rule is one Studio rule. Revision and Overrides are kept exactly as Studio sent them.
type Rule struct {
	ID        string          `json:"id"`
	Revision  json.RawMessage `json:"revision"`
	Scope     string          `json:"scope"`
	Topic     string          `json:"topic"`
	Text      string          `json:"text"`
	Owner     string          `json:"owner"`
	Overrides json.RawMessage `json:"overrides"`
}

// Snapshot is a scoped rule snapshot with its provenance. Its Authority is always "advisory".
type Snapshot struct {
	Authority      string    `json:"authority"`
	Scope          Scope     `json:"scope"`
	Rules          []Rule    `json:"rules"`
	ContentHash    string    `json:"content_hash"`
	RetrievedAt    time.Time `json:"retrieved_at"`
	Origin         Origin    `json:"origin"`
	FallbackReason string    `json:"fallback_reason"`
}

// Load returns the rule snapshot of the project's configured scope. It always asks Studio first;
// only an outage falls back to the last verified snapshot of the same scope. A cancelled context or
// an expired deadline returns ctx.Err() itself, with no snapshot, no cache use and no *Error.
func Load(ctx context.Context, root string, opts Options) (*Snapshot, error) {
	cfg, err := LoadConfig(root)
	if err != nil {
		if !errors.Is(err, ErrNotConfigured) {
			logError(opts, err)
		}
		return nil, err
	}
	getenv := opts.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	client := opts.Client
	if client == nil {
		client = &http.Client{Timeout: RequestTimeout}
	}
	scope := Scope{WorkspaceID: cfg.WorkspaceID, ProductID: cfg.ProductID, Repo: cfg.Repo}

	token := getenv(cfg.TokenEnv)
	if token == "" {
		return nil, fail(opts, &Error{Class: ClassRefused, Reason: "token_missing"})
	}

	if err := ctx.Err(); err != nil {
		return nil, err
	}
	rules, reason, refused := fetch(ctx, client, cfg, token)
	if reason == "unreachable" {
		// A request whose context ended is not an outage: return the context error itself,
		// without the cache and without a failure class.
		if err := ctx.Err(); err != nil {
			return nil, err
		}
	}
	if refused != nil {
		return nil, fail(opts, refused)
	}
	if reason == "" {
		snap := &Snapshot{
			Authority:   "advisory",
			Scope:       scope,
			Rules:       rules,
			ContentHash: contentHash(rules),
			RetrievedAt: now().UTC(),
			Origin:      Live,
		}
		writeCache(root, snap)
		logSnapshot(opts, snap)
		return snap, nil
	}

	if cached := readCache(root, scope); cached != nil {
		cached.Origin = Cached
		cached.FallbackReason = reason
		logSnapshot(opts, cached)
		return cached, nil
	}
	class := ClassUnavailable
	if cfg.OnUnavailable == "hold" {
		class = ClassHold
	}
	return nil, fail(opts, &Error{Class: class, Reason: reason})
}

// fetch performs the Studio read. It returns the valid rules, or an outage reason, or a refusal.
func fetch(ctx context.Context, client *http.Client, cfg Config, token string) ([]Rule, string, *Error) {
	q := url.Values{}
	q.Set("workspace_id", cfg.WorkspaceID)
	q.Set("product_id", cfg.ProductID)
	q.Set("repo", cfg.Repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL+"/api/rules?"+q.Encode(), nil)
	if err != nil {
		return nil, "unreachable", nil
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, "unreachable", nil
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		return nil, "", &Error{Class: ClassRefused, Reason: fmt.Sprintf("http_%d", resp.StatusCode)}
	case resp.StatusCode >= 500:
		return nil, fmt.Sprintf("http_%d", resp.StatusCode), nil
	case resp.StatusCode != http.StatusOK:
		return nil, "malformed_response", nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil {
		return nil, "unreachable", nil
	}
	if len(body) > maxBody {
		return nil, "malformed_response", nil
	}
	rules, ok := parseResponse(body, cfg)
	if !ok {
		return nil, "malformed_response", nil
	}
	return rules, "", nil
}

func rawString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || raw[0] != '"' {
		return "", false
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	return s, true
}

// decodeObject preserves member names until duplicates have been checked. Values remain raw,
// so nested objects retain their existing validation semantics.
func decodeObject(data []byte) (map[string]json.RawMessage, bool) {
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil || tok != json.Delim('{') {
		return nil, false
	}
	object := make(map[string]json.RawMessage)
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, false
		}
		name, ok := tok.(string)
		if !ok {
			return nil, false
		}
		if _, exists := object[name]; exists {
			return nil, false
		}
		var value json.RawMessage
		if dec.Decode(&value) != nil {
			return nil, false
		}
		object[name] = value
	}
	if tok, err = dec.Token(); err != nil || tok != json.Delim('}') {
		return nil, false
	}
	if _, err = dec.Token(); err != io.EOF {
		return nil, false
	}
	return object, true
}

func parseResponse(body []byte, cfg Config) ([]Rule, bool) {
	top, valid := decodeObject(body)
	if !valid {
		return nil, false
	}
	if p, ok := rawString(top["product"]); !ok || p != cfg.ProductID {
		return nil, false
	}
	if r, ok := rawString(top["repo"]); !ok || r != cfg.Repo {
		return nil, false
	}
	if raw := bytes.TrimSpace(top["rules"]); len(raw) == 0 || raw[0] != '[' {
		return nil, false
	}
	var items []json.RawMessage
	if json.Unmarshal(top["rules"], &items) != nil {
		return nil, false
	}
	rules := make([]Rule, 0, len(items))
	ids := map[string]bool{}
	topics := map[string]bool{}
	for _, raw := range items {
		item, valid := decodeObject(raw)
		if !valid {
			return nil, false
		}
		var r Rule
		var ok [5]bool
		r.ID, ok[0] = rawString(item["id"])
		r.Scope, ok[1] = rawString(item["scope"])
		r.Topic, ok[2] = rawString(item["topic"])
		r.Owner, ok[3] = rawString(item["owner"])
		r.Text, ok[4] = rawString(item["text"])
		for _, good := range ok {
			if !good {
				return nil, false
			}
		}
		if r.ID == "" || r.Scope == "" || r.Topic == "" || r.Owner == "" {
			return nil, false
		}
		rev, hasRev := item["revision"]
		over, hasOver := item["overrides"]
		if !hasRev || string(bytes.TrimSpace(rev)) == "null" || !hasOver {
			return nil, false
		}
		r.Revision = append(json.RawMessage(nil), rev...)
		r.Overrides = append(json.RawMessage(nil), over...)
		if ids[r.ID] || topics[r.Topic] {
			return nil, false
		}
		ids[r.ID] = true
		topics[r.Topic] = true
		rules = append(rules, r)
	}
	return rules, true
}

// contentHash is sha256: and the hex digest of the compact JSON array of the rules in response
// order, keys in the order of Rule, with HTML escaping off.
func contentHash(rules []Rule) string {
	if rules == nil {
		rules = []Rule{}
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(rules); err != nil {
		return ""
	}
	sum := sha256.Sum256(bytes.TrimSuffix(b.Bytes(), []byte("\n")))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func cachePath(root string, s Scope) string {
	sum := sha256.Sum256([]byte(s.WorkspaceID + "\x00" + s.ProductID + "\x00" + s.Repo))
	return filepath.Join(root, ".kogen", "local", "studio-rules", hex.EncodeToString(sum[:])+".json")
}

// writeCache stores the snapshot for its scope; a failure is ignored by design.
func writeCache(root string, s *Snapshot) {
	// HTML escaping stays off so the raw revision and overrides read back byte-for-byte and the
	// recomputed content hash still verifies.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return
	}
	data := bytes.TrimSuffix(buf.Bytes(), []byte("\n"))
	path := cachePath(root, s.Scope)
	if os.MkdirAll(filepath.Dir(path), 0o755) != nil {
		return
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return
	}
	tmp := path + ".tmp-" + hex.EncodeToString(suffix[:])
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return
	}
	if err := durable.Sync(f); err != nil {
		f.Close()
		os.Remove(tmp)
		return
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
	}
}

// readCache returns the cached snapshot of exactly this scope if it verifies, else nil.
func readCache(root string, scope Scope) *Snapshot {
	data, err := os.ReadFile(cachePath(root, scope))
	if err != nil {
		return nil
	}
	var s Snapshot
	if json.Unmarshal(data, &s) != nil {
		return nil
	}
	if s.Scope != scope || s.ContentHash == "" || contentHash(s.Rules) != s.ContentHash {
		return nil
	}
	if s.Rules == nil {
		s.Rules = []Rule{}
	}
	s.Authority = "advisory"
	return &s
}

func logSnapshot(opts Options, s *Snapshot) {
	if opts.Log == nil {
		return
	}
	fallback := s.FallbackReason
	if fallback == "" {
		fallback = "none"
	}
	opts.Log(fmt.Sprintf("studio-rules: origin=%s hash=%s rules=%d retrieved_at=%s fallback=%s",
		s.Origin, s.ContentHash, len(s.Rules), s.RetrievedAt.UTC().Format(time.RFC3339), fallback))
}

func logError(opts Options, err error) {
	if opts.Log == nil {
		return
	}
	var e *Error
	if errors.As(err, &e) {
		opts.Log(fmt.Sprintf("studio-rules: error=%s reason=%s", e.Class, e.Reason))
		return
	}
	opts.Log("studio-rules: error=rules/unavailable reason=" + err.Error())
}

func fail(opts Options, e *Error) error {
	logError(opts, e)
	return e
}
