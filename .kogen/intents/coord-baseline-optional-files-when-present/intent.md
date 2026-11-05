# List team model file only when present (expand)

Slug: coord-baseline-optional-files-when-present
Model: not applicable — a deterministic list computed from the files present; no workflow state or interacting transitions
Acceptance:
- .kogen/intents/coord-baseline-optional-files-when-present/acceptance.feature
- features/steps/coord-baseline-optional-files-when-present__baseline.js

`project.Baseline(root, slug string, cfg *Config) ([]string, error)` (`project/baseline.go`) today always lists the team model lineup path `project.ModelsPath` (`.kogen/models.yaml`) immediately after `project.ConfigPath` (`.kogen/project.yaml`), whether or not the project has that file (since 4826fb1 "Add opt-in model lineup files"). The file is opt-in, so every project that never opted in got a different baseline list than before, and the context bytes, readiness and approval digests derived from it changed: a user with a saved Build checkpoint or approval gets `candidate/resume_refused: ... baseline/configuration changed` although nothing in their project changed.

Change (replaces the always-listed rule):
- `.kogen/models.yaml` is in the list only when the project has it: it is left out exactly when `os.Lstat(<root>/.kogen/models.yaml)` reports an error satisfying `errors.Is(err, fs.ErrNotExist)` and no `protect` pattern listed it (through `Protected`). Otherwise it appears exactly once, immediately after `.kogen/project.yaml`, as today, including when a `protect` pattern also matches it (for example `.kogen/*.yaml`).
- A project without `.kogen/models.yaml` therefore gets exactly the list it had before the lineup existed: `intent.md`, `acceptance.feature`, the acceptance list, the remaining Intent files sorted, `.kogen/project.yaml`, then the protected files sorted, each once.
- `.kogen/local/models.yaml` (and `.kogen/local/checks.yaml`) are never added by this rule; on their own they add nothing to the list.
- Everything else is unchanged: order, de-duplication, `Protected`, protect diagnostics, the Intent folder walk and its errors, `Hash`/`HashWithUnreadable`, and every caller of `Baseline` (`CaptureSource`, `ResolveApproval`, source corrections, `WritePackageFacts`).

Added for consumers (expand step): `func FormerBaseline(paths []string) []string` in package `project`. It returns a new slice and never modifies `paths`: when `paths` contains `ConfigPath` and does not contain `ModelsPath`, a copy with `ModelsPath` inserted immediately after the first `ConfigPath`; otherwise an unchanged copy. It is the list the former always-listed rule produced for the same project. A consumer that finds a saved baseline list equal to `FormerBaseline(current)`, or an approval `SHA256` equal to `Hash(root, FormerBaseline(current))`, knows the checkpoint or approval was saved under the former rule while the team file was absent and nothing else changed (the extra entry hashes as `missing`), so it can resume it instead of refusing with an unexplained "baseline/configuration changed". Using it in kogen-build and kogen-verification is their paired consumer work, outside this repository.

The producer golden `contract/testdata/baseline.json` (`TestBaselineContractGolden`, from a74c769) changes in this same commit, and the commit subject names the change as an expand step, as `contract/README.md` requires. Update the other recorded goldens that hold baseline lists or approval hashes (`project/testdata/parity.json`, `project/testdata/facts-golden.json`) only through `go test ./... -update` as the README describes, never by hand, and review the diff. Update the README paragraph that says the team path is in the baseline "even when the team file is absent", the `Baseline` doc comment, and the `contract/README.md` baseline items.

## Decisions
- A project without `.kogen/models.yaml` gets exactly its pre-lineup baseline list; with the file, it appears once right after `.kogen/project.yaml`; a matching `protect` pattern still lists it once; `.kogen/local/models.yaml` alone adds nothing (source: request)
- Order, de-duplication and protected files stay as they are (source: request)
- Old checkpoints and approvals, which the request leaves to the shaper: resume rather than refuse; the coordinator supplies `project.FormerBaseline` so consumers can recognize a list or approval hash saved under the former rule for an unchanged project, and the refusal text itself lives in the consumers (source: request)
- The contract golden changes in the same commit, and the commit subject says "expand" as contract/README.md requires (source: request)

