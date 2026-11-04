// Steps of the Intent coord-local-record-write-durable. A generated Go driver (package main, in a
// temporary folder of the module, built with go build) calls project.WriteJSONAtomic and git.Repo.RestoreIndex, watches
// durable.Sync through durable.ObserveSyncInTests, and prints one line DURABLE_RESULT=<JSON> of raw
// observations. observe() judges them against the expected object in the feature file.
//
// Observer controls: `node features/steps/coord-local-record-write-durable__driver.js good|bad`
// judges recorded driver observations (good: a candidate implementation; bad: today's code) against
// the expectations parsed from the feature file. Where durable.ObserveSyncInTests does not exist yet
// (today's tree), the driver is built with a do-nothing seam, so it runs and observes no flush.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-local-record-write-durable';
const CASES = ['record-flush', 'rename-failure', 'write-failure', 'sync-failure', 'concurrent', 'index-restore'];

function observe(actual, expected) {
  assert.deepEqual(actual, expected);
}

const known = {
  good: {
    'record-flush': {"error":"","final":"{\"a\":[1.50,true,null],\"m\":{\"a\":\"1\",\"b\":\"2\"},\"z\":\"é<>&\"}\n","flushed_temp_in_folder":true,"flushes":1,"folder":["facts.json"],"mode":"0644","target_at_flush":"{\"n\":1}\n","temp_at_flush":"{\"a\":[1.50,true,null],\"m\":{\"a\":\"1\",\"b\":\"2\"},\"z\":\"é<>&\"}\n"},
    'rename-failure': {"error_returned":true,"flushed_temp_in_folder":true,"flushes":1,"folder":["facts.json"],"inside_target":["keep"],"kept":"keep\n"},
    'write-failure': {"error_returned":true,"flushes":0,"folder":["facts.json"],"record":"{\"n\":1}\n"},
    'sync-failure': {"error_returned":true,"flushed_temp_in_folder":true,"flushes":1,"folder":["facts.json"],"record":"{\"n\":1}\n"},
    'concurrent': {"errors":0,"finals_equal_to_an_input":200,"first_error":"","rounds":200,"rounds_flushing_outside":0,"rounds_sharing_a_temp":0,"rounds_with_leftovers":0,"rounds_without_two_flushes":0},
    'index-restore': {"error":"","flushed_temp_in_git_dir":true,"flushes":1,"git_dir_entries_unchanged":true,"index_at_flush_is_the_replaced_index":true,"index_is_the_saved_index":true,"mode":"0600","saved_differs_from_replaced":true,"temp_at_flush_is_the_saved_index":true}
  },
  bad: {
    'record-flush': {"error":"","final":"{\"a\":[1.50,true,null],\"m\":{\"a\":\"1\",\"b\":\"2\"},\"z\":\"é<>&\"}\n","flushed_temp_in_folder":true,"flushes":0,"folder":["facts.json"],"mode":"0644","target_at_flush":"","temp_at_flush":""},
    'rename-failure': {"error_returned":true,"flushed_temp_in_folder":true,"flushes":0,"folder":["facts.json"],"inside_target":["keep"],"kept":"keep\n"},
    'write-failure': {"error_returned":true,"flushes":0,"folder":["facts.json","facts.json.tmp"],"record":"{\"n\":1}\n"},
    'sync-failure': {"error_returned":false,"flushed_temp_in_folder":true,"flushes":0,"folder":["facts.json"],"record":"{\"n\":2}\n"},
    'concurrent': {"errors":71,"finals_equal_to_an_input":200,"first_error":"rename /home/lanes/work.noindex/scratch/delivery/t1104/durable-driver-1190103058/round-000/facts.json.tmp /home/lanes/work.noindex/scratch/delivery/t1104/durable-driver-1190103058/round-000/facts.json: no such file or directory","rounds":200,"rounds_flushing_outside":0,"rounds_sharing_a_temp":0,"rounds_with_leftovers":0,"rounds_without_two_flushes":200},
    'index-restore': {"error":"","flushed_temp_in_git_dir":true,"flushes":0,"git_dir_entries_unchanged":true,"index_at_flush_is_the_replaced_index":false,"index_is_the_saved_index":true,"mode":"0600","saved_differs_from_replaced":true,"temp_at_flush_is_the_saved_index":false}
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
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"syscall"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
)

type flush struct {
	name   string
	target []byte
	temp   []byte
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
	fl.target, _ = os.ReadFile(watched)
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

func main() {
	syscall.Umask(0o022)
	base, err := os.MkdirTemp("", "durable-driver-")
	check(err)
	defer os.RemoveAll(base)
	base, err = filepath.EvalSymlinks(base)
	check(err)
	installSeam(observe)
	var result any
	switch os.Getenv("DURABLE_CASE") {
	case "record-flush":
		path := filepath.Join(base, "facts.json")
		check(project.WriteJSONAtomic(path, map[string]any{"n": json.Number("1")}))
		watch(path)
		err := project.WriteJSONAtomic(path, map[string]any{
			"z": "é<>&",
			"a": []any{json.Number("1.50"), true, nil},
			"m": map[string]string{"b": "2", "a": "1"},
		})
		fs := observed()
		final, _ := os.ReadFile(path)
		st, statErr := os.Stat(path)
		check(statErr)
		r := map[string]any{
			"error":                  errText(err),
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, base, path),
			"target_at_flush":        "",
			"temp_at_flush":          "",
			"final":                  string(final),
			"mode":                   fmt.Sprintf("%04o", st.Mode().Perm()),
			"folder":                 names(base),
		}
		if len(fs) > 0 {
			r["target_at_flush"], r["temp_at_flush"] = string(fs[0].target), string(fs[0].temp)
		}
		result = r
	case "rename-failure":
		path := filepath.Join(base, "facts.json")
		check(os.Mkdir(path, 0o755))
		check(os.WriteFile(filepath.Join(path, "keep"), []byte("keep\n"), 0o644))
		watch(path)
		err := project.WriteJSONAtomic(path, map[string]any{"n": json.Number("1")})
		fs := observed()
		kept, _ := os.ReadFile(filepath.Join(path, "keep"))
		result = map[string]any{
			"error_returned":         err != nil,
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, base, path),
			"folder":                 names(base),
			"inside_target":          names(path),
			"kept":                   string(kept),
		}
	case "write-failure":
		path := filepath.Join(base, "facts.json")
		check(project.WriteJSONAtomic(path, map[string]any{"n": json.Number("1")}))
		watch(path)
		var limit syscall.Rlimit
		check(syscall.Getrlimit(syscall.RLIMIT_FSIZE, &limit))
		small := limit
		small.Cur = 64
		check(syscall.Setrlimit(syscall.RLIMIT_FSIZE, &small))
		err := project.WriteJSONAtomic(path, map[string]any{"pad": strings.Repeat("x", 4096)})
		check(syscall.Setrlimit(syscall.RLIMIT_FSIZE, &limit))
		fs := observed()
		record, _ := os.ReadFile(path)
		result = map[string]any{
			"error_returned": err != nil,
			"flushes":        len(fs),
			"folder":         names(base),
			"record":         string(record),
		}
	case "sync-failure":
		path := filepath.Join(base, "facts.json")
		check(project.WriteJSONAtomic(path, map[string]any{"n": json.Number("1")}))
		watch(path)
		mu.Lock()
		closeOnFlush = true
		mu.Unlock()
		err := project.WriteJSONAtomic(path, map[string]any{"n": json.Number("2")})
		fs := observed()
		record, _ := os.ReadFile(path)
		result = map[string]any{
			"error_returned":         err != nil,
			"flushes":                len(fs),
			"flushed_temp_in_folder": tempInFolder(fs, base, path),
			"folder":                 names(base),
			"record":                 string(record),
		}
	case "concurrent":
		a := map[string]any{"writer": "a", "pad": strings.Repeat("a", 4096)}
		b := map[string]any{"writer": "b"}
		wantA, err := project.EncodeJSON(a)
		check(err)
		wantB, err := project.EncodeJSON(b)
		check(err)
		const rounds = 200
		errs, equal, leftovers, notTwo, shared, outside := 0, 0, 0, 0, 0, 0
		first := ""
		for i := 0; i < rounds; i++ {
			dir := filepath.Join(base, fmt.Sprintf("round-%03d", i))
			check(os.Mkdir(dir, 0o755))
			path := filepath.Join(dir, "facts.json")
			watch(path)
			start := make(chan struct{})
			var wg sync.WaitGroup
			got := make([]error, 2)
			for j, v := range []any{a, b} {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					got[j] = project.WriteJSONAtomic(path, v)
				}()
			}
			close(start)
			wg.Wait()
			for _, e := range got {
				if e != nil {
					errs++
					if first == "" {
						first = e.Error()
					}
				}
			}
			final, _ := os.ReadFile(path)
			if json.Valid(final) && (bytes.Equal(final, append(wantA, '\n')) || bytes.Equal(final, append(wantB, '\n'))) {
				equal++
			}
			if !slices.Equal(names(dir), []string{"facts.json"}) {
				leftovers++
			}
			fs := observed()
			if len(fs) != 2 {
				notTwo++
			} else if filepath.Clean(fs[0].name) == filepath.Clean(fs[1].name) {
				shared++
			}
			if !tempInFolder(fs, dir, path) {
				outside++
			}
		}
		result = map[string]any{
			"rounds":                     rounds,
			"errors":                     errs,
			"first_error":                first,
			"finals_equal_to_an_input":   equal,
			"rounds_with_leftovers":      leftovers,
			"rounds_without_two_flushes": notTwo,
			"rounds_sharing_a_temp":      shared,
			"rounds_flushing_outside":    outside,
		}
	case "index-restore":
		repo := filepath.Join(base, "repo")
		gitc := func(args ...string) {
			cmd := exec.Command("git", args...)
			cmd.Dir = repo
			out, err := cmd.CombinedOutput()
			if err != nil {
				check(fmt.Errorf("git %v: %v: %s", args, err, out))
			}
		}
		check(os.Mkdir(repo, 0o755))
		gitc("init", "-q")
		check(os.WriteFile(filepath.Join(repo, "a.txt"), []byte("a\n"), 0o644))
		gitc("add", "a.txt")
		r, err := git.Open(repo, os.Environ())
		check(err)
		gitDir, err := r.GitDir()
		check(err)
		index := filepath.Join(gitDir, "index")
		backup := filepath.Join(base, "index-at-start")
		check(r.SaveIndex(backup))
		saved, err := os.ReadFile(backup)
		check(err)
		check(os.WriteFile(filepath.Join(repo, "b.txt"), []byte("b\n"), 0o644))
		gitc("add", "b.txt")
		check(os.Chmod(index, 0o600))
		changed, err := os.ReadFile(index)
		check(err)
		before := names(gitDir)
		watch(index)
		err = r.RestoreIndex(backup)
		fs := observed()
		final, _ := os.ReadFile(index)
		st, statErr := os.Stat(index)
		check(statErr)
		res := map[string]any{
			"error":                                errText(err),
			"flushes":                              len(fs),
			"flushed_temp_in_git_dir":              tempInFolder(fs, gitDir, index),
			"index_at_flush_is_the_replaced_index": false,
			"temp_at_flush_is_the_saved_index":     false,
			"index_is_the_saved_index":             bytes.Equal(final, saved),
			"saved_differs_from_replaced":          !bytes.Equal(saved, changed),
			"mode":                                 fmt.Sprintf("%04o", st.Mode().Perm()),
			"git_dir_entries_unchanged":            slices.Equal(before, names(gitDir)),
		}
		if len(fs) > 0 {
			res["index_at_flush_is_the_replaced_index"] = bytes.Equal(fs[0].target, changed)
			res["temp_at_flush_is_the_saved_index"] = bytes.Equal(fs[0].temp, saved)
		}
		result = res
	default:
		check(fmt.Errorf("unknown DURABLE_CASE %q", os.Getenv("DURABLE_CASE")))
	}
	out, err := json.Marshal(result)
	check(err)
	fmt.Println("DURABLE_RESULT=" + string(out))
}
`;

const seamReal = String.raw`
package main

