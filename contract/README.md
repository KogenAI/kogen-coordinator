# Contract suite

This package is the contract of kogen-coordinator with its consumers: kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-review and kogen-build. It pins exactly what they use: the exported API they call, the behaviours they rely on, and the file and wire formats they read or write. It runs in kogen-coordinator's own fast gate, `go test ./...`, so an interface change fails here first, without the consumer repositories.

An intended interface change edits this contract together with paired consumer items.

`TestBaselineContractGolden` pins the ordered `project.Baseline` producer list in `testdata/baseline.json`, before consumers derive bytes and digests from it. A deliberate Baseline-list change must update this golden in the same commit, and the commit message must name the baseline change as an expand step so delivery's consumer gate can see it. This is a human maintenance obligation, not an automated guarantee of delivery classification. Introducing the golden itself does not expand the baseline.

Run it with the rest of the module, or alone:

```sh
go test -race -count=1 ./contract/...
```

## What it is made of

- The cases are copied and adapted from the consumers' existing tests that exercise kogen-coordinator. A case that has no consumer test is adapted from the consumer code that uses the member (for example `git.Materialized.Mutations` in kogen-verification `verify/run.go` and `git.UnsetPrefix` in kogen-shaping `shape/init.go`).
- The fixtures are synthetic only: `t.TempDir()` roots, Git repositories and project files written by the test, and `sys.NewWith(env, dir)` sessions from `kogen-loop/sys`. Git runs with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, no inherited `GIT_*` or `KOGEN_*` variable, a `HOME` of its own, the identity `Fixture <fixture@example.invalid>`, its own empty hooks folder (`core.hooksPath`) and `commit.gpgsign false`, as `git/helper_test.go` does. `TestMain` sets this up for the whole process, because the project functions run Git with the process environment.
- The suite imports only the standard library, `project`, `git`, `durable` and `route` of kogen-coordinator and `kogen-loop/sys`. It does not read kogen-coordinator's own sources or project/testdata goldens; the contract package's own baseline golden is read alongside its synthetic inputs. It runs no model, uses no network, no fixed port and no shared path, has no `t.Skip`, no sleep and no build constraint, and passes with `-count=1`, `-trimpath` and `-race`.

## Source commits

The inventory below was derived mechanically: a go/types observer listed every exported member of `project`, `git` and `durable` that each consumer's Go code uses, tests included (`./...` of its module), at these `main` commits:

| Consumer | Commit |
| --- | --- |
| kogen (`cli/`) | `9bf6073f8096f5a50013fc42c482695742645ac8` |
| kogen-executor | `bcb2c76ad20c1f6004bd6f37447560f6114f5bd7` |
| kogen-verification | `f39e7c2c62fdde97d77d23366238fa9562e65cce` |
| kogen-shaping | `f561b3df6f00507ebc7249857f0662736a1769d0` |
| kogen-build | `1a8a18d75c1f5ecf8aa057c49551a9a98c342d7c` |

They all resolve kogen-coordinator at `c4a49a4`, whose exported production code is identical to the base of this suite.

## Behaviours and formats pinned

Each item is asserted so that changing it fails the suite.

