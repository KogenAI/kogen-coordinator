# Pin what consumers use in a contract suite

Slug: k-contracts-coordinator
Model: not applicable — the change adds a test suite and documentation; no product state, transition or interacting rule changes
Acceptance:
- .kogen/intents/k-contracts-coordinator/acceptance.feature
- features/steps/k_contracts_coordinator.js
- features/steps/k_contracts_coordinator_uses.go.txt

K-CONTRACTS-COORDINATOR: Running every consumer's offline suite to catch interface breaks is slow, and kogen-coordinator itself does not write down the contract its consumers rely on. After this change kogen-coordinator has a `contract/` suite that pins exactly what its consumers use: the exported API they call, the behaviours they rely on, and the file and wire formats they read or write. The cases are copied and adapted from the consumers' existing tests that exercise kogen-coordinator, with synthetic fixtures only. The suite runs in kogen-coordinator's own fast gate (`go test ./...`, which the configured `go-test` check runs), so an interface change fails in kogen-coordinator first. An intended interface change then edits this contract together with paired consumer items.

What is added:
- `contract/`: a Go test package of the `github.com/KogenAI/kogen-coordinator` module (package `contract` or `contract_test`; subpackages under `contract/` are allowed), made of `_test.go` files with optional non-test helper `.go` files, optional synthetic fixtures under `contract/testdata/`, and `contract/README.md`. No file has a build constraint (`//go:build` or `// +build`), so `go test ./...` runs the suite on every platform. It passes `gofmt -l`, `go vet ./...` and the README's `go test -race -count=1 ./...`.
- `README.md`: under `## Packages`, a bullet that starts with ``- `contract`: `` (or ``- `contract/`: ``), says what the suite is and the change rule, and links to it as `[...](contract/)`.
- Nothing else changes. Production code under `project/`, `git/` and `durable/`, `go.mod`, `go.sum`, the existing tests and goldens, `features/steps/` files other than this Intent's, and `.kogen/project.yaml` stay as they are. There is no new CLI command, flag, option or setting, and no timeout is raised. The suite pins kogen-coordinator's current behaviour at the Build's base.

What the suite pins:
1. The API. Every member in the inventory table of acceptance scenario "The contract suite uses and lists every kogen-coordinator member a consumer uses" is used by the suite's Go code. That table is the authoritative list: 230 exported members of `project`, `git` and `durable`, written as `<pkg>.<Name>` or `<pkg>.<Type>.<Member>` (a method or a struct field), each with the consumers that use it. It was derived mechanically with the acceptance's own go/types observer, `features/steps/k_contracts_coordinator_uses.go.txt`, over each consumer's Go module (`./...`, tests included) at these `main` commits: kogen `9bf6073f8096f5a50013fc42c482695742645ac8` (`cli/`), kogen-executor `bcb2c76ad20c1f6004bd6f37447560f6114f5bd7`, kogen-verification `f39e7c2c62fdde97d77d23366238fa9562e65cce`, kogen-shaping `f561b3df6f00507ebc7249857f0662736a1769d0` and kogen-build `1a8a18d75c1f5ecf8aa057c49551a9a98c342d7c`. They all resolve kogen-coordinator at `c4a49a4`, whose exported production code is identical at this repository's HEAD, so every listed member exists here. A use must be a real case, not a bare reference:
   - a function or method is called and its result or effect asserted;
   - a field is set or read in such a call;
   - a type is constructed or received;
   - a constant's or variable's value is asserted.
   `var _ = x` stubs do not count as cases, and review rejects them.
