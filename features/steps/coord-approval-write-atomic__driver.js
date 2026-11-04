// Steps of the Intent coord-approval-write-atomic. A generated Go driver (package main, in a
// temporary folder of the module, built with go build) calls project.WriteApproval in a fresh
// root, watches durable.Sync through durable.ObserveSyncInTests and prints one line
// APPROVAL_RESULT=<JSON> of raw observations. observe() judges them against the expected object
// in the feature file.
//
// Observer controls: `node features/steps/coord-approval-write-atomic__driver.js good|bad` judges
// recorded driver observations (good: a candidate implementation; bad: today's code) against the
// expectations parsed from the feature file.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-approval-write-atomic';
const CASES = ['fresh', 'overwrite', 'rename-failure', 'sync-failure', 'write-failure'];

function observe(actual, expected) {
  assert.deepEqual(actual, expected);
}

const A = '{"slug":"atomic-demo","sha256":"h1","approver":"Ada <ada@example.test>","approved_at":"2026-11-04T00:00:00Z","source_provenance":{"note":"a < b & c"}}\n';
const B = '{"slug":"atomic-demo","sha256":"h2","base":"abc123","approver":"Ada <ada@example.test>","approved_at":"2026-11-04T01:00:00Z","source_provenance":null}\n';

const known = {
  good: {
    'fresh': {"error":"","file":A,"file_is_the_encoding":true,"flushed_temp_in_folder":true,"flushes":1,"folder":["atomic-demo.json"],"mode":"0644","target_existed_at_flush":false,"temp_at_flush":A},
    'overwrite': {"error":"","file":B,"file_is_the_encoding":true,"flushed_temp_in_folder":true,"flushes":1,"folder":["atomic-demo.json"],"mode":"0644","target_at_flush":A,"temp_at_flush":B},
    'rename-failure': {"error_returned":true,"flushed_temp_in_folder":true,"flushes":1,"folder":["atomic-demo.json"],"inside_target":["keep"],"kept":"keep\n"},
    'sync-failure': {"error_returned":true,"file":A,"flushed_temp_in_folder":true,"flushes":1,"folder":["atomic-demo.json"]},
    'write-failure': {"error_returned":true,"file":A,"flushes":0,"folder":["atomic-demo.json"]}
  },
  bad: {
    'fresh': {"error":"","file":A,"file_is_the_encoding":true,"flushed_temp_in_folder":true,"flushes":0,"folder":["atomic-demo.json"],"mode":"0644","target_existed_at_flush":false,"temp_at_flush":""},
    'overwrite': {"error":"","file":B,"file_is_the_encoding":true,"flushed_temp_in_folder":true,"flushes":0,"folder":["atomic-demo.json"],"mode":"0644","target_at_flush":"","temp_at_flush":""},
    'rename-failure': {"error_returned":true,"flushed_temp_in_folder":true,"flushes":0,"folder":["atomic-demo.json"],"inside_target":["keep"],"kept":"keep\n"},
    'sync-failure': {"error_returned":false,"file":B,"flushed_temp_in_folder":true,"flushes":0,"folder":["atomic-demo.json"]},
    'write-failure': {"error_returned":true,"file":B.slice(0, 64),"flushes":0,"folder":["atomic-demo.json"]}
  }
};