import (
	"os"

	"github.com/KogenAI/kogen-coordinator/durable"
)

func installSeam(fn func(*os.File)) { durable.ObserveSyncInTests(fn) }
`;

const seamNone = String.raw`
package main

import "os"

// durable.ObserveSyncInTests does not exist in this tree: no flush is observed.
func installSeam(fn func(*os.File)) {}
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');

  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
    try {
      fs.writeFileSync(path.join(dir, 'main.go'), driver);
      fs.writeFileSync(path.join(dir, 'seam.go'), seamReal);
      const binary = path.join(dir, 'durable-driver');
      const buildCommand = `go build -o ${binary} ./${path.basename(dir)}`;
      const goBuild = () => {
        const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
          encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
        });
        return { status: build.status, signal: build.signal, output: (build.stdout || '') + (build.stderr || '') };
      };
      let build = goBuild();
      if (build.status !== 0 && /undefined: durable\.ObserveSyncInTests/.test(build.output)) {
        // Today's tree has no seam: build with a do-nothing one, which observes no flush.
        fs.writeFileSync(path.join(dir, 'seam.go'), seamNone);
        build = goBuild();
      }
      assert.equal(build.status, 0, `${buildCommand} exited ${build.status} ${build.signal || ''}: ${build.output}`);
      const result = cp.spawnSync(binary, [], {
        encoding: 'utf8', timeout: 540000, env: { ...gitFreeEnv(), DURABLE_CASE: name }
      });
      const output = (result.stdout || '') + (result.stderr || '');
      assert.equal(result.status, 0, `${binary} (DURABLE_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
      const rows = output.split('\n').filter(s => s.startsWith('DURABLE_RESULT='));
      assert.equal(rows.length, 1, `${binary} (DURABLE_CASE=${name}) must print exactly one DURABLE_RESULT line: ${output}`);
      this.durableObservation = JSON.parse(rows[0].slice('DURABLE_RESULT='.length));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  Then(SLUG + ': the observation is', function (docString) {
    observe(this.durableObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind !== 'good' && kind !== 'bad') { console.log('usage: good|bad'); process.exit(2); }
  control(kind);
} else {
  register();
}