2. The behaviours and formats consumers rely on, each asserted so that changing it fails the suite. Acceptance changes each one in a copy of the tree and requires a contract test to fail. Each item names consumer evidence.
   - `config-path`: `project.ConfigPath` is `.kogen/project.yaml`, and `LoadConfig(root)` reads the file written there (kogen-shaping `shape/helper_test.go`, `shape/shape_test.go`).
   - `config-invalid-lines`: `ParseConfig("version: 1\nbogus: 1\n", "f.yaml")` fails with `*sys.Error` `environment/project_config_invalid: f.yaml`, exit 3, `Lines` `["line 2: unknown key bogus"]` (kogen-shaping `shape/init_test.go`).
   - `config-not-initialized`: `LoadConfig` of a root without the file fails with `environment/not_initialized`, exit 3, detail `<root> has no .kogen/project.yaml; run kogen init` (kogen-shaping `shape/shape_test.go`).
   - `named-commands`: for setup `[a, b]`, fix `[c]`, check `{unit, u}` and acceptance run `r`, `NamedCommands()` is `setup-1 a`, `setup-2 b`, `fix-1 c`, `unit u`, `acceptance r` in that order (kogen-verification `verify/run.go`; kogen `cli/approve_deadline_test.go`).
   - `external-rounds` and `executor-claude-code`: `DefaultExternalRounds` is 6 and `ExecutorClaudeCode` is `claude-code`; `models: {shape: {executor: claude-code, model: m, effort: high}}` parses to `Role{Model: "m", Effort: "high", Executor: "claude-code", MaxRounds: 0}` with `External()` true, and `max_rounds: 3` gives `MaxRounds` 3 (kogen-shaping `shape/lineup_shape_test.go`, kogen-build `build/lineup_test.go`).
   - `approval-path` and `approval-json`: `ApprovalPath(root, s)` is `<root>/.kogen/local/approvals/<s>.json`; `EncodeApproval(Approval{Slug: "s", SHA256: "h", Approver: "A <a@example.invalid>", ApprovedAt: "2026-11-03T00:00:00Z"})` is exactly `{"slug":"s","sha256":"h","approver":"A <a@example.invalid>","approved_at":"2026-11-03T00:00:00Z","source_provenance":null}` and a newline (`base` omitted when empty), and `WriteApproval`/`ReadApproval` round-trip it (kogen `cli/approve_deadline_test.go`, kogen-shaping `shape/approve_test.go`).
   - `hash-line`: `Hash(root, paths)` is the lowercase hex SHA-256 over `<path>\0<lowercase hex SHA-256 of the file's bytes, or missing>\n` for each path in sorted order; the test recomputes it with `crypto/sha256` (kogen `cli/buildprogram/helper_test.go`, kogen-verification `verify/readiness_test.go`).
   - `baseline-order` and `protect-glob`: `Baseline` lists `intent.md`, `acceptance.feature`, the other `Acceptance:` entries, the Intent folder's other files sorted, `.kogen/project.yaml`, then the `protect` matches sorted, each once. In `Protected`, `**/x.cfg` matches `x.cfg` and `a/b/x.cfg`, and a folder pattern matches the files under it (kogen-shaping `shape/approve_test.go`).
   - `intent-paths`: `IntentDir("s")` is `.kogen/intents/s`, with `FeaturePath`, `IntentMDPath` and `ModelPath` under it (every consumer).
   - `model-line` and `model-none`: `ParseModelSpec(".kogen/intents/s/model.qnt invariants=A,B seed=1 samples=2 steps=3")` is `{Path, [A B], "1", "2", "3"}`; `not applicable — <reason>` (or with `-`) is `{None: true}` (kogen-verification `verify/model.go`, `verify/helper_project_test.go`).
   - `intent-lint`, `intent-title-limit` and `tests-layers`: `CheckIntent` fails with `intent/lint: the Intent needs changes`, exit 1, one line per problem; a 50-character title passes and 51 gives `title: the title must be at most 50 characters`; a `## Tests` line ending in each of `(unit)`, `(integration)`, `(scenario)`, `(regression)`, `(existing)` passes (kogen-shaping `shape/contract_check_test.go`; kogen-build `build/helper_test.go` uses `(existing)`).
   - `stages-invalid`: `ParseStages("## Stages\nnot json\n")` fails with exactly `stages: expected one JSON fence with version 1 and at least two unique stages (id, title, goal, nonempty checks); no extra fields`; a valid plan gives its stages in order; no section gives nil and no error (kogen-build `build/stages_plan_test.go`).
   - `gherkin-outline-line` and `gherkin-background`: an Examples row's scenario has the row's line, the substituted name and `Outline{Name, Line, Examples}` of its outline; Background steps come first (kogen-verification `verify/readiness_test.go`).
   - `encode-json-order`: `EncodeJSON(map[string]any{"b": 1, "a": "x\n<&>"})` is `{"a":"x\n<&>","b":1}` (kogen-build `build/unit_test.go`).
   - `package-facts`: `WritePackageFacts` writes `.kogen/local/packages/<slug>.json` with keys `checkout_id`, `package_state` (`valid` or `invalid`), `paths` and `sha256` (kogen `cli/facts.go`, kogen-verification `verify/readiness_test.go`).
   - `source-path`, `source-receipt-version`, `source-ref-map`, `source-refused` and `source-message`: `SourcePath` is `<root>/.kogen/local/provenance/<slug>/current.json`; `CaptureSource` then `BindSource` gives a reference whose receipt has `version` 1 and whose `ContractSHA256` is the baseline `Hash`; `SourceRef.Map()` has `path`, `sha256` and, only when set, `contract_sha256`, and `SourceRefFromMap` reads it back; a changed receipt fails `ValidateSource` with `candidate/source_provenance_changed`, exit 1; `SourceMessage(nil)` is `Source provenance: unavailable (legacy)` (kogen-shaping `shape/approve_test.go`, `shape/shape_test.go`; kogen-build `build/build_test.go`).
   - `commit-message` and `commit-rejected`: `Repo.Commit` lands `<title>\n\nKogen-Intent: <slug>\n`; `CheckCommitMsg` with a commit-msg hook exiting 9 fails with `environment/commit_rejected`, exit 3, detail `the commit-msg hook rejects this Intent's commit message (status=9); change the Intent's title or the hook, then approve again` (kogen-build `build/build_test.go`).
   - `lock-path`, `build-running` and `lock-diagnostics`: `BuildLockPath(root)` is `<root>/.kogen/local/build.lock`; `AcquireBuild` while another `Lock` holds it fails with `environment/build_running`, exit 3, detail `a Build is running in this repository (pid <pid>)`; after `Acquire`, `LockOwner` gives this process's pid, the lock's `Token()` and held true (kogen `cli/facts.go`, kogen-shaping `shape/approve_test.go`, kogen-build `build/facts.go`).
   - `changed-paths-rename`: after a staged rename, `ChangedPaths` lists the new path, then the old one (kogen-shaping, kogen-build).
   - `unset-prefix`: `UnsetPrefix()` is exactly `unset GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_DIR GIT_GRAFT_FILE GIT_IMPLICIT_WORK_TREE GIT_INDEX_FILE GIT_NAMESPACE GIT_OBJECT_DIRECTORY GIT_PREFIX GIT_QUARANTINE_PATH GIT_SHALLOW_FILE GIT_WORK_TREE; ` (kogen-shaping production).
   - `not-a-git-repo` and `identity-missing`: `git.Open` outside a repository (use `GIT_CEILING_DIRECTORIES`) fails with `environment/not_a_git_repo`, exit 3, detail `<dir>; run git init first`; `RequireIdentity` without `user.name`/`user.email` fails with `environment/git_identity_missing`, exit 3 (kogen-shaping `shape/init_test.go`, `shape/approve_test.go`).
   - `durable-skip`: after `SkipSyncInTests`, `Sync` of a closed file returns nil (kogen, kogen-shaping and kogen-build test mains).
   The exact changes acceptance applies are listed in that scenario. Each replaces one production text, which must occur once. The changed tree must still build, and the suite must then report a failing test. A build failure of the suite does not count.

