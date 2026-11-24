# Refuse existing Build locks in strict acquisition

Slug: coord-strict-transient-build-lock
Model: .kogen/intents/coord-strict-transient-build-lock/model.qnt invariants=RefusalPreserves,OwnerHasCustody seed=1 samples=200 steps=20
Acceptance:
- .kogen/intents/coord-strict-transient-build-lock/acceptance.feature
- features/steps/coord-strict-transient-build-lock__driver.js
- features/steps/coord-strict-transient-build-lock__driver/main.go.txt

In the existing `git` package, expose `AcquireBuildStrict(root string) (*Lock, error)` and the exported sentinel `ErrBuildLockExists`. Use `git.BuildLockPath(root)` and the existing lock owner and release contract. This is opt-in; keep ordinary `AcquireBuild`, including its stale-lock repair and running-owner refusal, unchanged.

The strict decision is made by exclusive creation at the actual lock path, not by a separate absence or liveness check. If the path is occupied at that point, return a nil lock and an error for which `errors.Is(err, git.ErrBuildLockExists)` is true. The same rule applies regardless of artifact type or liveness. The refusal leaves its data, path and owner unchanged; read-only diagnosis is allowed. Do not retry an occupied result, fall back to opening the occupant for acquisition or repair it. Other failures return a nil lock and retain their own diagnostics, not the occupied-path sentinel. No new diagnostic wording or private helper API is prescribed.

On successful exclusive creation, take the existing exclusive advisory lock without waiting, verify that the path still names the created entry, and record the usual owner PID and token before returning `*Lock`. A normal contender can get to the flock between creation and strict acquisition; the strict attempt may fail promptly, but must not publish ownership or remove the path on the strength of creation alone. `git.LockOwner` and `(*Lock).Token` observe normal custody on success. `(*Lock).Release` clears the token and drops the held flock, removing the owned lock entry only if the path still names it. At strict release, a replacement entry is not the owned entry even if it is a symlink to the old inode.

Limit edits to Coordinator's git lock implementation, focused tests and the consumer lock contract as needed. No Kogen Build supersession or dispatcher change, no clearing live locks and no release of downstream queue items in this prerequisite. The downstream delivery owner pins the landed version before updating the existing supersession item.

## Decisions
- Never adopt or clean up an artifact the operation does not own. If any lock path already exists at the atomic acquisition point, refuse without changing its data, path, or owner. Read-only diagnosis of an existing artifact is allowed. (source: request)
- Keep ordinary acquisition and stale-lock repair unchanged; the opt-in entry point has a separate occupied-path refusal and retains the same Build lock path, owner and token contract, nonblocking flock and identity-aware release. (evidence: git/lock.go; contract/git_lock_test.go) (source: request)

## Source comparison
- Addressed: the request's held Build `449db620` for `kogen-build/native-supersede-revised-scope`, queue item `5f1ba719-1736-4f5a-9da6-9466e4afeac7`, is historical evidence, not a production fixture. At `f7c1b71b07d0`, `git/lock.go` could remove a stale directory or open a regular occupant after exclusive creation failed. The earlier-absence scenario makes the same ordering deterministic in a temporary root: observe absence, create the fixture, then invoke the strict API. The occupied-path scenarios distinguish the new result by `errors.Is` and check identity and content; they do not consult that queue item.
- Addressed: the requested public names and signature are used directly by the acceptance adapter. The fresh and normally held scenarios exercise the same path, compatible owner/token, bounded contenders with the winner held throughout, and release. The replacement case checks release against an entry the strict operation does not own. The parent-obstruction case keeps other errors separate from occupancy.
- Addressed without replacement: existing ordinary acquisition and release are still exercised in the stale PID file and stale directory cases after strict refusal; `git/lock_test.go` and `contract/git_lock_test.go` retain their existing coverage. No ordinary entry point is deprecated or redirected.
- No requested behavior omitted or superseded. The downstream pin-before-update obligation and the no-release/no-dispatcher boundary are delivery constraints, not production actions executed as acceptance.

## Tests
- Strict success records normal custody, excludes both contenders without waiting and releases: focused `TestAcquireBuildStrict` integration coverage and the strict-winner scenario, with deterministic ordering and a finite contender deadline while the owner is held (integration)
- Strict refusal preserves a normally held lock and existing regular, legacy-directory or link artifacts: focused `TestAcquireBuildStrictOccupied` integration coverage and the occupied-path scenarios, checking the sentinel and original path identity, bytes and owner as applicable (integration)
- An earlier absence observation does not let strict acquisition adopt a newly arrived artifact: focused `TestAcquireBuildStrictAfterAbsence` case and the earlier-absence scenario using the real local filesystem (regression)
- Strict release leaves a replacement entry intact: focused `TestAcquireBuildStrictRelease` case and the replacement scenario (integration)
- Other acquisition errors are not occupancy: focused `TestAcquireBuildStrictError` case and the parent-obstruction scenario (integration)
- Ordinary stale takeover and release remain compatible: keep `TestLocksLeftByAnEarlierKogen`, `TestAcquireBuildMessages`, `TestAKilledOwnersLockIsTakenWithoutANotice`, `TestAcquireCreatesTheLocalFolderAndTakesAFreeLock` and `TestBuildLock`, plus the stale-takeover scenarios (existing)

Add the focused Go cases to the git lock tests or their external consumer contract counterpart; the Gherkin driver independently exercises only the public API and does not depend on newly named Go tests. Run the focused Git and contract suite (`GOFLAGS=-trimpath go test -count=1 ./git ./contract`) and the repository suite (`GOFLAGS=-trimpath go test ./...`), along with configured format, compile and vet checks and acceptance. The acceptance driver needs the repository's Go toolchain and configured Node/Cucumber runner; it compiles a local Go executable and runs each case in a private temporary root with no external service.

## Feasibility
- Baseline focused Git/contract tests and configured format, compile, vet and repository tests passed on the local Go 1.27.2 runner. The Quint model typechecked and the configured bounded sample found no invariant violation; it abstracts the custody transitions and is not a proof about filesystem syscalls.
- evidence: {"id":"strict-custody-observer","kind":"observer","inputs":[".kogen/intents/coord-strict-transient-build-lock/acceptance.feature"],"observers":["features/steps/coord-strict-transient-build-lock__driver.js","features/steps/coord-strict-transient-build-lock__driver/main.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-strict-transient-build-lock__driver.js good","exit":0,"output":"accepted unchanged custody\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-strict-transient-build-lock__driver.js bad","exit":1,"output":"rejected changed custody\n"}]}
