# Record check baseline wall time and stop reason

Slug: k-coord-baseline-wall
Model: not applicable — RunCheckBaseline is one ordered pass over the configured checks that keeps no state between calls and has no retry or interacting rule
Acceptance:
- .kogen/intents/k-coord-baseline-wall/acceptance.feature
- features/steps/k-coord-baseline-wall__driver.js

Before any edit, Kogen runs the project's own checks as the protected baseline. On a loaded host this baseline can use most of a run's wall time (three Studio cells were lost at the start: the baseline `bin/rails test` took 1,392-2,104 s on the loaded Studio against 50-60 s on eu2; aorctl-st2rr r1 was interrupted at 2,757 s of build with 10 requests, aorctl-st2 entropy r3 had no result, and the 3600 s cell deadline killed each as a build `timeout`). Its duration is recorded nowhere a reader looks, so a run the baseline starved ends as a plain build `timeout` and the user looks for the cause in the build. This fix gives the coordinator a check-baseline record that carries its own start and end instants and the wall time of each check, and a stop that names the baseline and the running check when the run ends during it. Bounds and what the baseline decides do not change.

Today `project/baseline.go` holds only the approval baseline (`Baseline`, `FormerBaseline`, `Protected`, `Hash`, `HashWithUnreadable`, approvals); nothing in this module runs or records the check baseline. The change adds, in `project/baseline.go` only (package `project`, imports `context` and `time` added):

```go
type CheckResult struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Status  int    `json:"status"`
	Output  string `json:"output"`
}

type CheckTiming struct {
	Name      string    `json:"name"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at"`
	WallMS    int64     `json:"wall_ms"`
}

type CheckBaseline struct {
	Checks    []CheckResult `json:"checks"`
	StartedAt time.Time     `json:"started_at"`
	EndedAt   time.Time     `json:"ended_at"`
	WallMS    int64         `json:"wall_ms"`
	Timings   []CheckTiming `json:"timings"`
}

type CheckRunner func(ctx context.Context, c Check) (status int, output string, err error)

type BaselineStop struct {
	Check     string
	Command   string
	StartedAt time.Time
	StoppedAt time.Time
	WallMS    int64
	Err       error
}

func (s *BaselineStop) Error() string
func (s *BaselineStop) Unwrap() error // returns Err

