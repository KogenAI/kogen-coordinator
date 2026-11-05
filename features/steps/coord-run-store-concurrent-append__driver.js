// Steps of the Intent coord-run-store-concurrent-append. A generated Go driver (package main, in a
// temporary dot-prefixed folder of the module, built with go build) drives durable.RunStore from
// goroutines and from helper processes (the driver binary re-executed with RUN_HELPER set), holds a
// run's lock file with flock from a helper process, and prints one line RUN_RESULT=<JSON> of raw
// observations. observe() judges them against the expected object in the feature file.
//
// Observer controls: `node features/steps/coord-run-store-concurrent-append__driver.js good|bad`
// judges recorded driver observations (good: a candidate implementation; bad: today's code) against
// the expectations parsed from the feature file. `... run <case>` prints one case's observation.
// Where durable.OverrideRunLockWait or durable.RunLockWait does not exist yet (today's tree), the
// driver is built with a do-nothing seam, so it runs with no lock wait to shorten.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'coord-run-store-concurrent-append';
const CASES = ['goroutines', 'processes', 'finish-race', 'held-then-dead', 'independent', 'error-paths'];

function observe(actual, expected) {
  assert.deepEqual(actual, expected);
}

const known = {
  good: {
    "goroutines": {"distinct":true,"errors":0,"events":32,"events_plus_omitted":200,"first_error":"","known_stages":true,"newest_tail_per_writer":true,"omitted":168},
    "processes": {"distinct":true,"events":32,"events_plus_omitted":100,"helpers":[{"errors":0,"first_error":""},{"errors":0,"first_error":""}],"known_stages":true,"newest_tail_per_writer":true,"omitted":68},
    "finish-race": {"append_errors":0,"evidence":["attempts/fin"],"finish_error":"","first_error":"","omitted":0,"outcome":"done","reason":"raced","sorted_stages":["e-0","e-1","e-10","e-11","e-12","e-13","e-14","e-15","e-16","e-17","e-18","e-19","e-2","e-3","e-4","e-5","e-6","e-7","e-8","e-9"]},
    "held-then-dead": {"after_dead_error":"","after_dead_under_1s":true,"append_error":"run record \"held\": lock still held after 300ms","append_waited_the_wait":true,"default_wait":"10s","finish_error":"run record \"held\": lock still held after 300ms","finish_waited_the_wait":true,"folder":["held.json","held.lock"],"list":["held"],"outcome":"","record_written_while_held":false,"stages":["after-dead"]},
    "independent": {"a_error":"","a_stages":["a-0"],"a_still_waiting_when_b_finished":true,"b_errors":0,"b_first_error":"","b_stages":["b-0","b-1","b-2","b-3","b-4","b-5","b-6","b-7","b-8","b-9"]},
    "error-paths": {"errors":["run event exceeds record size limit","","run summary exceeds record size limit","","invalid character 'b' looking for beginning of value","invalid character 'b' looking for beginning of value","","invalid run ID \"../escape\"","invalid run ID \"x.y\""],"folder":["e.json","e.lock"],"list":["e"],"outside":["records"],"record":"{\"version\":1,\"id\":\"e\",\"events\":[{\"stage\":\"fourth\",\"at\":\"2026-01-02T03:04:05Z\",\"attempt\":\"a\"}],\"omitted\":0,\"outcome\":\"\",\"reason\":\"\",\"evidence\":[]}"}
  },
  bad: {
    "goroutines": {"distinct":true,"errors":0,"events":32,"events_plus_omitted":40,"first_error":"","known_stages":true,"newest_tail_per_writer":false,"omitted":8},
    "processes": {"distinct":true,"events":32,"events_plus_omitted":50,"helpers":[{"errors":0,"first_error":""},{"errors":0,"first_error":""}],"known_stages":true,"newest_tail_per_writer":true,"omitted":18},
    "finish-race": {"append_errors":0,"evidence":[],"finish_error":"","first_error":"","omitted":0,"outcome":"","reason":"","sorted_stages":["e-18"]},
    "held-then-dead": {"after_dead_error":"","after_dead_under_1s":true,"append_error":"","append_waited_the_wait":false,"default_wait":"","finish_error":"","finish_waited_the_wait":false,"folder":["held.json","held.lock"],"list":["held"],"outcome":"done","record_written_while_held":true,"stages":["while-held","after-dead"]},
    "independent": {"a_error":"","a_stages":["a-0"],"a_still_waiting_when_b_finished":false,"b_errors":0,"b_first_error":"","b_stages":["b-0","b-1","b-2","b-3","b-4","b-5","b-6","b-7","b-8","b-9"]},
    "error-paths": {"errors":["run event exceeds record size limit","","run summary exceeds record size limit","","invalid character 'b' looking for beginning of value","invalid character 'b' looking for beginning of value","","invalid run ID \"../escape\"","invalid run ID \"x.y\""],"folder":["e.json"],"list":["e"],"outside":["records"],"record":"{\"version\":1,\"id\":\"e\",\"events\":[{\"stage\":\"fourth\",\"at\":\"2026-01-02T03:04:05Z\",\"attempt\":\"a\"}],\"omitted\":0,\"outcome\":\"\",\"reason\":\"\",\"evidence\":[]}"}
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
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-coordinator/durable"
)

var at = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(2)
	}
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func event(stage string) durable.RunEvent {
	return durable.RunEvent{Stage: stage, At: at, Attempt: "a"}
}