How the cases are derived. Copy and adapt the consumers' cases that exercise these members and behaviours. The consumer test files that import kogen-coordinator are:
- kogen `cli/`: `approve_deadline`, `buildprogram/baseline_installed`, `buildprogram/helper_report`, `buildprogram/helper`, `buildprogram/k_reviewretry_cli`, `buildprogram/main`, `buildprogram/satisfied_rebuild`, `executor_wiring`, `facts`, `readiness/readiness`, `repository_config` (each `_test.go`).
- kogen-executor: `agent/git_test.go`.
- kogen-verification `verify/`: `account`, `evidence`, `feasibility`, `helper_project`, `helper_report`, `helper`, `named_feedback`, `pass`, `readiness_golden`, `readiness`, `real`, `tools`, `unused_step_warn`, `verify` (each `_test.go`).
- kogen-shaping `shape/`: `approve`, `batch`, `context`, `contract_check`, `contract`, `datastores`, `decision`, `evidence`, `examples_revert`, `exec_state`, `helper`, `init`, `lineup_shape`, `lineup`, `main`, `preflight`, `refine`, `shape`, `stepcheck` (each `_test.go`).
- kogen-build `build/`: `baseline_cache`, `blocker`, `brief_caps`, `build`, `cache_id`, `commit_failed_resume`, `commit`, `context_external`, `context`, `env_failure_park`, `executor_native`, `executor`, `facts`, `failing_check`, `golden`, `helper_report`, `helper`, `k15_anthropic_validator`, `k_review_verdict_strand`, `k_reviewretry_cli`, `k_reviewretry_safety`, `k_revod_gate_parts`, `k_revod_gate`, `legacy`, `lineup`, `main`, `material`, `named_feedback`, `native_default`, `noprogress`, `recover`, `review_budget`, `review_lineup`, `review_parts_source`, `review_resume_external`, `review`, `stages_plan`, `stages`, `unit`, `usage_limit_resume` (each `_test.go`).

