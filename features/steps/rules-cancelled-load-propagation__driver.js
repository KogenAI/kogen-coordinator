// Steps of the Intent rules-cancelled-load-propagation. A generated Go driver (package main, in a
// temporary dot-prefixed folder of the module, built once with go build) calls rules.Load against
// a local httptest Studio. It first loads once live so a valid cache exists, then runs one case
// and prints one line LOAD_RESULT=<JSON>: the error text, whether the error is context.Canceled,
// is context.DeadlineExceeded or is a *rules.Error failure class, the snapshot summary (null when
// Load returned none) and the number of HTTP requests made after the cache was written.
// observe() compares the keys named in the expected object of the feature file.
//
// Observer controls: `node features/steps/rules-cancelled-load-propagation__driver.js good|bad`
// judges recorded driver observations (good: the requested behavior; bad: the behavior before the
// change) against the expectations parsed from the feature file, one line per case; it exits 0
// when every case is accepted and 1 otherwise.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'rules-cancelled-load-propagation';

function observe(name, actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.deepEqual(actual[key], expected[key], `case ${name}: key ${key} observed ${JSON.stringify(actual)}`);
  }
}

const known = {
  good: {"cancelled-before-load":{"error":"context canceled","is_canceled":true,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":null,"requests":0},"deadline-expired":{"error":"context deadline exceeded","is_canceled":false,"is_deadline_exceeded":true,"is_rules_failure_class":false,"snapshot":null,"requests":1},"cancelled-during-request":{"error":"context canceled","is_canceled":true,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":null,"requests":1},"network-outage":{"error":"","is_canceled":false,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":{"origin":"cached","fallback_reason":"unreachable","rule_count":1},"requests":0}},
  bad: {"cancelled-before-load":{"error":"","is_canceled":false,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":{"origin":"cached","fallback_reason":"unreachable","rule_count":1},"requests":0},"deadline-expired":{"error":"","is_canceled":false,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":{"origin":"cached","fallback_reason":"unreachable","rule_count":1},"requests":1},"cancelled-during-request":{"error":"","is_canceled":false,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":{"origin":"cached","fallback_reason":"unreachable","rule_count":1},"requests":1},"network-outage":{"error":"","is_canceled":false,"is_deadline_exceeded":false,"is_rules_failure_class":false,"snapshot":{"origin":"cached","fallback_reason":"unreachable","rule_count":1},"requests":0}}
};

function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const re = /the driver runs the "([^"]+)" case\s+Then [^\n]*the outcome is\s+"""\n([\s\S]*?)"""/g;
  const found = {};
  let m;
  while ((m = re.exec(feature)) !== null) found[m[1]] = JSON.parse(m[2]);
  return found;
}

function control(kind) {
  const expected = expectations();
  let rejected = 0;
  for (const name of Object.keys(expected)) {
    try { observe(name, known[kind][name], expected[name]); console.log('accepted ' + name); }
    catch (e) { rejected++; console.log('rejected ' + name); }
  }
  process.exit(rejected === 0 ? 0 : 1);
}

const driver = `package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/KogenAI/kogen-coordinator/rules"
)

const body = "{\\"product\\":\\"kogen\\",\\"repo\\":\\"r\\",\\"rules\\":[{\\"id\\":\\"a\\",\\"revision\\":1,\\"scope\\":\\"repo\\",\\"topic\\":\\"t\\",\\"text\\":\\"x\\",\\"owner\\":\\"o\\",\\"overrides\\":null}]}"

type snap struct {
	Origin         string \`json:"origin"\`
	FallbackReason string \`json:"fallback_reason"\`
	RuleCount      int    \`json:"rule_count"\`
}

type result struct {
	Error      string \`json:"error"\`
	Canceled   bool   \`json:"is_canceled"\`
	Deadline   bool   \`json:"is_deadline_exceeded"\`
	RulesClass bool   \`json:"is_rules_failure_class"\`
	Snapshot   *snap  \`json:"snapshot"\`
	Requests   int64  \`json:"requests"\`
}

func main() {
	name := os.Getenv("LOAD_CASE")
	var requests atomic.Int64
	var block atomic.Bool
	entered := make(chan struct{}, 16)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if block.Load() {
			entered <- struct{}{}
			<-r.Context().Done()
			return
		}
		w.Write([]byte(body))
	}))
	defer ts.Close()
	root, err := os.MkdirTemp("", "rules-load-")
	if err != nil {
		fail(err)
	}
	defer os.RemoveAll(root)
	cfg := "version: 1\\nurl: " + ts.URL + "\\nworkspace_id: w\\nproduct_id: kogen\\nrepo: r\\ntoken_env: TOK\\non_unavailable: hold\\n"
	if err := os.MkdirAll(filepath.Join(root, ".kogen"), 0o755); err != nil {
		fail(err)
	}
	if err := os.WriteFile(filepath.Join(root, rules.ConfigPath), []byte(cfg), 0o644); err != nil {
		fail(err)
	}
	opts := rules.Options{Getenv: func(string) string { return "synthetic-token" }}
	if _, err := rules.Load(context.Background(), root, opts); err != nil {
		fail(fmt.Errorf("priming live load: %w", err))
	}
	requests.Store(0)

	ctx := context.Background()
	switch name {
	case "cancelled-before-load":
		c, cancel := context.WithCancel(ctx)
		cancel()
		ctx = c
	case "deadline-expired":
		block.Store(true)
		c, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
		defer cancel()
		ctx = c
	case "cancelled-during-request":
		block.Store(true)
		c, cancel := context.WithCancel(ctx)
		defer cancel()
		go func() {
			<-entered
			cancel()
		}()
		ctx = c
	case "network-outage":
		ts.Close()
	default:
		fail(fmt.Errorf("unknown case %q", name))
	}
	s, err := rules.Load(ctx, root, opts)
	res := result{Requests: requests.Load()}
	if err != nil {
		res.Error = err.Error()
		res.Canceled = errors.Is(err, context.Canceled)
		res.Deadline = errors.Is(err, context.DeadlineExceeded)
		var re *rules.Error
		res.RulesClass = errors.As(err, &re)
	}
	if s != nil {
		res.Snapshot = &snap{Origin: string(s.Origin), FallbackReason: s.FallbackReason, RuleCount: len(s.Rules)}
	}
	b, err := json.Marshal(res)
	if err != nil {
		fail(err)
	}
	fmt.Printf("LOAD_RESULT=%s\\n", b)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "driver:", err)
	os.Exit(2)
}
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// built is the driver binary, built once per process in a temporary folder of the module that is
// removed when the process exits.
let built = null;
function binary() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'main.go'), driver);
  const out = path.join(dir, 'load-driver');
  const build = cp.spawnSync('go', ['build', '-o', out, './' + path.basename(dir)], {
    encoding: 'utf8', timeout: 100000, env: gitFreeEnv()
  });
  const buildOutput = (build.stdout || '') + (build.stderr || '');
  assert.equal(build.status, 0, `go build -o ${out} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${buildOutput}`);
  built = out;
  return built;
}

// run runs one case of the driver and returns the parsed observation.
function run(name) {
  const bin = binary();
  const result = cp.spawnSync(bin, [], {
    encoding: 'utf8', timeout: 30000, env: { ...gitFreeEnv(), LOAD_CASE: name }
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.equal(result.status, 0, `${bin} (LOAD_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
  const rows = output.split('\n').filter(s => s.startsWith('LOAD_RESULT='));
  assert.equal(rows.length, 1, `${bin} (LOAD_CASE=${name}) must print exactly one LOAD_RESULT line: ${output}`);
  return JSON.parse(rows[0].slice('LOAD_RESULT='.length));
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');
  When(SLUG + ': the driver runs the {string} case', { timeout: 120000 }, function (name) {
    this.loadCase = name;
    this.loadObservation = run(name);
  });
  Then(SLUG + ': the outcome is', function (docString) {
    observe(this.loadCase, this.loadObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'good' || kind === 'bad') control(kind);
  else if (kind === 'print') {
    const all = {};
    for (const name of process.argv.slice(3)) all[name] = run(name);
    console.log(JSON.stringify(all));
  } else { console.log('usage: good|bad|print <case>...'); process.exit(2); }
} else {
  register();
}