func open(root string) *durable.RunStore {
	s, err := durable.OpenRunStore(root)
	check(err)
	return s
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

func stages(r durable.RunRecord) []string {
	out := []string{}
	for _, e := range r.Events {
		out = append(out, e.Stage)
	}
	return out
}

// tail judges the retained events of writers that each appended <prefix>-0 .. <prefix>-(n-1) in
// order: no stage twice, only stages the writers appended, and per writer a run of its newest
// events in the order they were appended.
func tail(events []durable.RunEvent, prefixes []string, n int) map[string]any {
	seen := map[string]bool{}
	distinct, knownStages := true, true
	per := map[string][]int{}
	for _, e := range events {
		if seen[e.Stage] {
			distinct = false
		}
		seen[e.Stage] = true
		i := strings.LastIndex(e.Stage, "-")
		if i < 0 {
			knownStages = false
			continue
		}
		j, err := strconv.Atoi(e.Stage[i+1:])
		p := e.Stage[:i]
		valid := false
		for _, q := range prefixes {
			valid = valid || q == p
		}
		if err != nil || !valid || j < 0 || j >= n {
			knownStages = false
			continue
		}
		per[p] = append(per[p], j)
	}
	newest := true
	for _, js := range per {
		for k, j := range js {
			if j != n-len(js)+k {
				newest = false
			}
		}
	}
	return map[string]any{"distinct": distinct, "known_stages": knownStages, "newest_tail_per_writer": newest}
}

type proc struct {
	cmd *exec.Cmd
	in  io.WriteCloser
	out *bufio.Reader
}

func start(env ...string) *proc {
	exe, err := os.Executable()
	check(err)
	cmd := exec.Command(exe)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stderr = os.Stderr
	in, err := cmd.StdinPipe()
	check(err)
	out, err := cmd.StdoutPipe()
	check(err)
	check(cmd.Start())
	return &proc{cmd: cmd, in: in, out: bufio.NewReader(out)}
}

func (p *proc) line() string {
	l, err := p.out.ReadString('\n')
	check(err)
	return strings.TrimSuffix(l, "\n")
}

func (p *proc) expect(want string) {
	if got := p.line(); got != want {
		check(fmt.Errorf("helper printed %q, want %q", got, want))
	}
}

// holder starts a helper process that holds an exclusive flock on <root>/<id>.lock until its
// standard input is closed or it is killed.
func holder(root, id string) *proc {
	p := start("RUN_HELPER=hold", "RUN_ROOT="+root, "RUN_ID="+id)
	p.expect("LOCKED")
	return p
}

func helper() {
	root, id := os.Getenv("RUN_ROOT"), os.Getenv("RUN_ID")
	switch os.Getenv("RUN_HELPER") {
	case "hold":
		f, err := os.OpenFile(filepath.Join(root, id+".lock"), os.O_RDWR|os.O_CREATE, 0o644)
		check(err)
		check(syscall.Flock(int(f.Fd()), syscall.LOCK_EX))
		fmt.Println("LOCKED")
		io.Copy(io.Discard, os.Stdin)
	case "append":
		s := open(root)
		n, err := strconv.Atoi(os.Getenv("RUN_COUNT"))
		check(err)
		fmt.Println("READY")
		_, err = bufio.NewReader(os.Stdin).ReadString('\n')
		check(err)
		errs, first := 0, ""
		for j := 0; j < n; j++ {
			if err := s.Append(id, event(fmt.Sprintf("%s-%d", os.Getenv("RUN_PREFIX"), j))); err != nil {
				errs++
				if first == "" {
					first = err.Error()
				}
			}
		}
		out, err := json.Marshal(map[string]any{"errors": errs, "first_error": first})
		check(err)
		fmt.Println("RESULT " + string(out))
	default:
		check(fmt.Errorf("unknown helper %q", os.Getenv("RUN_HELPER")))
	}
}

func main() {
	if os.Getenv("RUN_HELPER") != "" {
		helper()
		return
	}
	base, err := os.MkdirTemp("", "run-store-driver-")
	check(err)
	defer os.RemoveAll(base)
	root := filepath.Join(base, "records")
	s := open(root)
	result := map[string]any{}
	switch os.Getenv("DRIVER_CASE") {
	case "goroutines":
		var mu sync.Mutex
		var wg sync.WaitGroup
		errs, first := 0, ""
		begin := make(chan struct{})
		prefixes := []string{}
		for g := 0; g < 8; g++ {
			prefixes = append(prefixes, fmt.Sprintf("g%d", g))
			wg.Add(1)
			go func(g int) {
				defer wg.Done()
				<-begin
				for j := 0; j < 25; j++ {
					if err := s.Append("many", event(fmt.Sprintf("g%d-%d", g, j))); err != nil {
						mu.Lock()
						errs++
						if first == "" {
							first = err.Error()
						}
						mu.Unlock()
					}
				}
			}(g)
		}
		close(begin)
		wg.Wait()
		r, err := s.Read("many")
		check(err)
		result = tail(r.Events, prefixes, 25)
		result["errors"], result["first_error"] = errs, first
		result["events"], result["omitted"] = len(r.Events), r.Omitted
		result["events_plus_omitted"] = uint64(len(r.Events)) + r.Omitted
	case "processes":
		helpers := []*proc{}
		for k := 0; k < 2; k++ {
			p := start("RUN_HELPER=append", "RUN_ROOT="+root, "RUN_ID=shared", fmt.Sprintf("RUN_PREFIX=p%d", k), "RUN_COUNT=50")
			p.expect("READY")
			helpers = append(helpers, p)
		}
		for _, p := range helpers {
			_, err := io.WriteString(p.in, "go\n")
			check(err)
		}
		results := []any{}
		for _, p := range helpers {
			l := p.line()
			var res any
			check(json.Unmarshal([]byte(strings.TrimPrefix(l, "RESULT ")), &res))
			results = append(results, res)
			p.in.Close()
			check(p.cmd.Wait())
		}
		r, err := s.Read("shared")
		check(err)
		result = tail(r.Events, []string{"p0", "p1"}, 50)
		result["helpers"] = results
		result["events"], result["omitted"] = len(r.Events), r.Omitted
		result["events_plus_omitted"] = uint64(len(r.Events)) + r.Omitted
	case "finish-race":
		var mu sync.Mutex
		var wg sync.WaitGroup
		errs, first, finishErr := 0, "", ""
		begin := make(chan struct{})
		for j := 0; j < 20; j++ {
			wg.Add(1)
			go func(j int) {
				defer wg.Done()
				<-begin
				if err := s.Append("fin", event(fmt.Sprintf("e-%d", j))); err != nil {
					mu.Lock()
					errs++
					if first == "" {
						first = err.Error()
					}
					mu.Unlock()
				}
			}(j)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-begin
			finishErr = errText(s.Finish("fin", "done", "raced", []string{"attempts/fin"}))
		}()
		close(begin)
		wg.Wait()
		r, err := s.Read("fin")
		check(err)
		got := stages(r)
		sort.Strings(got)
		result = map[string]any{
			"append_errors": errs, "first_error": first, "finish_error": finishErr,
			"sorted_stages": got, "omitted": r.Omitted,
			"outcome": r.Outcome, "reason": r.Reason, "evidence": r.Evidence,
		}
	case "held-then-dead":
		p := holder(root, "held")
		restore := overrideWait(300 * time.Millisecond)
		t := time.Now()
		appendErr := s.Append("held", event("while-held"))
		appendTook := time.Since(t)
		t = time.Now()
		finishErr := s.Finish("held", "done", "while held", nil)
		finishTook := time.Since(t)
		_, statErr := os.Stat(filepath.Join(root, "held.json"))
		restore()
		check(p.cmd.Process.Kill())
		p.cmd.Wait()
		t = time.Now()
		deadErr := s.Append("held", event("after-dead"))
		deadTook := time.Since(t)
		r, err := s.Read("held")
		check(err)
		ids, err := s.List()
		check(err)
		within := func(d time.Duration) bool { return d >= 300*time.Millisecond && d < 2300*time.Millisecond }
		result = map[string]any{
			"default_wait":            defaultWait(),
			"append_error":            errText(appendErr),
			"append_waited_the_wait":  within(appendTook),
			"finish_error":            errText(finishErr),
			"finish_waited_the_wait":  within(finishTook),
			"record_written_while_held": statErr == nil,
			"after_dead_error":        errText(deadErr),
			"after_dead_under_1s":     deadTook < time.Second,
			"stages":                  stages(r),
			"outcome":                 r.Outcome,
			"folder":                  names(root),
			"list":                    ids,
		}
	case "independent":
		p := holder(root, "a")
		restore := overrideWait(5 * time.Second)
		defer restore()
		aDone := make(chan error, 1)
		go func() { aDone <- s.Append("a", event("a-0")) }()
		time.Sleep(200 * time.Millisecond)
		bErrs, bFirst := 0, ""
		for j := 0; j < 10; j++ {
			if err := s.Append("b", event(fmt.Sprintf("b-%d", j))); err != nil {
				bErrs++
				if bFirst == "" {
					bFirst = err.Error()
				}
			}
		}
		var aErr error
		aWaiting := false
		select {
		case aErr = <-aDone:
		default:
			aWaiting = true
		}
		p.in.Close()
		check(p.cmd.Wait())
		if aWaiting {
			aErr = <-aDone
		}
		ra, err := s.Read("a")
		check(err)
		rb, err := s.Read("b")
		check(err)
		result = map[string]any{
			"a_still_waiting_when_b_finished": aWaiting,
			"a_error":                         errText(aErr),
			"a_stages":                        stages(ra),
			"b_errors":                        bErrs,
			"b_first_error":                   bFirst,
			"b_stages":                        stages(rb),
		}
	case "error-paths":
		restore := overrideWait(300 * time.Millisecond)
		defer restore()
		calls := []string{}
		record := func(err error) { calls = append(calls, errText(err)) }
		record(s.Append("e", event(strings.Repeat("x", 70000))))
		record(s.Append("e", event("first")))
		record(s.Finish("e", "", strings.Repeat("x", 70000), nil))
		record(s.Append("e", event("second")))
		check(os.WriteFile(filepath.Join(root, "e.json"), []byte("bad json"), 0o644))
		record(s.Append("e", event("third")))
		record(s.Finish("e", "done", "corrupt", nil))
		check(os.Remove(filepath.Join(root, "e.json")))
		record(s.Append("e", event("fourth")))
		record(s.Append("../escape", event("x")))
		record(s.Finish("x.y", "", "", nil))
		raw, err := os.ReadFile(filepath.Join(root, "e.json"))
		check(err)
		ids, err := s.List()
		check(err)
		result = map[string]any{
			"errors": calls,
			"record": string(raw),
			"folder": names(root),
			"outside": names(base),
			"list":   ids,
		}
	default:
		check(fmt.Errorf("unknown case %q", os.Getenv("DRIVER_CASE")))
	}
	out, err := json.Marshal(result)
	check(err)
	fmt.Println("RUN_RESULT=" + string(out))
}
`;

const seamReal = String.raw`
package main

import (
	"time"

	"github.com/KogenAI/kogen-coordinator/durable"
)

func overrideWait(d time.Duration) func() { return durable.OverrideRunLockWait(d) }

func defaultWait() string { return durable.RunLockWait.String() }
`;

const seamNone = String.raw`
package main

import "time"

// durable.OverrideRunLockWait and durable.RunLockWait do not exist in this tree.
func overrideWait(d time.Duration) func() { return func() {} }

func defaultWait() string { return "" }
`;

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// runCase builds the driver in a temporary folder of the module and returns one case's observation.
function runCase(name) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), driver);
    fs.writeFileSync(path.join(dir, 'seam.go'), seamReal);
    const binary = path.join(dir, 'run-store-driver');
    const buildCommand = `go build -o ${binary} ./${path.basename(dir)}`;
    const goBuild = () => {
      const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
        encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
      });
      return { status: build.status, signal: build.signal, output: (build.stdout || '') + (build.stderr || '') };
    };
    let build = goBuild();
    if (build.status !== 0 && /undefined: durable\.(OverrideRunLockWait|RunLockWait)/.test(build.output)) {
      // Today's tree has no lock wait: build with a do-nothing seam.
      fs.writeFileSync(path.join(dir, 'seam.go'), seamNone);
      build = goBuild();
    }
    assert.equal(build.status, 0, `${buildCommand} exited ${build.status} ${build.signal || ''}: ${build.output}`);
    const result = cp.spawnSync(binary, [], {
      encoding: 'utf8', timeout: 240000, env: { ...gitFreeEnv(), DRIVER_CASE: name }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, `${binary} (DRIVER_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
    const rows = output.split('\n').filter(s => s.startsWith('RUN_RESULT='));
    assert.equal(rows.length, 1, `${binary} (DRIVER_CASE=${name}) must print exactly one RUN_RESULT line: ${output}`);
    return JSON.parse(rows[0].slice('RUN_RESULT='.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');

  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    this.runStoreObservation = runCase(name);
  });

  Then(SLUG + ': the observation is', function (docString) {
    observe(this.runStoreObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'run' && CASES.includes(process.argv[3])) {
    console.log(JSON.stringify(runCase(process.argv[3])));
  } else if (kind === 'good' || kind === 'bad') {
    control(kind);
  } else {
    console.log('usage: good|bad|run <case>');
    process.exit(2);
  }
} else {
  register();
}