A member used only by consumer production code (for example `git.Materialized.Mutations` in kogen-verification `verify/`, `project.UnsetPrefix` users in kogen-shaping) is pinned with a case adapted from the consumer code that uses it.

The fixtures are synthetic only:
- `t.TempDir()` roots, Git repositories and project files written by the test;
- Git run with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, no inherited `GIT_*` variables, its own identity (`Fixture <fixture@example.invalid>`), its own empty hooks folder (`core.hooksPath`) and `commit.gpgsign false`, as kogen-coordinator's own `git/helper_test.go` does;
- `sys.NewWith(env, dir)` sessions from `kogen-loop/sys`.

The suite must not:
- run a model, contact the network, or rely on the caller's `HOME`, Git configuration, credentials or `KOGEN_*` variables;
- read kogen-coordinator's own source files or goldens (no string beginning with `..`, and no `go/*` packages); copy what it needs into `contract/testdata/`;
- import a consumer module, or anything beyond the standard library, kogen-coordinator's `project`, `git` and `durable` and `kogen-loop/sys`.

If an adapted consumer case disagrees with current behaviour, the case pins the current behaviour, and `contract/README.md` names the difference under a heading `## Differences from consumer expectations`.

The suite must be fast:
- Acceptance requires each contract package's test time to be at most 30 seconds; aim for a few seconds.
- It has no `t.Skip`, uses short commands and no sleeps or real waits.
- It passes with `-count=1`, with `-trimpath`, with `-race`, and when several copies of the tree run it at once, so it uses no fixed ports or shared paths.

`contract/README.md` states what the suite pins and the source commits above. It contains this sentence verbatim: `An intended interface change edits this contract together with paired consumer items.` It holds one Markdown table whose header and separator lines are exactly:

```
| Interface | Consumers | Derived from | Contract tests |
| --- | --- | --- | --- |
```