// expectations reads, from the feature file, the doc string that follows each case's When step.
function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const out = {};
  const re = /the driver runs the "([a-z-]+)" case\s*\n\s*Then [^\n]*the observation is\s*\n\s*"""\n([\s\S]*?)\n\s*"""/g;
  for (const m of feature.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

function control(kind) {
  const expected = expectations();
  let all = true;
  for (const c of CASES) {
    let accepted;
    try { observe(known[kind][c], expected[c]); accepted = true; } catch (_) { accepted = false; }
    console.log((accepted ? 'accepted ' : 'rejected ') + c);
    if (accepted !== (kind === 'good')) all = false;
  }
  process.exit(kind === 'good' ? (all ? 0 : 1) : (all ? 1 : 0));
}

const driver = String.raw`
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"syscall"

	"github.com/KogenAI/kogen-coordinator/durable"
	"github.com/KogenAI/kogen-coordinator/project"
)

type flush struct {
	name          string
	targetExisted bool
	target        []byte
	temp          []byte
}

var (
	mu           sync.Mutex
	watched      string
	flushes      []flush
	closeOnFlush bool
)

func observe(f *os.File) {
	mu.Lock()
	defer mu.Unlock()
	fl := flush{name: f.Name()}
	var err error
	fl.target, err = os.ReadFile(watched)
	fl.targetExisted = err == nil
	fl.temp, _ = os.ReadFile(f.Name())
	flushes = append(flushes, fl)
	if closeOnFlush {
		f.Close()
	}
}

func watch(path string) {
	mu.Lock()
	watched, flushes = path, nil
	mu.Unlock()
}

func observed() []flush {
	mu.Lock()
	defer mu.Unlock()
	return slices.Clone(flushes)
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
}

func names(dir string) []string {
	entries, err := os.ReadDir(dir)
	check(err)
	out := []string{}
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// tempInFolder: every flushed file is in dir and is not target.
func tempInFolder(fs []flush, dir, target string) bool {
	for _, f := range fs {
		if filepath.Dir(filepath.Clean(f.name)) != dir || filepath.Clean(f.name) == target {
			return false
		}
	}
	return true
}

func encoding(a project.Approval) []byte {
	b, err := project.EncodeApproval(a)
	check(err)
	return b
}

func main() {
	syscall.Umask(0o022)
	root, err := os.MkdirTemp("", "approval-driver-")
	check(err)
	defer os.RemoveAll(root)
	root, err = filepath.EvalSymlinks(root)
	check(err)
	durable.ObserveSyncInTests(observe)
	a := project.Approval{Slug: "atomic-demo", SHA256: "h1", Approver: "Ada <ada@example.test>",
		ApprovedAt: "2026-11-04T00:00:00Z", SourceProvenance: map[string]any{"note": "a < b & c"}}
	b := project.Approval{Slug: "atomic-demo", SHA256: "h2", Base: "abc123", Approver: "Ada <ada@example.test>",
		ApprovedAt: "2026-11-04T01:00:00Z"}
	path := project.ApprovalPath(root, "atomic-demo")
	dir := filepath.Dir(path)
	var result any
	switch os.Getenv("APPROVAL_CASE") {
	case "fresh":
		watch(path)
		err := project.WriteApproval(root, a)
		fs := observed()
		file, _ := os.ReadFile(path)
		st, statErr := os.Stat(path)
		check(statErr)
		r := map[string]any{
			"error":                   errText(err),
			"flushes":                 len(fs),
			"flushed_temp_in_folder":  tempInFolder(fs, dir, path),
			"target_existed_at_flush": false,
			"temp_at_flush":           "",
			"file":                    string(file),
			"file_is_the_encoding":    bytes.Equal(file, encoding(a)),
			"mode":                    fmt.Sprintf("%04o", st.Mode().Perm()),
			"folder":                  names(dir),
		}
		if len(fs) > 0 {
			r["target_existed_at_flush"], r["temp_at_flush"] = fs[0].targetExisted, string(fs[0].temp)
		}
		result = r
	case "overwrite":
		check(project.WriteApproval(root, a))
		watch(path)
		err := project.WriteApproval(root, b)
		fs := observed()
		file, _ := os.ReadFile(path)
		st, statErr := os.Stat(path)
		check(statErr)
		r := map[string]any{
			"error":                  errText(err),
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, dir, path),
			"target_at_flush":        "",
			"temp_at_flush":          "",
			"file":                   string(file),
			"file_is_the_encoding":   bytes.Equal(file, encoding(b)),
			"mode":                   fmt.Sprintf("%04o", st.Mode().Perm()),
			"folder":                 names(dir),
		}
		if len(fs) > 0 {
			r["target_at_flush"], r["temp_at_flush"] = string(fs[0].target), string(fs[0].temp)
		}
		result = r
	case "rename-failure":
		check(os.MkdirAll(path, 0o755))
		check(os.WriteFile(filepath.Join(path, "keep"), []byte("keep\n"), 0o644))
		watch(path)
		err := project.WriteApproval(root, a)
		fs := observed()
		kept, _ := os.ReadFile(filepath.Join(path, "keep"))
		result = map[string]any{
			"error_returned":         err != nil,
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, dir, path),
			"folder":                 names(dir),
			"inside_target":          names(path),
			"kept":                   string(kept),
		}
	case "sync-failure":
		check(project.WriteApproval(root, a))
		watch(path)
		mu.Lock()
		closeOnFlush = true
		mu.Unlock()
		err := project.WriteApproval(root, b)
		fs := observed()
		file, _ := os.ReadFile(path)
		result = map[string]any{
			"error_returned":         err != nil,
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, dir, path),
			"folder":                 names(dir),
			"file":                   string(file),
		}
	case "write-failure":
		check(project.WriteApproval(root, a))
		watch(path)
		big := b
		big.SourceProvenance = map[string]any{"pad": strings.Repeat("x", 4096)}
		var limit syscall.Rlimit
		check(syscall.Getrlimit(syscall.RLIMIT_FSIZE, &limit))
		small := limit
		small.Cur = 64
		check(syscall.Setrlimit(syscall.RLIMIT_FSIZE, &small))
		err := project.WriteApproval(root, big)
		check(syscall.Setrlimit(syscall.RLIMIT_FSIZE, &limit))
		fs := observed()
		file, _ := os.ReadFile(path)
		result = map[string]any{
			"error_returned": err != nil,
			"flushes":        len(fs),
			"folder":         names(dir),
			"file":           string(file),
		}
	default:
		check(fmt.Errorf("unknown APPROVAL_CASE %q", os.Getenv("APPROVAL_CASE")))
	}
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	check(enc.Encode(result))
	fmt.Print("APPROVAL_RESULT=" + out.String())
}
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// run builds the driver in a temporary folder of the module and runs one case; it returns the
// parsed observation.
function run(name) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), driver);
    const binary = path.join(dir, 'approval-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
    });
    const buildOutput = (build.stdout || '') + (build.stderr || '');
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} exited ${build.status} ${build.signal || ''}: ${buildOutput}`);
    const result = cp.spawnSync(binary, [], {
      encoding: 'utf8', timeout: 540000, env: { ...gitFreeEnv(), APPROVAL_CASE: name }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (APPROVAL_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('APPROVAL_RESULT='));
    assert.equal(rows.length, 1, `${binary} (APPROVAL_CASE=${name}) must print exactly one APPROVAL_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('APPROVAL_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');

  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    this.approvalObservation = run(name);
  });

  Then(SLUG + ': the observation is', function (docString) {
    observe(this.approvalObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'good' || kind === 'bad') control(kind);
  else if (kind === 'print' && CASES.includes(process.argv[3])) console.log(JSON.stringify(run(process.argv[3])));
  else { console.log('usage: good|bad|print <case>'); process.exit(2); }
} else {
  register();
}