func RunCheckBaseline(ctx context.Context, checks []Check, run CheckRunner) (CheckBaseline, error)
```

Rules of `RunCheckBaseline`:
1. It takes the baseline's start instant, then for each check in the given order takes the check's start instant, calls `run(ctx, c)` once, and takes the check's end instant when `run` returns. `CheckTiming.WallMS` is the elapsed time between the check's start and end as a whole number of milliseconds (`time.Duration.Milliseconds`, measured with the monotonic clock); `CheckBaseline.WallMS` likewise between the baseline's start and end. Every stored instant is UTC (`.UTC()`), so its JSON form ends in `Z` (D9).
2. What the baseline decides is unchanged by timing: each completed check appends `CheckResult{Name: c.Name, Command: c.Run, Status: status, Output: output}` exactly as `run` returned them, and its `CheckTiming` in the same position. A nonzero status is recorded and the next check runs (D10). `Checks` and `Timings` are never nil (empty input gives `[]` in JSON, D9); the baseline's end is taken after the last check.
3. When `ctx.Err()` is non-nil once a check's `run` returns (whatever `run` returned), the baseline stops: no later check runs, the record holds only the checks completed before that one and ends at that check's end instant, and the error is `&BaselineStop{Check: c.Name, Command: c.Run, StartedAt: <check start>, StoppedAt: <check end>, WallMS: <check wall ms>, Err: ctx.Err()}`. `Error()` is exactly `stopped during the check baseline: check <Check> (<Command>) ran <WallMS> ms: <Err>` (D11). `errors.Is(err, context.DeadlineExceeded)` (or `context.Canceled`) holds through `Unwrap`, but the returned error is never the bare context error, so a caller no longer sees a plain timeout (D12).
4. When `run` returns a non-nil error while `ctx` is still live, that error is returned unchanged with the record of the checks completed before it, ending at that check's end instant (D13).
5. `RunCheckBaseline` adds no timeout, wait, retry or bound of its own: the caller's context is the only bound.

Boundaries: every existing output of `project/baseline.go` stays byte-identical: `Baseline`, `FormerBaseline`, `Protected` and its `ProtectDiagnostics`, `Hash`, `HashWithUnreadable`, `Approval` and its read, encode and write. The golden files under `project/testdata/` and `contract/testdata/baseline.json` are not regenerated. Scope is `project/baseline.go` and its test (a new `project/baseline_test.go`) only; `durable/`, `project/detect.go`, the Intent validators, `route/`, `contract/` and `README.md` are not touched. No dependency is added.

Acceptance builds (`go build -o`) and runs a Go driver that the step file generates in a temporary dot-prefixed folder of the module (removed when the acceptance process exits). Its runner runs each check's command with `sh -c` in its own process group, killed when the context ends (`exec.CommandContext` with `Setpgid`, a group-kill `Cancel` and a 1 s `WaitDelay`); a nonzero exit while the context is live is a status, anything else is returned as the runner's error.

## Decisions
- Add the check baseline to project/baseline.go as RunCheckBaseline with a caller-supplied CheckRunner, the test seam; the coordinator gains no command runner of its own (decision: D1, round 1) (evidence: project/baseline.go; route/route.go; durable/run_store.go) (source: request)
- The record is CheckBaseline with JSON keys checks, started_at, ended_at, wall_ms and timings, each CheckTiming has name, started_at, ended_at and wall_ms, instants are UTC, wall times are whole milliseconds on the monotonic clock, and checks and timings are never nil (decision: D2, round 1) (assumption: no consumer reads this record yet; the key names follow the baseline timing keys Kogen's Build already writes outside this repository) (source: request)
- What the baseline decides is unchanged: every check runs once in the given order, CheckResult keeps name, command, status and output exactly as the runner returned them, and a nonzero status is recorded while the next check still runs (decision: D3, round 1) (evidence: project/config.go; project/baseline.go) (source: request)
- When the context has ended once a check's run returns, RunCheckBaseline stops with a BaselineStop error naming the baseline and that check, unwrapping to the context error and never the bare context error, and returns the record of the checks completed before it (decision: D4, round 1) (assumption: the exact stop text follows the stop line Kogen's Build already prints outside this repository; no caller in this repository maps it to a run outcome) (source: request)
- Bounds do not change: RunCheckBaseline adds no timeout, wait or retry, the caller's context is the only bound, no later check runs after a stop, and a runner error while the context is live is returned unchanged (decision: D5, round 1) (evidence: route/route.go) (source: request)
- Every existing approval-baseline output stays byte-identical, and the project and contract golden files are not regenerated (decision: D6, round 1) (evidence: project/baseline.go; contract/baseline_test.go; contract/testdata/baseline.json) (source: request)
- The change is limited to project/baseline.go and a new project/baseline_test.go; durable, detect.go, the Intent validators, route, contract and README.md are not touched (decision: D7, round 1) (evidence: project/baseline.go; project/config.go) (source: request)
- Acceptance uses a generated Go driver with a real process-group runner, a 500 ms run deadline and a sleep 5 check as the deliberately slow check (decision: D8, round 1) (evidence: features/steps/coord-route-honours-cancellation__driver.js) (source: request)
- Stored instants are UTC so their JSON form ends in Z, and an empty check list gives empty checks and timings arrays (decision: D9, round 2) (assumption: the user confirms UTC instants in Go's JSON time form and empty arrays for an empty check list) (source: request)
- A check that exits nonzero is recorded and the next check still runs, as the unchanged baseline decision (decision: D10, round 2) (assumption: the user confirms that the existing check baseline records a failing check and keeps running the next one) (source: request)
- The stop text names the check baseline, the check, its command, its wall time in milliseconds and the context error, in the exact wording of rule 3 (decision: D11, round 2) (assumption: the user confirms the wording stopped during the check baseline: check NAME, its command in parentheses, ran N ms, then the context error) (source: request)
- The stop unwraps to the context error so errors.Is still reports a deadline or a cancel, while the returned error is never the bare context error (decision: D12, round 2) (assumption: the user confirms that callers may still detect the deadline through errors.Is) (source: request)
- A runner error while the context is live is returned unchanged with the record of the checks completed before it, ending at that check's end (decision: D13, round 2) (assumption: the user confirms that execution errors keep their own stop and carry the partial record) (source: request)
- Roughly means the per-check wall times exceed the baseline's by at most 2 ms and fall short of it by at most 200 ms (decision: D14, round 2) (assumption: the user confirms the 2 ms and 200 ms tolerances) (source: request)

## Source comparison
- Problem and diagnosed failure (baseline duration recorded nowhere; Studio `bin/rails test` 1,392-2,104 s vs 50-60 s on eu2; aorctl-st2rr r1 interrupted at 2,757 s with 10 requests; aorctl-st2 entropy r3 no result; 3600 s cell deadline reported as build `timeout`): kept as the motivation in the prose; the coordinator cannot reproduce the Studio host, so the reproduction is the scenario "A deadline that expires during a slow baseline check stops the run naming the baseline and that check" (D4, D5, D8).
- Need "the baseline record carries its own start and end instants and the wall time of each check": rules 1-2 and the `CheckBaseline`/`CheckTiming` types (D1, D2, D9); scenario "A completed baseline records its start, end and the wall time of each check".
- Need "when a run ends while the baseline is still running, its stop reason names the baseline": rule 3, `BaselineStop` and its text (D4, D11, D12).
- Need "bounds and what the baseline decides do not change": rules 2, 4 and 5 (D3, D5, D10, D13); the complete scenario pins the decided checks exactly, including a check that exits 3 followed by one that still runs.
- Need "Scope: project/baseline.go (+ its test/golden) only; does not touch durable/, detect.go or the Intent validators": D7 and the Boundaries paragraph; no golden changes (D6).
- Acceptance 1 "start, end and per-check wall time, adding up to roughly the baseline's total": scenario 1, with the tolerance of D14.
- Acceptance 2 "deadline expires during a deliberately slow baseline check (test seam): stop reason names the baseline and the running check, not a build timeout": scenario 2, with the runner as the seam, a 500 ms deadline and `sleep 5`; it also checks that the error is not the bare `context.DeadlineExceeded`.
- Acceptance 3 "what the baseline decides and every other baseline output field stay byte-identical for existing fixtures": scenario 3 pins `Baseline` and `Hash` of the `acceptance` fixture of `contract/baseline_test.go` plus the team lineup file to today's values; the existing golden tests stay unchanged (D6); the decided check results are pinned exactly in scenario 1 (D3).
- Delivery note (every decision listed with its source and cited by the scenarios that depend on it): Decisions D1-D14 above; each scenario carries a `# Decisions:` comment.