The table has one row per inventory member: no missing, extra or duplicate rows, and no other lines inside the table. The cells are separated by ` | `, and each row looks like ``| `git.BuildLockPath` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestBuildLock` |``.
- Interface: the member in backticks, exactly as in the inventory.
- Consumers: exactly the inventory's consumers for it, separated by `, `, in the order kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build.
- Derived from: one or more backticked paths, separated by `, `. Each path is `<consumer>/<path in that repository>.go`, its consumer is one of the row's consumers, and it names the consumer test the case was adapted from, or the consumer source that uses the member when no consumer test exercises it. A kogen path starts with `cli/`, `test/` or `features/`.
- Contract tests: one or more backticked top-level test names, separated by `, `, each a test that `go test -list . ./contract/...` reports.

Out of scope: changes to consumer suites outside this repository. No consumer repository or pin changes. No CHANGELOG entry is added.

## Decisions
- The contract suite lives in kogen-coordinator as `contract/` and joins the ordinary `go test ./...` check (source: request)
- It pins the exported API consumers call, the behaviours they rely on and the file and wire formats they read or write, with cases copied and adapted from the consumers' existing tests (source: request)
- Synthetic fixtures only: no model runs, no network, no consumer repositories at test time, no new CLI commands or flags, no timeout raised, and the suite stays fast (source: request)
- An intended interface change edits this contract together with paired consumer items, as `contract/README.md` states (source: request)

## Source comparison
- Addressed: "pins exactly what its consumers use: the exported API they call". The go/types observer over each consumer module at the commits above found 230 members. Acceptance "uses and lists every kogen-coordinator member" requires the suite to use each one and `contract/README.md` to list each with its exact consumers, a consumer source and passing contract tests. Removing, renaming or re-signing a consumed member breaks the suite's build.
- Addressed: "the behaviours they rely on, and the file and wire formats they read or write". 37 behaviours and formats are pinned, each traced to consumer evidence: configuration path, errors and named commands; executor roles; approval file path and JSON; the approval hash and baseline order; protect globs; Intent paths, Model line, lint, title limit and test layers; the stages error; Gherkin outline lines and Background; compact JSON; package facts; the provenance receipt path, version, reference map, custody refusal and legacy message; the commit message and commit-msg refusal; the Build lock path, refusal and diagnostics; rename reporting; the unset prefix; Git repository and identity errors; and the durable sync switch. Acceptance "A change to a behaviour a consumer relies on fails the contract suite first" changes each in a copy and requires a failing contract test while the unchanged copy passes.
- Addressed: "Derive the cases from the consumers' existing tests ... copy and adapt ... synthetic fixtures only". Each README row names its consumer source. Acceptance checks the form of the source; review checks that the cases really come from it.
- Addressed: "runs as part of kogen-coordinator's own fast gate". Acceptance "passes offline and fast" runs `go test -json -count=1 ./contract/...` in a copy with an empty `HOME`, the Go proxy off, no `KOGEN_*` or `GIT_*` variables and HTTP(S) proxies at a closed port: pass, no skip, at least one test, each package within 30 seconds, no build constraint, every package in `go list ./...`.
- Addressed: "An intended interface change then edits this contract together with paired consumer items": the exact sentence in `contract/README.md`, linked from `README.md` (acceptance "The README points at the contract").
- Addressed, constraints: no consumer repositories at test time (acceptance "depends on nothing but kogen-coordinator, kogen-loop/sys and the standard library": `go.mod` and `go.sum` unchanged, only allowed imports, no `..` strings); no model runs or network; no production change, CLI command, flag or raised timeout.
- Interpretation, decided here: "what its consumers use" is what consumer Go code (production and tests) references at the commits above. A syntactic scan of kogen's acceptance drivers (`features/steps/*_driver.go`, Go embedded in step files), kogen `test/migration/fixtures/lab`, kogen-verification `features/steps` drivers and kogen-build `features/steps/k_brief_test.go.txt` found no further package-level member; their methods and fields were not type-checked.
- Lesson: the k-contracts-loop Intent records that an earlier K-CONTRACTS-COORDINATOR review blocked a contract that pinned only part of the consumed interface. Here the inventory is complete and checked mechanically.
- Omitted, separate: changes to external consumer-suite runs and the paired consumer items of future interface changes.

## Tests
- Every kogen-coordinator member a consumer uses is exercised by a contract case and listed in contract/README.md with its consumers, consumer source and contract tests: new tests in `contract/`; acceptance scenario "uses and lists every kogen-coordinator member" (integration)
- Each of the 37 consumer-relied behaviours and formats is asserted, so that changing it fails the suite while the unchanged tree passes: new tests in `contract/`; acceptance scenario "A change to a behaviour a consumer relies on fails the contract suite first" (integration)
- The suite passes offline, without skips, within 30 seconds per package, and is part of go test ./...: acceptance scenario "passes offline and fast" (integration)
- The suite depends only on the standard library, kogen-coordinator's three packages and kogen-loop/sys, and go.mod and go.sum are unchanged: acceptance scenario "depends on nothing but kogen-coordinator, kogen-loop/sys and the standard library" (integration)
- README.md points at contract/ and contract/README.md states the change rule: acceptance scenario "The README points at the contract" (scenario)
- Existing behaviour and tests stay unchanged and no production code changes: the existing go build, go vet and go test ./... checks pass unchanged (existing)

## Feasibility
- Repository inspection. No external protocol, provider or library fact is involved, so no documentation lookup was needed. The consumer modules resolve from the local Go module cache with `GOPROXY=off`. `git diff c4a49a4 HEAD` changes no production `.go` file.
- Scratch observation in this Shape session, outside the checkout (not a Kogen probe). The observer `k_contracts_coordinator_uses.go.txt` ran over each consumer module and gave the 230-member inventory; all type-checked cleanly.
- Scratch observation on a copy of HEAD `b924ef3`: every change in the behaviour scenario occurs exactly once and every changed tree passes `go build -trimpath ./...`. The quoted values (approval bytes, unset prefix, compact JSON, configuration and stages errors, named commands, legacy message) were printed by a scratch program against HEAD.
- Scratch acceptance runs. On the unchanged tree all five scenarios fail at the missing feature: the run reports a build failure of `./contract/...`, the observer reports `lstat ./contract/: no such file or directory`, every outcome is `contract does not build`, and the README checks are false. With a two-test sample contract and README, the run, dependency and documentation scenarios passed, the behaviour scenario reported `contract failed` only for the two changes the sample pinned (`lock-path`, `durable-skip`), and the inventory scenario listed the missing members.
- evidence: {"id":"contract-suite-observer","kind":"observer","inputs":["features/steps/k_contracts_coordinator.js","features/steps/k_contracts_coordinator_uses.go.txt","git/commit.go","git/commit_test.go","git/helper_test.go","project/facts.go","project/baseline.go","project/provenance.go"],"observers":["features/steps/k_contracts_coordinator.js","features/steps/k_contracts_coordinator_uses.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k_contracts_coordinator.js --control good","exit":0,"output":"contract suite observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k_contracts_coordinator.js --control bad","exit":1,"output":"contract suite observer rejected\n"}]}
