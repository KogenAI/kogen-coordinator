# Bound the restarts after a drifted approval

Slug: coord-route-bounds-drifted-approval-restarts
Model: not applicable — the change adds one counter to an existing linear routine; the counter lives in one call and carries no state across calls or processes
Acceptance:
- .kogen/intents/coord-route-bounds-drifted-approval-restarts/acceptance.feature
- features/steps/coord-route-bounds-drifted-approval-restarts__driver.js

`route.Cycle[E, A](ctx, s, builderPass) (feedback string, landed bool, err error)` and `route.Resume[E, A](ctx, s, stage) error` (`route/route.go`) restart the cycle with a fresh verification and a fresh review whenever an approval's `Commit(ctx, approval, true)` reports a drifted candidate: `Cycle` sets `builderPass = false` and loops again, and `Resume`, when its own commit drifts, calls `Cycle(ctx, s, false)`. Nothing limits how many times: a candidate that keeps changing between approval and commit repeats a verification and a model review for the life of the run, with no explanation.

After this change:

- The package has a named constant `MaxDriftRestarts = 3` (`route/route.go`, the only new exported name).
- `Cycle` counts the drifted approvals within one call. After the third drifted approval it returns `("", false, err)` with `err` text exactly `candidate changed after review 3 times before the commit; the last verification evidence is kept`, and starts no fourth verification. The three drifted approvals each ran Verify, Review and Commit once, so a candidate that always drifts gives Verify 3 times, Review 3 times and Commit 3 times.
- One or two drifts followed by a landed commit behave exactly as today: `landed` true, with `builderPass = false` for each restart verification (the first Verify keeps the caller's `builderPass`). A landed commit, a red candidate, a step error or any other outcome is returned as today.
- The count belongs to one call of `Cycle`: two separate calls each start at zero, and no state is kept at package level or across processes.
- `Resume` passes the count through: a resumed commit that drifts counts as the first drifted approval, so the `Cycle(ctx, s, false)` it runs after that drift allows at most 2 more restarts before returning the same error (3 `Commit` calls in total: one in `Resume`, two in the inner cycle). `Resume` returns that error unwrapped. The existing error `candidate changed after review in a resumed commit: <feedback>` for a red candidate after a drift stays as it is.
- The cancellation checks pinned by the Intent coord-route-honours-cancellation stay: a context cancelled during a drifted commit still ends the cycle with the context error (unwrapped) and starts no further verification.

Boundaries: no change to `route.Steps`, to the order of steps, to the `builderPass` values, to what drifted means, to error values returned by the steps (returned unwrapped), or to the package's use of the context. No setting, flag or environment variable is added.

Acceptance builds (`go build -o`) and runs a Go driver that the step file generates in a temporary dot-prefixed folder of the module (removed when the acceptance process exits). The driver drives a scripted fake `route.Steps[string, string]` whose step calls are traced in order with the trace lines of `route/route_test.go` (`verify builder=yes|no`, `review <evidence>`, `continue`, `commit <approval>`). The fake returns the error `fake: runaway` at its ninth Verify so that a routing with no bound ends instead of looping. Cycle cases call `route.Cycle` with `builderPass` true; the Resume cases resume at `route.StageReview` with a reviewer that can continue its session.

## Decisions
- MaxDriftRestarts = 3 per call of Cycle and Resume, fixed constant (decision: D1, round 1) (constraint: no setting) (constraint: only new exported name) (evidence: route/route.go) (assumption: Probes in a scratch copy outside the checkout (not Kogen records) showed the counted implementation matches all driver expectations and go test ./route passes.) (source: request)
- Resume hands count 1 to an unexported cycle helper; error returned unwrapped (decision: D2, round 1) (evidence: route/route.go) (assumption: none beyond scratch observation) (source: request)
- The error after the third drifted approval has the exact text `candidate changed after review 3 times before the commit; the last verification evidence is kept`, returned from `Cycle` as `("", false, err)`; the red-candidate error after a resumed drift is unchanged (evidence: route/route.go) (assumption: none beyond scratch observation) (source: request)
- The cancellation checks pinned by coord-route-honours-cancellation are unchanged, and a context cancelled during a drifted commit keeps the context error (evidence: .kogen/intents/coord-route-honours-cancellation/intent.md; route/route.go) (assumption: none beyond scratch observation) (source: request)
- The error after the third drifted approval has the exact text, returned from Cycle as ("", false, err); the red-candidate error after a resumed drift is unchanged (decision: D3, round 1) (evidence: route/route.go) (assumption: none beyond scratch observation) (source: request)
- The cancellation checks pinned by coord-route-honours-cancellation are unchanged; a context cancelled during a drifted commit keeps the context error (decision: D4, round 1) (evidence: .kogen/intents/coord-route-honours-cancellation/intent.md; route/route.go) (assumption: none beyond scratch observation) (source: request)

## Source comparison
- Expected 1 (Cycle stops after the third drifted approval with the exact text; one or two drifts then a landed commit unchanged): scenarios "A Cycle whose approvals always drift stops after the third drifted approval" (3 Verify, 3 Review, 3 Commit) and "A Cycle that drifts twice and then lands still lands" (builder yes, no, no). The restart with `builderPass = false` and one restart then a landed commit (the scenario `cycle-drifted-once` of coord-route-honours-cancellation) stay unchanged.
- Request acceptance 3 (count per call): scenario "The drift count belongs to one Cycle call".
- Expected 2 and request acceptance 4 (Resume counts its first drift; 3 Commit calls in total, with the inner `Cycle(ctx, s, false)`): scenario "A resumed commit that drifts counts as the first drifted approval"; the unchanged resumed-commit error for a red candidate: scenario "A resumed drifted commit followed by a red candidate keeps its existing error".
- Expected 3 and request acceptance 5 (cancellation checks stay): scenario "A drifted commit during which the run is cancelled keeps the cancellation error".
- Request acceptance 1's "5 s guard" and its wrong implementations: replaced by the driver's `fake: runaway` guard at the ninth Verify; the wrong implementations are controls.json.
- Request Observed (no counter today; Resume inherits the unbounded loop): replaced by the counter described above.

## Tests
- `Cycle` stops after the third drifted approval with the exact error, Verify, Review and Commit called 3 times each: new test TestCycleStopsAfterThreeDriftedApprovals in `route/route_test.go` (unit)
- Two drifts then a landed commit lands, Verify called 3 times, builderPass true only in the first call: new test TestCycleLandsAfterTwoDrifts in `route/route_test.go` (unit)
- The drift count restarts at zero for each call of `Cycle`: new test TestCycleDriftCountResetsPerCall in `route/route_test.go` (unit)
- `Resume` at the review stage with an always-drifting Commit returns the same error after 3 Commit calls in total: new test TestResumeCountsItsFirstDrift in `route/route_test.go` (unit)
- A drifted commit during which the context is cancelled returns the unwrapped context error and starts no further Verify: new test TestCycleDriftThenCancelKeepsCancellationError in `route/route_test.go` (unit)
- The requested behavior through the public `route.Cycle`/`route.Resume` entry points in a separate program: acceptance scenarios with the generated driver (scenario)
- Uncancelled routing with at most two drifts and the resumed-commit error are unchanged: existing `TestCycle*`, `TestResume*` in `route/route_test.go` and `TestRouteCycleAndResume` in `contract/route_test.go`, unchanged (existing)

## Feasibility
- Scratch copies of HEAD outside the checkout (external-session observations, not Kogen probe records): the generated driver builds in a dot-prefixed folder of the module. On today's code the always-drifting cases run until the fake's runaway guard (the ninth Verify) and return `fake: runaway`; with a candidate that counts drifts per call and hands the count 1 from `Resume` it observes exactly the outcomes the feature expects, and `go test ./route` passes unchanged. The step file's recorded known-good and known-bad observations come from those two runs.
- evidence: {"id":"route-drift-driver-observer","kind":"observer","inputs":[".kogen/intents/coord-route-bounds-drifted-approval-restarts/acceptance.feature"],"observers":["features/steps/coord-route-bounds-drifted-approval-restarts__driver.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/coord-route-bounds-drifted-approval-restarts__driver.js good","exit":0,"output":"accepted cycle-always-drifted\naccepted cycle-lands-after-two-drifts\naccepted cycle-drift-count-resets-per-call\naccepted resume-always-drifted\naccepted cycle-drift-then-cancel\naccepted resume-drift-then-red\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/coord-route-bounds-drifted-approval-restarts__driver.js bad","exit":1,"output":"rejected cycle-always-drifted\naccepted cycle-lands-after-two-drifts\naccepted cycle-drift-count-resets-per-call\nrejected resume-always-drifted\naccepted cycle-drift-then-cancel\naccepted resume-drift-then-red\n"}]}