- `models-lineup`, `TestModelsLineup` and `TestModelsValidation`: the opt-in team and local paths, defaults, whole-role overrides, source paths, file immutability and role validation.
- `config-local-overlay`, `TestConfigLocalOverlay`, `TestModelsBaselineHash`: `LoadConfig` applies `.kogen/local/models.yaml` (whole-role replacement) and `project.LocalChecksPath` (`.kogen/local/checks.yaml`, per-name `Run` replacement in the committed names and order) over `.kogen/project.yaml`; a malformed local file is `environment/project_config_invalid` (exit 3) with its absolute path and `line N:` lines and no Config; no file is written; the local files stay outside the approval baseline.
- `config-path`, `TestConfigPathAndLoad`: `project.ConfigPath` is `.kogen/project.yaml` and `LoadConfig` reads the file written there. The removed `shape_workers`, `shape_audit`, `shape_decision_check` and `review_material` keys are ignored, and `ShapeWorkers`, `ShapeAudit`, `ShapeDecisionCheck` and `ReviewMaterial` hold the fixed values (workers off with an empty `Roles` map, audit off, decision check off, review material `parts`).
- `config-invalid-lines`, `TestConfigInvalidNamesTheLines`: an invalid file is `environment/project_config_invalid` (exit 3) with one `line N: ...` line per problem.
- `config-not-initialized`, `TestConfigNotInitialized`: a root without the file is `environment/not_initialized` (exit 3).
- `named-commands`, `TestNamedCommandsOrder`: `setup-N`, `fix-N`, the checks, then `acceptance`.
- `external-rounds` and `executor-claude-code`, `TestExecutorRoleLineup`: `DefaultExternalRounds` is 6, `ExecutorClaudeCode` is `claude-code`, the executor of a role, zero `MaxRounds` for loaded roles, and rejection of the removed `max_rounds` setting.
- `approval-path` and `approval-json`, `TestApprovalPathAndJSON`: the approval file's path and exact bytes, and its round trip.
- `hash-line`, `TestHashIsTheDigestOfPathDigestLines`: the approval hash is recomputed with `crypto/sha256`.
- `baseline-order` and `protect-glob`, `TestBaselineOrderAndProtectGlobs`: the order of the baseline and the `protect` patterns.
- `intent-paths`, `TestIntentPaths`: the paths under `.kogen/intents/<slug>`.
- `build-edits`, `TestBuildEditsLeaveOutTheApprovedIntent`: `project.OwnedByIntent` (under `.kogen/intents/<slug>/` or `.kogen/models/<slug>/`, byte-exact prefix) and `project.BuildEdits`, a Build's edit list: the tree diff in order without the approved Intent's own paths.
- `model-line` and `model-none`, `TestParseModelSpec`: the Model line.
- `intent-lint`, `intent-title-limit` and `tests-layers`, `TestCheckIntent`: the lint error, the 50-character title limit and the five test layers.
- `stages-invalid`, `TestParseStages`: the `## Stages` plan and its error text.
- `gherkin-outline-line` and `gherkin-background`, `TestParseGherkinOutlineRowsAndBackground`: the scenario of an Examples row and the Background steps.
- `encode-json-order`, `TestEncodeJSON`: the compact JSON of the local records.
- `package-facts`, `TestWritePackageFacts`: `.kogen/local/packages/<slug>.json` and its keys.
- `source-path`, `source-receipt-version`, `TestCaptureSourcePublishesTheVersionOneReceipt`: the receipt's path, version and contract hash.
- `source-ref-map`, `TestSourceRefMapRoundTrip`: `SourceRef.Map` and `SourceRefFromMap`.
- `source-refused` and `source-message`, `TestSourceCustodyAndMessages`: the custody refusal and the legacy message.
- `commit-message`, `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`: the commit message and its `Kogen-Intent` trailer.
- `commit-rejected`, `TestCheckCommitMsgRunsTheCommitMsgHook`: the commit-msg refusal.
- `lock-path`, `build-running` and `lock-diagnostics`, `TestBuildLock`: the Build lock's path, refusal and diagnostics.
- `changed-paths-rename`, `TestChangedPathsReportsARenameNewPathFirst`: a rename lists the new path, then the old one.
- `unset-prefix`, `TestUnsetPrefix`: the shell prefix that removes the location variables.
- `not-a-git-repo` and `identity-missing`, `TestOpenAndIdentity`: the repository and identity errors.
- `durable-skip`, `TestDurableSyncIsSkippedInTests`: `Sync` after `SkipSyncInTests`.
- `route-cycle`, `route-resume` and `route-stages`, `TestRouteCycleAndResume`: the verify → review → commit cycle (a red pass returns the repair feedback, a drifted approval verifies and reviews again), the resume of a failed commit (finished alone, never restarted), of a review-only checkpoint and of a review its reviewer cannot continue (a fresh review) or can (continued), and the persisted stage names. Derived from kogen-build's routing (`build/route.go`, `builder.go`), which this change moved here.

## Differences from consumer expectations

No difference was found: every adapted case agrees with the current behaviour of kogen-coordinator.

## Inventory

Every exported member of `project`, `git` and `durable` that a consumer uses has one row: the consumers that use it, the consumer sources its case was derived from, and the contract tests that exercise it.

