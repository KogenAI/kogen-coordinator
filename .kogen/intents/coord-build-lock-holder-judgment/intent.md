# Report only real pids from the Build lock holder

Slug: coord-build-lock-holder-judgment
Model: not applicable — the change is two pure judgments of a lock file's content and a bound read through a seam, with no state machine
Acceptance:
- .kogen/intents/coord-build-lock-holder-judgment/acceptance.feature
- features/steps/coord-build-lock-holder-judgment__judgment.js

The holder judgment of the Build lock in git/lock.go and git/birth.go reports only real pids, and the bound of the `ps` fallback becomes testable. In the branch of `Acquire` where another holder has the flock, `LockResult.PID` is the recorded pid only when it is a positive decimal integer and `""` otherwise; `AcquireBuild` then refuses with exactly `environment/build_running: a Build is running in this repository (pid not recorded)` (exit 3); a recorded pid is printed as today; the status stays `Held`, the contender does not touch the file and the owner keeps the lock. `LockOwner` returns a pid only when it is a positive decimal integer and `""` otherwise; token and held are unchanged. `runPS` reads its bound from the unexported, mutex-guarded seam `overridePSBound(d time.Duration) (restore func())` / `psTimeout() time.Duration`, which follows `OverrideTimeouts`; `psBound` stays the 5-second production value (`const psBound = 5 * time.Second`) and the timeout message stays `ps -p <pid> timed out after <bound>`. TestPSFallbackIsBounded runs with a 200 ms bound, drops its `testing.Short()` skip and finishes in under 2 s. Nothing is removed. The lock format, flock semantics, `Release`, `Held`, the legacy (pid file and directory) judgment, the RemovedStale results and PIDs that TestLegacyOwnershipMetadata pins, and the `a Build is running in this repository (pid ` prefix stay as they are. No exported API, error class, setting or environment variable is added; no non-test code calls the seam; the process-group kill and `psWaitDelay` stay. `ProcessBirth`, `observeProcess` and the legacy lock judgment behave the same for every caller.

The tests of the change are the focused, model-free Go tests in the git package, next to TestAcquireBuildMessages and TestPSFallbackIsBounded in git/lock_test.go: lock tests hold the lock in-process on a second descriptor with `syscall.Flock(LOCK_EX|LOCK_NB)` (no helper process, no sleep), ps tests use the existing `fakeSleepingPS` and `writeLegacyLock` helpers. The acceptance feature and step file are only Kogen's executable gate over the same observable outcomes; they exercise the real functions through generated temporary Go test files and add no product code.

## Decisions
- Only digits-only text that parses to a number above zero counts as a pid; the check applies to the Held branch of Acquire and to every return of LockOwner, never to the RemovedStale paths. (evidence: git/lock.go) (source: request)
- The seam is a package variable guarded by a mutex with `overridePSBound` and `psTimeout`, copying OverrideTimeouts; `runPS` reads it once per call and reports that same value in its timeout message. (evidence: git/birth.go; git/deadline.go) (source: request)

## Source comparison
- Observed: `Lock.Acquire` creates `.kogen/local/build.lock` with `O_EXCL`, takes the flock, and only then writes `kogen-build-lock 1`, `pid <pid>` and `token <token>` (`Truncate(0)` then `WriteAt`); a contender in that window gets `EWOULDBLOCK` and reads the owner with `lockPID`, which falls back to `legacyPID`; empty content gives `PID: ""` and `AcquireBuild` formats `"a Build is running in this repository (pid "+res.PID+")"`, producing `environment/build_running: a Build is running in this repository (pid )`. Addressed by scenarios 1 to 4 (the unrecorded pid is now `pid not recorded`; `(pid not-a-pid)` is no longer printed).
- Observed: `go test ./...` and `go test -count=1 -v ./...` show `--- PASS: TestPSFallbackIsBounded (10.01s)` and `ok  	github.com/KogenAI/kogen-coordinator/git	46.335s`, because `const psBound = 5 * time.Second` is used by `runPS` and the test skips only under `-short`, which the project check `GOFLAGS=-trimpath go test ./...` does not pass; `Lock.Held` and `ProcessBirth` both wait the bound. `CommandTimeout` and `CommitTimeout` already have the seam `OverrideTimeouts`. Addressed by scenarios 5 to 7.
- The `ps` calls are `lstart=` (ProcessBirth) and `uid= comm= lstart=` (`observeProcess`); both read the seam. Scenario 5 uses `overridePSBound(200 * time.Millisecond)` with `ProcessBirth(99999999)`; scenario 6 uses `NewLock(path).Held()` returning `false, nil`; scenario 7 nests `overridePSBound(200 * time.Millisecond)` and `overridePSBound(300 * time.Millisecond)`.
- Controls run only these checks with `go test ./git -run <pattern>`; the test list form is `- <rule>: <test to add or update> (<layer>)`.
- Replaces the earlier narrow requests coord-build-lock-held-unrecorded-pid and coord-ps-fallback-test-short-bound.

## Tests
- An empty held lock file is refused as `(pid not recorded)` and Acquire reports Held with PID empty: Go test beside TestAcquireBuildMessages in git/lock_test.go, scenario 1 (unit)
- Headerless text in a held lock is not printed as a pid: Go test in git/lock_test.go, scenario 2 (unit)
- A recorded pid is printed unchanged: Go test in git/lock_test.go, scenario 3 (unit)
- LockOwner returns no pid for headerless text: Go test in git/lock_test.go, scenario 4 (unit)
- ProcessBirth honours the overridden ps bound: TestPSFallbackIsBounded with 200 ms, scenario 5 (unit)
- The legacy Held judgment honours the overridden ps bound: TestPSFallbackIsBounded, scenario 6 (unit)
- Each restore puts back the previous bound: nested override Go test in git/lock_test.go, scenario 7 (unit)

## Feasibility
- evidence: {"id":"judgment-observer","kind":"observer","inputs":[".kogen/intents/coord-build-lock-holder-judgment/acceptance.feature"],"observers":["features/steps/coord-build-lock-holder-judgment__judgment.js"],"checks":[{"name":"good","command":"node features/steps/coord-build-lock-holder-judgment__judgment.js good","exit":0,"output":"accepted empty-build\naccepted empty-acquire\naccepted text-build\naccepted recorded-build\naccepted recorded-acquire\naccepted owner\naccepted birth\naccepted held\naccepted restore\n"},{"name":"bad","command":"node features/steps/coord-build-lock-holder-judgment__judgment.js bad","exit":1,"output":"rejected empty-build\nrejected empty-acquire\nrejected text-build\nrejected recorded-build\nrejected recorded-acquire\nrejected owner\nrejected birth\nrejected held\nrejected restore\n"}]}