## Source comparison
- Addressed: absent `.kogen/models.yaml` gives the pre-lineup list (Intent prose "Change"; acceptance scenarios 1-3 and 5).
- Addressed: present file listed once right after `.kogen/project.yaml`; `protect` match still once (`.kogen/*.yaml` in scenario 2); `.kogen/local/models.yaml` alone adds nothing (scenario 3).
- Addressed: order, de-duplication and protected files unchanged (exact ordered lists in every scenario; Intent prose "Everything else is unchanged").
- Addressed: producer golden from a74c769 changes in the same commit (scenario 5 checks the exact golden and runs the existing `TestBaselineContractGolden` subtests basic, acceptance, protect and team); the commit subject names the expand step.
- Addressed: "resume or a refusal that names the baseline-rule change, never unexplained": decided as resume, via the new `project.FormerBaseline` (scenario 4). Applying it in kogen-build's resume and approval checks is consumer work outside this repository.
- Not executable here: "the delivery consumer contract check against kogen-build and kogen-verification shows no NEW failures" (`TestALegacyReviewVerifyCheckpointJudgesTheSavedVerdictWithoutAskingAgain`, `TestMain76BuildsResumeAndLand/*`, `TestReadinessRecordAndIdentity`) runs in delivery's consumer gate, not in this checkout. The paired consumer rows b-consumes-baseline-optional-models and v-consumes-baseline-optional-models have landed, with fixtures that give the same baseline under both rules (request, paired re-shape 2026-11-05T13:57Z).
- Context only, not scope: land logs `delivery/logs/land/coord-baseline-optional-files-when-present-20261104T122934Z.log` (candidate 94be147) and `-20261104T222055Z.log` (candidate 285e710), the queue hold, Builds daf46fc0 and eaee9f5a, and consumer-matrix-20261103.tsv reds, which the request says nobody has attributed to 4826fb1.
- Replaces: COORD-BASELINE-OPTIONAL-FILES-WHEN-PRESENT (request header); re-shaped on current main (5f119a3).
- Superseded: README sentence "The approval baseline includes the team path immediately after the project configuration, even when the team file is absent."

## Tests
- Without `.kogen/models.yaml` the baseline has no models entry: update `TestBaselineWithoutIntentFiles`, `TestBaselineSkipsDanglingSymlink` and the ordered-baseline test in `project/intent_test.go` (no team file written) to expect no `ModelsPath` (integration)
- With `.kogen/models.yaml` it appears once right after `.kogen/project.yaml`, also when a `protect` pattern matches it: add a `project` test writing the team file with and without a `.kogen/*.yaml` protect pattern (integration)
- Reported failure, pre-lineup list restored for a project that never opted in: the acceptance scenario computing the fixture list without the team file, and the updated `contract/approval_test.go` `TestBaselineOrderAndProtectGlobs` expected list (regression)
- `.kogen/local/models.yaml` alone adds nothing, and adding the team file changes the approval hash: update `contract/models_test.go` `TestModelsBaselineHash` to expect `[ConfigPath]` first and to recompute the baseline after writing the team file (integration)
- Producer golden: update `contract/testdata/baseline.json` so `TestBaselineContractGolden` basic, acceptance and protect omit `.kogen/models.yaml` and team keeps it (existing)
- `FormerBaseline` inserts `ModelsPath` after `ConfigPath` only when absent, keeps a list that already has it, and never modifies its input: add a unit test in `project` and pin it in the contract suite with a `contract/README.md` item (unit)
- Recorded goldens with baseline lists or approval hashes: regenerate `project/testdata/parity.json` and `facts-golden.json` with `go test ./... -update` and keep their tests passing (existing)

## Feasibility
- evidence: {"id":"baseline-observer","kind":"observer","inputs":["features/steps/coord-baseline-optional-files-when-present__baseline.js"],"observers":["features/steps/coord-baseline-optional-files-when-present__baseline.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-optional-files-when-present__baseline.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-optional-files-when-present__baseline.js bad","exit":1,"output":"rejected\n"}]}
