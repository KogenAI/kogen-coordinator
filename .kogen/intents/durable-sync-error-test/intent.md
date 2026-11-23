# Test that Sync returns the flush error

Slug: durable-sync-error-test
Model: not applicable — the change adds a test of a stateless pass-through call
Acceptance:
- .kogen/intents/durable-sync-error-test/acceptance.feature
- features/steps/durable-sync-error-test__mutants.js

`durable.Sync(f)` returns `f.Sync()`'s error, but the existing tests close a file only while syncing is skipped, so no test shows a real flush error reaching the caller. This change adds one focused regression test to `durable/durable_test.go`. It changes no production code, sync policy or test seam, and replaces or removes nothing.

The test closes a file and then checks both outcomes: with syncing enabled `Sync` on the closed file returns a non-nil error, and with syncing skipped (`SkipSyncInTests` state) `Sync` on the same closed file still returns nil. It restores the enabled state when it ends.

Acceptance runs the package's own tests in a temporary copy of the module against the unmodified `durable/durable.go` (they must pass) and against two wrong `Sync` implementations (they must fail): one that swallows the flush failure and returns nil, and one that returns the flush error while syncing is skipped.

## Decisions
- The new test lives in `durable/durable_test.go` and asserts a non-nil error from `Sync` on a closed file with syncing enabled (evidence: durable/durable.go; durable/durable_test.go) (source: request)
- The same test asserts that `Sync` on a closed file still returns nil while syncing is skipped, and it restores the enabled state afterwards (evidence: durable/durable_test.go) (source: request)
- Production code, sync policy and test seams are unchanged; the test uses the package-internal `skip` flag already used by the existing test (evidence: durable/durable.go; durable/durable_test.go) (source: request)
- Acceptance observes the behaviour of the package tests against wrong implementations instead of naming the new test (evidence: durable/durable.go) (assumption: go and the module's dependencies are available where acceptance runs, as for the project's go-test check) (source: request)
- The regression test is a new function in durable/durable_test.go that closes a file, calls Sync with syncing enabled and requires a non-nil error, then switches syncing off and requires nil for the same closed file; no change to durable/durable.go, the sync policy or the test seams (decision: D1, round 1) (constraint: only durable/durable_test.go changes outside the Intent) (constraint: skip is restored to false with t.Cleanup) (evidence: durable/durable.go; durable/durable_test.go) (assumption: A closed os.File makes f.Sync() return an error on every supported platform; observed only with go1.27.2 on darwin/arm64 in an external scratch run) (source: request)
- Acceptance runs the real durable tests in a temporary copy of the module against the unmodified durable.go and two wrong Sync implementations (swallowing the flush error; reporting the flush error while skipped) and requires the tests to fail with a '--- FAIL' line on both, so it names no test the Build must invent (decision: D2, round 1) (evidence: durable/durable.go; durable/durable_test.go; features/steps/approval-slug-binding__driver.js) (assumption: Needs go on PATH and the module's dependencies in the Go module cache, as for the project's own go-test check) (source: request)

## Source comparison
- Acceptance 1 (closed file, syncing enabled, non-nil error; a swallowing implementation fails): scenario "The durable tests fail when Sync swallows the flush error".
- Acceptance 2 (closed file, skipped sync, nil; reporting an error while skipped fails): scenario "The durable tests keep the skipped closed-file case returning nil", which also requires the tests to pass on the unmodified source and already holds on the unchanged tree.
- Out of scope (sync policy, test seams): no production file is edited.

## Tests
- Sync returns the underlying flush error for a closed file with syncing enabled: new test in `durable/durable_test.go` (unit)
- Sync returns nil for a closed file while syncing is skipped: the same new test; the existing first test in `durable/durable_test.go` also covers it (unit)
- The tests distinguish both wrong implementations from the real one: scenarios in the acceptance feature (scenario)

## Feasibility
- Scratch runs outside the repository (external-session observations, not Kogen probe records): the existing durable tests pass, a closed file makes `f.Sync()` fail, the existing tests do not catch a swallowing `Sync`, and the existing first test already catches a `Sync` that returns the flush error while skipped.
- evidence: {"id":"mutants-observer","kind":"observer","inputs":[".kogen/intents/durable-sync-error-test/acceptance.feature"],"observers":["features/steps/durable-sync-error-test__mutants.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/durable-sync-error-test__mutants.js good","exit":0,"output":"accepted both-checks\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/durable-sync-error-test__mutants.js bad","exit":1,"output":"rejected no-enabled-check\nrejected no-skipped-check\nrejected failing-test\n"}]}
