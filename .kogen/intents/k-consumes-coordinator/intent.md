# Pin coordinator dependency consumption

Slug: k-consumes-coordinator
Model: not applicable — this adds contract tests and an inventory, not application state
Acceptance:
- .kogen/intents/k-consumes-coordinator/acceptance.feature
- features/steps/k-consumes-coordinator__suite.js

Keep `contract/` as the provider contract and add `consumes/kogen-loop/` as the consumer contract. The only currently pinned Kogen dependency is `kogen-loop v0.0.0`, replaced by `github.com/KogenAI/kogen-loop v0.0.0-20261102055344-c6e2360290d4`. Do not change go.mod, go.sum, production Go code, commands, flags or options. No existing behavior or useful tests are removed. This work does not itself remove blanket consumer checks in other repositories.

## Decisions
- Write one suite per Kogen dependency, currently only `consumes/kogen-loop/`, against public exported producer APIs only. (source: request)
- Match contract/ isolation: synthetic temporary roots, no network, host paths, private helpers, model calls, sleeps, fixed ports or shared paths; deterministic tests with no skips or build constraints. Use only standard-library tools and the pinned producer. (source: request)
- Run the suite through ordinary `go test ./...`; keep contract/ intact. (source: request)

## Source comparison
- Addressed: request Problem and Need's two-sided ownership rule by retaining contract/ and adding consumes/kogen-loop/; the suite and inventory below express consumer reliance rather than the producer's entire API. Removing blanket checks elsewhere is omitted deliberately because the request asks for this repository's suite, not workflow changes elsewhere.
- Addressed: Need's every-use requirement by an exhaustive non-test Go use inventory in consumes/kogen-loop/README.md, mapping identifiers, methods and fields to production source locations and concrete asserting test names. The verification method and scope must be stated, including exclusion of test-only imports. No empty or compile-only rows satisfy behavioral reliance.
- Addressed: Need's public API, isolation and exact-consumption limits in Decisions and the required cases below; contract/README.md supplies existing fixture conventions, not additional producer behaviors to test.
- Addressed: Need's normal command and pinned versions via the executable scenarios. Preserve go.mod and go.sum exactly, existing provider tests and production behavior. No new command, flag or option is authorized.
- Addressed: supplied slug, Intent paths, direct features/steps naming and sentence prefix requirements through the Acceptance artifacts. No supplied reproducing examples or counterexamples exist for this feature.

## Required coverage

Derive the inventory from all non-test coordinator Go files, including inferred return members and receiver methods, not merely import names. Inspect source uses and public pinned dependency source with Go tooling; document how completeness was checked and map each row to assertions. At the current baseline all dependency imports are `kogen-loop/sys`:

- `sys.Fail`, `sys.Error`, and its `Class`, `Reason`, `Detail`, `Exit`, `Lines`: coordinator constructs structured refusals and appends diagnostic lines in project/config.go, intent.go, models.go, provenance.go and git/git.go, lock.go, commit.go. Assert construction preserves those values, the returned value implements error, and Lines supports the diagnostic accumulation actually used. Do not assert unused Render, AsError or provider metadata behavior simply because producer exposes it.
- `sys.Session`, `Session.Run`, `sys.Options.FinishOnInterrupt`, `sys.Options.KillGroupOnExit`, result `Status` and `Output`: git/commit.go runs shell commands in the explicit repository directory, consumes combined output and nonzero statuses, waits out interrupted commits, and requests process-group cleanup. Assert the successful and failing command results and the two requested lifecycle guarantees using local bounded, synchronized subprocess fixtures. Use public session construction and interruption as fixture setup; do not widen the contract to unrelated session features. A real shell command must exercise Run, not a fake result.
- `Session.Err`: git/commit.go checks interruption after observing the landed commit. Assert nil before interruption and the interrupted error after interruption, without pinning unused formatting or signal variants. The comment mentioning sys.Interrupted is not by itself a runtime member use.
- `Session.Progress`: git/lock.go emits its stale-lock notice; assert the exact message passed by that caller reaches the configured stderr writer with the producer's newline convention. Writer/session setup is fixture plumbing, not additional production consumption.
- `sys.TmpPath`: git/commit.go and snapshot.go use fresh temporary file names for commit messages and indexes. Assert same-prefix calls give distinct usable absolute temporary paths with the supplied prefix and do not precreate the file; use test-owned temporary directory configuration, not a shared host path. Do not pin random bytes or unused suffix syntax.

These are minimum baseline uses, not permission to omit other actual non-test uses discovered by the completeness check. Do not add assertions for unrelated producer APIs. Prefer copied/adapted existing coordinator tests and fixtures, but the consumes suite must directly test the producer without importing coordinator packages, reading coordinator sources at test runtime, or calling private helpers. README inventory generation/inspection is development evidence, not a runtime dependency of the suite. Add a short README package-list entry linking the consumes suite and its inventory.

Lifecycle tests must have finite deadlines and cleanup on all exits, use local handshakes rather than sleeps, and not signal unrelated processes. Preserve contract/'s Git isolation if using Git fixtures (private HOME/config/hooks, fixture identity, disabled signing, no inherited GIT_* or KOGEN_* settings). Run the new suite with -race, -count=1 and -trimpath as well as through the normal whole-module command.

## Tests
- Each non-test producer API reliance is pinned with observable assertions and a complete source-to-test inventory: add focused consumes/kogen-loop tests and README inventory (integration)
- Consumer contracts run in the ordinary module test command at unchanged dependency pins: acceptance runs the exact suite and go test ./... (integration)
- Coordinator behavior and provider contracts remain unchanged: retain existing tests and run the configured checks, including existing contract/ tests (existing)

## Feasibility
- Local pinned-source inspection using go doc and the module-cache sys/error.go established the public session, options, result and error interfaces; no external protocol or current remote library facts are needed. The local probe exited 0 in 8.2 seconds and go test ./... passed. An earlier probe exited 0 in 1.5 seconds and observed TestConfigNotInitialized passing. These are discovery observations, not proof of the new suite's future assertions.