| Interface | Consumers | Derived from | Contract tests |
| --- | --- | --- | --- |
| `durable.SkipSyncInTests` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/main_test.go`, `kogen-shaping/shape/main_test.go`, `kogen-build/build/main_test.go` | `TestDurableSyncIsSkippedInTests` |
| `durable.Sync` | kogen-shaping, kogen-build | `kogen-shaping/shape/shape.go`, `kogen-build/build/context.go` | `TestDurableSyncIsSkippedInTests` |
| `git.AcquireBuild` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/build.go` | `TestBuildLock` |
| `git.Acquired` | kogen-build | `kogen-build/build/facts_test.go` | `TestBuildLock` |
| `git.BuildLockPath` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go`, `kogen-build/build/facts.go` | `TestBuildLock` |
| `git.CommandError` | kogen-shaping | `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.CommandError.Args` | kogen-shaping | `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.CommandError.Output` | kogen-shaping | `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.CommandError.Status` | kogen-shaping | `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.CommitSpec` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.CommitSpec.MessageFile` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.CommitSpec.Slug` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.CommitSpec.Start` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.CommitSpec.Title` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.CommitSpec.Tree` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.Lock.Acquire` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestBuildLock` |
| `git.Lock.Held` | kogen-shaping | `kogen-shaping/shape/preflight.go` | `TestBuildLock` |
| `git.Lock.Release` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestBuildLock` |
| `git.Lock.Token` | kogen | `kogen/cli/facts_test.go` | `TestBuildLock` |
| `git.LockOwner` | kogen, kogen-build | `kogen/cli/facts.go`, `kogen-build/build/facts.go` | `TestBuildLock` |
| `git.LockResult.Status` | kogen-build | `kogen-build/build/facts_test.go` | `TestBuildLock` |
| `git.Materialized` | kogen-verification | `kogen-verification/verify/readiness.go` | `TestMaterializeAndMutations` |
| `git.Materialized.Mutations` | kogen-verification | `kogen-verification/verify/readiness.go`, `kogen-verification/verify/run.go` | `TestMaterializeAndMutations` |
| `git.New` | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestOpenAndIdentity` |
| `git.NewLock` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestBuildLock` |
| `git.Open` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/build.go` | `TestOpenAndIdentity` |
| `git.OpenReadOnly` | kogen | `kogen/cli/readiness/readiness.go` | `TestOpenAndIdentity` |
| `git.Pin` | kogen-shaping | `kogen-shaping/shape/external.go` | `TestPinNamesWhatChanged` |
| `git.Pin.Changes` | kogen-shaping | `kogen-shaping/shape/external.go` | `TestPinNamesWhatChanged` |
| `git.Repo` | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/approve_test.go` | `TestOpenAndIdentity` |
| `git.Repo.At` | kogen-verification, kogen-shaping | `kogen-verification/verify/readiness.go` | `TestOpenAndIdentity`, `TestMaterializeAndMutations` |
| `git.Repo.CanCommit` | kogen, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-build/build/build.go` | `TestOpenAndIdentity` |
| `git.Repo.Changed` | kogen-verification, kogen-shaping, kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.Repo.ChangedPaths` | kogen-shaping, kogen-build | `kogen-shaping/shape/init.go`, `kogen-shaping/shape/preflight.go`, `kogen-build/build/build.go` | `TestChangedPathsReportsARenameNewPathFirst` |
| `git.Repo.CheckCommitMsg` | kogen-build | `kogen-build/build/build.go` | `TestCheckCommitMsgRunsTheCommitMsgHook` |
| `git.Repo.Commit` | kogen-build | `kogen-build/build/commit.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate` |
| `git.Repo.CommitPaths` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestCommitPathsCommitsOnlyThosePaths` |
| `git.Repo.Diff` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.Repo.Dir` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/init.go`, `kogen-shaping/shape/shape.go` | `TestBaselineOrderAndProtectGlobs`, `TestApprovalOfTheBaselineHash`, `TestCheckoutFacts`, `TestWritePackageFacts`, `TestCommitPathsCommitsOnlyThosePaths`, `TestOpenAndIdentity`, `TestHeadResolveShowGitDirAndObjectFormat`, `TestTreeEntriesChangedAndDiff`, `TestMaterializeAndMutations`, `TestRestoreTreePutsBackTheDifferingPaths`, `TestIndexCustody`, `TestIntentExistsAndRequireIntentDir`, `TestIntentFields`, `TestCheckIntent`, `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceCustodyAndMessages`, `TestSourceRefreshRefineAndRestore`, `TestResolveApproval`, `TestSourceComparisonRules` |
| `git.Repo.GitDir` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestHeadResolveShowGitDirAndObjectFormat`, `TestIndexCustody` |
| `git.Repo.Head` | kogen-executor, kogen-verification, kogen-shaping, kogen-build | `kogen-executor/agent/git.go`, `kogen-verification/verify/readiness.go`, `kogen-shaping/shape/init.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestCommitFailureLeavesHeadAndTheStagedCandidate`, `TestCommitPathsCommitsOnlyThosePaths`, `TestHeadResolveShowGitDirAndObjectFormat`, `TestTreeEntriesChangedAndDiff`, `TestMaterializeAndMutations`, `TestRestoreTreePutsBackTheDifferingPaths`, `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `git.Repo.Identity` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestOpenAndIdentity` |
| `git.Repo.IndexPath` | kogen-shaping, kogen-build | `kogen-build/build/build.go`, `kogen-build/build/resume.go` | `TestIndexCustody` |
| `git.Repo.Materialize` | kogen-verification | `kogen-verification/verify/readiness.go`, `kogen-verification/verify/run.go` | `TestMaterializeAndMutations` |
| `git.Repo.OK` | kogen-shaping, kogen-build | `kogen-shaping/shape/refine.go`, `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError`, `TestMaterializeAndMutations` |
| `git.Repo.OKEnv` | kogen-shaping | `kogen-shaping/shape/common.go` | `TestRunOKAndCommandError` |
| `git.Repo.ObjectFormat` | kogen-build | `kogen-build/build/resume.go`, `kogen-build/build/review_retry.go` | `TestHeadResolveShowGitDirAndObjectFormat`, `TestIndexCustody` |
| `git.Repo.Observing` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestCommitLandsTheReviewedTreeWithTheIntentTrailer`, `TestOpenAndIdentity` |
| `git.Repo.OperationInProgress` | kogen-shaping, kogen-build | `kogen-shaping/shape/preflight.go`, `kogen-build/build/build.go` | `TestHeadResolveShowGitDirAndObjectFormat` |
| `git.Repo.RequireIdentity` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestOpenAndIdentity` |
| `git.Repo.Resolve` | kogen-build | `kogen-build/build/commit.go`, `kogen-build/build/resume.go` | `TestOpenAndIdentity`, `TestRunOKAndCommandError`, `TestHeadResolveShowGitDirAndObjectFormat`, `TestTreeEntriesChangedAndDiff`, `TestRestoreTreePutsBackTheDifferingPaths`, `TestIndexCustody` |
| `git.Repo.RestoreIndex` | kogen-build | `kogen-build/build/stop.go` | `TestIndexCustody` |
| `git.Repo.RestoreTree` | kogen-build | `kogen-build/build/review_retry.go` | `TestRestoreTreePutsBackTheDifferingPaths` |
| `git.Repo.Run` | kogen-executor, kogen-verification, kogen-shaping | `kogen-executor/agent/git_test.go`, `kogen-shaping/shape/refine.go`, `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.Repo.RunEnv` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestRunOKAndCommandError` |
| `git.Repo.SaveIndex` | kogen-build | `kogen-build/build/build.go` | `TestIndexCustody` |
| `git.Repo.Show` | kogen-shaping, kogen-build | `kogen-shaping/shape/contract.go`, `kogen-build/build/review.go` | `TestHeadResolveShowGitDirAndObjectFormat` |
| `git.Repo.TakePin` | kogen-shaping | `kogen-shaping/shape/external.go` | `TestPinNamesWhatChanged` |
| `git.Repo.Tree` | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/readiness.go`, `kogen-verification/verify/run.go`, `kogen-build/build/review_retry.go` | `TestTreeEntriesChangedAndDiff`, `TestMaterializeAndMutations`, `TestRestoreTreePutsBackTheDifferingPaths`, `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `git.Repo.TreeEntries` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.Restored.Change` | kogen-build | `kogen-build/build/review_retry.go` | `TestRestoreTreePutsBackTheDifferingPaths` |
| `git.Restored.Path` | kogen-build | `kogen-build/build/review_retry.go` | `TestRestoreTreePutsBackTheDifferingPaths` |
| `git.Result.Status` | kogen-executor, kogen-shaping | `kogen-executor/agent/git_test.go`, `kogen-shaping/shape/refine.go`, `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.Result.Stderr` | kogen-executor, kogen-shaping | `kogen-executor/agent/git_test.go`, `kogen-shaping/shape/refine.go`, `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.Result.Stdout` | kogen-executor, kogen-verification, kogen-shaping | `kogen-executor/agent/git_test.go`, `kogen-shaping/shape/refine.go`, `kogen-shaping/shape/datastores.go` | `TestRunOKAndCommandError` |
| `git.StagedEquivalent` | kogen-build | `kogen-build/build/resume.go`, `kogen-build/build/review_retry.go` | `TestIndexCustody` |
| `git.TreeEntry` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.TreeEntry.Mode` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.TreeEntry.Object` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.TreeEntry.Path` | kogen-build | `kogen-build/build/material.go` | `TestTreeEntriesChangedAndDiff` |
| `git.UnsetPrefix` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestUnsetPrefix` |
| `project.Acceptance` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Acceptance.Run` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Acceptance.StepsDir` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.AcceptanceCommand` | kogen-verification, kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Approval` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash`, `TestResolveApproval` |
| `project.Approval.ApprovedAt` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash`, `TestResolveApproval` |
| `project.Approval.Approver` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash`, `TestResolveApproval` |
| `project.Approval.Base` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go`, `kogen-build/build/build_test.go` | `TestApprovalPathAndJSON` |
| `project.Approval.SHA256` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash`, `TestResolveApproval` |
| `project.Approval.Slug` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash`, `TestResolveApproval` |
| `project.Approval.SourceProvenance` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON`, `TestResolveApproval` |
| `project.ApprovalPath` | kogen, kogen-shaping, kogen-build | `kogen/cli/buildprogram/k_reviewretry_cli_test.go`, `kogen-shaping/shape/approve.go`, `kogen-build/build/blocker_test.go` | `TestApprovalPathAndJSON` |
| `project.Audit.Enabled` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestConfigPathAndLoad` |
| `project.Baseline` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-verification/verify/readiness_test.go`, `kogen-shaping/shape/approve_test.go` | `TestBaselineOrderAndProtectGlobs`, `TestApprovalOfTheBaselineHash`, `TestWritePackageFacts`, `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.BindSource` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceCustodyAndMessages`, `TestPublishSourceKeepsThePredecessor` |
| `project.CaptureOrigin` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.CaptureSource` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.Check` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Check.Name` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig`, `TestDetectAndAcceptanceCommand` |
| `project.Check.Run` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig`, `TestDetectAndAcceptanceCommand` |
| `project.CheckIntent` | kogen-verification, kogen-shaping | `kogen-verification/contract/contract_test.go`, `kogen-shaping/shape/preflight_test.go` | `TestCheckIntent` |
| `project.Checkout` | kogen-shaping, kogen-build | `kogen-shaping/shape/preflight_test.go`, `kogen-shaping/shape/shape_test.go`, `kogen-build/build/facts.go` | `TestCheckoutFacts`, `TestWritePackageFacts` |
| `project.CheckoutFacts` | kogen-shaping, kogen-build | `kogen-shaping/shape/preflight_test.go`, `kogen-build/build/facts.go` | `TestCheckoutFacts` |
| `project.CheckoutFacts.GitDir` | kogen-shaping | `kogen-shaping/shape/preflight_test.go`, `kogen-shaping/shape/shape_test.go` | `TestCheckoutFacts` |
| `project.CheckoutFacts.ID` | kogen-shaping, kogen-build | `kogen-shaping/shape/preflight_test.go`, `kogen-shaping/shape/shape_test.go`, `kogen-build/build/facts.go` | `TestCheckoutFacts`, `TestWritePackageFacts` |
| `project.CheckoutFacts.Root` | kogen-shaping | `kogen-shaping/shape/preflight_test.go`, `kogen-shaping/shape/shape_test.go` | `TestCheckoutFacts` |
| `project.Config` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go`, `kogen-build/build/facts_test.go` | `TestBaselineOrderAndProtectGlobs`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Config.Acceptance` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Config.AcceptanceConfigured` | kogen-shaping | `kogen-shaping/shape/refine.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.Config.Checks` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Config.Fix` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Config.Models` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-build/build/lineup_test.go` | `TestConfigPathAndLoad`, `TestExecutorRoleLineup`, `TestReadableConfigAndModelRoles`, `TestTemplateAndRenderConfig` |
| `project.Config.NamedCommands` | kogen-verification | `kogen-verification/verify/readiness.go` | `TestNamedCommandsOrder` |
| `project.Config.ProtectDiagnostics` / `project.ProtectDiagnostic` | config-check consumers | serialized loaded Config: advisory `Entry`, `Severity`, `Message`; refreshed by `Protected` | `TestProtectDiagnosticsContract` |
| `project.Config.Protect` | kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestBaselineOrderAndProtectGlobs`, `TestConfigPathAndLoad`, `TestReadableConfigAndModelRoles`, `TestTemplateAndRenderConfig` |
| `project.Config.ReviewMaterial` | kogen-build | `kogen-build/build/k_revod_gate_test.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.Config.Setup` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/run.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestNamedCommandsOrder`, `TestTemplateAndRenderConfig` |
| `project.Config.ShapeAudit` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestConfigPathAndLoad` |
| `project.Config.ShapeDecisionCheck` | kogen-shaping | `kogen-shaping/shape/decision_test.go` | `TestConfigPathAndLoad` |
| `project.Config.ShapeWorkers` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-shaping/shape/lineup_test.go`, `kogen-build/build/legacy_test.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.ConfigPath` | kogen, kogen-shaping, kogen-build | `kogen/cli/repository_config_test.go`, `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.DecisionCheck` | kogen-shaping | `kogen-shaping/shape/decision_test.go` | `TestConfigPathAndLoad` |
| `project.DecisionCheck.Enabled` | kogen-shaping | `kogen-shaping/shape/decision_test.go` | `TestConfigPathAndLoad` |
| `project.DefaultExternalRounds` | kogen-shaping, kogen-build | `kogen-shaping/shape/external.go`, `kogen-build/build/executor_external.go` | `TestExecutorRoleLineup` |
| `project.DefaultModels` | kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestConfigPathAndLoad`, `TestReadableConfigAndModelRoles`, `TestTemplateAndRenderConfig` |
| `project.Detect` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected.Checks` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected.Fix` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected.Protect` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected.Runner` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Detected.Setup` | kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.EncodeApproval` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestApprovalPathAndJSON` |
| `project.EncodeJSON` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/context_test.go`, `kogen-build/build/unit_test.go` | `TestEncodeJSON`, `TestWritePackageFacts` |
| `project.ExecutorClaudeCode` | kogen | `kogen/cli/executor_wiring_test.go` | `TestExecutorRoleLineup` |
| `project.FeaturePath` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-build/build/helper_test.go`, `kogen-build/build/builder.go` | `TestIntentPaths`, `TestIntentFields`, `TestCheckIntent` |
| `project.Hash` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen-verification/verify/readiness_test.go`, `kogen-shaping/shape/approve_test.go` | `TestHashIsTheDigestOfPathDigestLines`, `TestApprovalOfTheBaselineHash`, `TestWritePackageFacts`, `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.Intent` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/contract/contract_test.go`, `kogen-shaping/shape/approve_test.go`, `kogen-build/build/material_test.go` | `TestIntentFields` |
| `project.Intent.Acceptance` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.Decisions` | kogen-shaping | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.Feasibility` | kogen-verification, kogen-shaping | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.Model` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/window.go` | `TestIntentFields`, `TestCheckIntent` |
| `project.Intent.ModelLine` | kogen-shaping, kogen-build | `kogen-shaping/shape/shape.go`, `kogen-build/build/legacy_test.go` | `TestIntentFields`, `TestCheckIntent` |
| `project.Intent.Root` | kogen-verification, kogen-shaping | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.Slug` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.SlugLine` | kogen-shaping | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.StepFiles` | kogen-verification, kogen-shaping | `kogen-verification/verify/stepcheck.go`, `kogen-shaping/shape/contract.go` | `TestIntentFields` |
| `project.Intent.Tests` | kogen-shaping | `kogen-shaping/shape/window.go` | `TestIntentFields` |
| `project.Intent.Text` | kogen-shaping, kogen-build | `kogen-shaping/shape/window.go`, `kogen-build/build/builder.go` | `TestIntentFields` |
| `project.Intent.Title` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/window.go`, `kogen-build/build/builder.go` | `TestIntentFields`, `TestCheckIntent` |
| `project.IntentDir` | kogen-shaping, kogen-build | `kogen-shaping/shape/shape_test.go`, `kogen-build/build/build.go` | `TestIntentPaths` |
| `project.IntentExists` | kogen-shaping | `kogen-shaping/shape/context.go` | `TestIntentExistsAndRequireIntentDir` |
| `project.IntentMDPath` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-build/build/helper_test.go` | `TestIntentPaths`, `TestIntentFields`, `TestCheckIntent`, `TestSourceComparisonRules` |
| `project.KogenRunner` | kogen-verification, kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.LoadConfig` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/buildprogram/helper_test.go`, `kogen/cli/repository_config_test.go`, `kogen-shaping/shape/approve_test.go` | `TestApprovalOfTheBaselineHash`, `TestConfigPathAndLoad`, `TestConfigNotInitialized`, `TestTemplateAndRenderConfig`, `TestWritePackageFacts`, `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.LoadIntent` | kogen-shaping, kogen-build | `kogen-shaping/shape/context.go`, `kogen-build/build/brief_caps_test.go` | `TestIntentFields` |
| `project.ModelPath` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/real_test.go`, `kogen-shaping/shape/contract_test.go`, `kogen-build/build/builder.go` | `TestIntentPaths`, `TestCheckIntent` |
| `project.ModelRoles` | kogen | `kogen/cli/readiness/readiness.go` | `TestReadableConfigAndModelRoles` |
| `project.ModelSpec` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.ModelSpec.Invariants` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.ModelSpec.None` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/window.go` | `TestIntentFields`, `TestParseModelSpec` |
| `project.ModelSpec.Path` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.ModelSpec.Samples` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.ModelSpec.Seed` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.ModelSpec.Steps` | kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/model.go` | `TestParseModelSpec`, `TestCheckIntent` |
| `project.NamedCommand.Run` | kogen-verification | `kogen-verification/verify/readiness.go` | `TestNamedCommandsOrder` |
| `project.NewSourceRequest` | kogen-shaping | `kogen-shaping/shape/approve_test.go`, `kogen-shaping/shape/refine.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceRefreshRefineAndRestore`, `TestPublishSourceKeepsThePredecessor` |
| `project.Outline.Examples` | kogen-verification | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Outline.Line` | kogen-verification | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Outline.Name` | kogen-verification, kogen-shaping | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.ParseConfig` | kogen, kogen-shaping, kogen-build | `kogen-build/build/lineup_test.go` | `TestConfigPathAndLoad`, `TestConfigInvalidNamesTheLines`, `TestConfigNotInitialized`, `TestExecutorRoleLineup`, `TestTemplateAndRenderConfig` |
| `project.ParseGherkin` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.ParseStages` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/stages_plan_test.go` | `TestParseStages` |
| `project.ProjectRunner` | kogen-verification, kogen-shaping | `kogen-shaping/shape/init.go` | `TestDetectAndAcceptanceCommand` |
| `project.Protected` | kogen-shaping | `kogen-shaping/shape/context_test.go` | `TestBaselineOrderAndProtectGlobs` |
| `project.PublishSource` | kogen-shaping | `kogen-shaping/shape/approve_test.go` | `TestPublishSourceKeepsThePredecessor` |
| `project.ReadApproval` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/build_test.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash` |
| `project.ReadIntent` | kogen-shaping, kogen-build | `kogen-shaping/shape/datastores_test.go`, `kogen-build/build/resume.go` | `TestIntentFields` |
| `project.ReadableConfig` | kogen | `kogen/cli/readiness/readiness.go` | `TestReadableConfigAndModelRoles` |
| `project.RefineSource` | kogen-shaping | `kogen-shaping/shape/refine.go` | `TestSourceRefreshRefineAndRestore` |
| `project.RefreshSource` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestSourceRefreshRefineAndRestore` |
| `project.RenderConfig` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/init.go` | `TestTemplateAndRenderConfig` |
| `project.RequireIntentDir` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/build.go` | `TestIntentExistsAndRequireIntentDir` |
| `project.ResolveApproval` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestResolveApproval` |
| `project.RestoreSource` | kogen-shaping | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/refine.go` | `TestSourceRefreshRefineAndRestore` |
| `project.ReviewMaterial` | kogen-build | `kogen-build/build/k_revod_gate_test.go` | `TestConfigPathAndLoad` |
| `project.ReviewMaterial.Mode` | kogen-build | `kogen-build/build/k_revod_gate_test.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.Role` | kogen, kogen-shaping, kogen-build | `kogen-shaping/shape/lineup_shape_test.go`, `kogen-build/build/lineup_test.go` | `TestConfigPathAndLoad`, `TestExecutorRoleLineup`, `TestTemplateAndRenderConfig` |
| `project.Role.BaseURL` | kogen-shaping, kogen-build | `kogen-shaping/shape/common.go`, `kogen-build/build/util.go` | `TestConfigPathAndLoad` |
| `project.Role.Effort` | kogen, kogen-shaping, kogen-build | `kogen/cli/executor_wiring_test.go`, `kogen-shaping/shape/evidence_test.go`, `kogen-build/build/cache_id_test.go` | `TestConfigPathAndLoad`, `TestExecutorRoleLineup` |
| `project.Role.Executor` | kogen, kogen-shaping, kogen-build | `kogen/cli/executor_wiring_test.go`, `kogen-shaping/shape/common.go`, `kogen-build/build/executor_external.go` | `TestExecutorRoleLineup` |
| `project.Role.External` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-shaping/shape/common.go`, `kogen-build/build/build.go` | `TestConfigPathAndLoad`, `TestExecutorRoleLineup` |
| `project.Role.MaxRounds` | kogen-shaping, kogen-build | `kogen-shaping/shape/external.go`, `kogen-build/build/executor_external.go` | `TestExecutorRoleLineup` |
| `project.Role.Model` | kogen, kogen-shaping, kogen-build | `kogen/cli/executor_wiring_test.go`, `kogen-shaping/shape/evidence_test.go`, `kogen-build/build/cache_id_test.go` | `TestConfigPathAndLoad`, `TestExecutorRoleLineup`, `TestReadableConfigAndModelRoles` |
| `project.Role.Provider` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-shaping/shape/common.go`, `kogen-build/build/cache_id_test.go` | `TestConfigPathAndLoad` |
| `project.Runner` | kogen-verification | `kogen-verification/verify/real_test.go` | `TestDetectAndAcceptanceCommand` |
| `project.Scenario` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Scenario.Line` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Scenario.Name` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground`, `TestCheckIntent` |
| `project.Scenario.Outline` | kogen-verification, kogen-shaping | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Scenario.Steps` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Scenario.Tags` | kogen-verification | `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.ShapeSource` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.ShapeSource.Origin` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.ShapeSource.Request` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.ShapeSource.Rounds` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.ShapeSource.SourcePath` | kogen-shaping | `kogen-shaping/shape/refine_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.SourceCard` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestSourceCustodyAndMessages` |
| `project.SourceComparison` | kogen-shaping | `kogen-shaping/shape/contract_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceComparisonRules` |
| `project.SourceMessage` | kogen-shaping, kogen-build | `kogen-shaping/shape/refine.go`, `kogen-build/build/builder.go` | `TestSourceCustodyAndMessages` |
| `project.SourceOrigin` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.SourceOrigin.Configuration` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.SourceOrigin.Head` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.SourceOrigin.Tree` | kogen-shaping | `kogen-shaping/shape/shape.go` | `TestCaptureSourcePublishesTheVersionOneReceipt` |
| `project.SourcePath` | kogen-shaping | `kogen-shaping/shape/contract_test.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestPublishSourceKeepsThePredecessor` |
| `project.SourceRef` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestSourceRefMapRoundTrip` |
| `project.SourceRef.Archived` | kogen-shaping | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/refine.go` | `TestSourceRefreshRefineAndRestore` |
| `project.SourceRef.ContractSHA256` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceRefMapRoundTrip`, `TestSourceCustodyAndMessages`, `TestSourceRefreshRefineAndRestore`, `TestPublishSourceKeepsThePredecessor` |
| `project.SourceRef.Equal` | kogen-shaping | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/refine.go` | `TestSourceRefMapRoundTrip`, `TestSourceRefreshRefineAndRestore`, `TestResolveApproval` |
| `project.SourceRef.Map` | kogen-shaping | `kogen-shaping/shape/approve.go` | `TestSourceRefMapRoundTrip`, `TestResolveApproval` |
| `project.SourceRef.Path` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/refine.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceRefMapRoundTrip`, `TestSourceCustodyAndMessages`, `TestSourceRefreshRefineAndRestore` |
| `project.SourceRef.SHA256` | kogen-build | `kogen-build/build/legacy.go` | `TestCaptureSourcePublishesTheVersionOneReceipt`, `TestSourceRefMapRoundTrip`, `TestSourceCustodyAndMessages`, `TestSourceRefreshRefineAndRestore`, `TestResolveApproval` |
| `project.SourceRefFromMap` | kogen-build | `kogen-build/build/build.go` | `TestSourceRefMapRoundTrip` |
| `project.SourceRequest` | kogen-shaping | `kogen-shaping/shape/refine.go` | `TestSourceRefreshRefineAndRestore` |
| `project.Stage` | kogen-build | `kogen-build/build/stages.go` | `TestParseStages` |
| `project.Stage.Checks` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestParseStages` |
| `project.Stage.Goal` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestParseStages` |
| `project.Stage.ID` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestParseStages` |
| `project.Stage.Title` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go` | `TestParseStages` |
| `project.Step` | kogen-shaping | `kogen-shaping/shape/stepcheck_test.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Step.Keyword` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Step.Line` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Step.Text` | kogen, kogen-verification, kogen-shaping, kogen-build | `kogen/cli/approve_deadline_test.go`, `kogen-verification/verify/report.go` | `TestParseGherkinOutlineRowsAndBackground` |
| `project.Template` | kogen-shaping, kogen-build | `kogen-shaping/shape/init.go`, `kogen-build/build/facts_test.go` | `TestTemplateAndRenderConfig` |
| `project.ValidateSource` | kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-shaping/shape/refine.go` | `TestSourceCustodyAndMessages`, `TestSourceRefreshRefineAndRestore` |
| `project.Workers` | kogen-build | `kogen-build/build/legacy.go` | `TestConfigPathAndLoad` |
| `project.Workers.Enabled` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-shaping/shape/lineup_test.go`, `kogen-build/build/legacy_test.go` | `TestConfigPathAndLoad` |
| `project.Workers.Roles` | kogen, kogen-shaping, kogen-build | `kogen/cli/readiness/readiness.go`, `kogen-shaping/shape/batch.go`, `kogen-build/build/legacy_test.go` | `TestConfigPathAndLoad`, `TestTemplateAndRenderConfig` |
| `project.WriteApproval` | kogen, kogen-build | `kogen/cli/buildprogram/helper_test.go` | `TestApprovalPathAndJSON`, `TestApprovalOfTheBaselineHash` |
| `project.WritePackageFacts` | kogen-verification, kogen-shaping, kogen-build | `kogen-shaping/shape/approve.go`, `kogen-build/build/facts.go` | `TestWritePackageFacts` |
| `route.Steps`, `route.Cycle`, `route.Resume`, `route.Stage*` | kogen-build, kogen-review (the review stages) | `kogen-build/build/route.go`, `kogen-build/build/builder.go`, `kogen-review/review/independent.go` | `TestRouteCycleAndResume` |