## Tests
- The record carries the baseline's start, end and wall time and each check's start, end and wall time, in UTC, with check intervals inside the baseline in order and check wall times adding up to the baseline's: new test in `project/baseline_test.go` with a runner that sleeps per check (unit)
- What the baseline decides is unchanged: results equal the runner's returns in order, a nonzero status is recorded and the next check runs, and empty input gives non-nil empty `checks` and `timings`: new test in `project/baseline_test.go` (unit)
- A context that ends during a check yields a `*BaselineStop` naming that check with the exact text, unwrapping to `context.DeadlineExceeded` for a deadline and `context.Canceled` for a cancel, never the bare context error, with no later check run and the record of the completed checks: new test in `project/baseline_test.go` reproducing the starved-baseline failure with a slow check and a short deadline (regression)
- A runner error while the context is live is returned unchanged with the completed checks: new test in `project/baseline_test.go` (unit)
- End to end through the public API with real processes, a run deadline and a slow check: acceptance scenarios 1-3 with the generated driver (scenario)
- Existing approval-baseline outputs are byte-identical: `TestBaselineContractGolden` in `contract/baseline_test.go`, `TestIntentHashMatchesElixir` in `project/parity_test.go` and `TestGoldenIsCurrent` in `project/golden_test.go`, unchanged (existing)

## Feasibility
- Scratch exports of HEAD outside the checkout (external-session observations, not Kogen probe records): with a candidate `project/baseline.go` implementing the rules above, `go build ./...`, `go vet ./project` and `gofmt -l project` are clean, and the generated driver observes exactly the expectations of the three scenarios. A wrong candidate that returns the bare context error, starts every timing at the baseline's start and leaves the team lineup out of `Baseline` is rejected in all three scenarios. The step file's recorded known-good and known-bad driver results come from those two runs.
- evidence: {"id":"baseline-wall-observer","kind":"observer","inputs":[".kogen/intents/k-coord-baseline-wall/acceptance.feature"],"observers":["features/steps/k-coord-baseline-wall__driver.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/k-coord-baseline-wall__driver.js good","exit":0,"output":"accepted complete\naccepted deadline\naccepted approval\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/k-coord-baseline-wall__driver.js bad","exit":1,"output":"rejected complete\nrejected deadline\nrejected approval\n"}]}
