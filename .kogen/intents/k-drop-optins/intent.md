# Drop the opt-in Shape and review options

Slug: k-drop-optins
Model: not applicable — configuration parsing is stateless; one file in, one Config or error out
Acceptance:
- .kogen/intents/k-drop-optins/acceptance.feature
- features/steps/k-drop-optins__load.js

This is the kogen-coordinator part of KI-5 (K-DROP-OPTINS), under the principle "don't overengineer, simpler is always better". Four top-level options in `.kogen/project.yaml` stop existing: `shape_workers` (K16), `shape_audit` (K13), `shape_decision_check` (K14) and `review_material` (K15). Each one becomes a constant at today's default. No finding names a different winner, so no default changes. The commit body must say so: "No finding names a different winner; every default is unchanged."

New behaviour of `project.ParseConfig`, `project.LoadConfig` and `project.ReadableConfig`:
- In `validateConfig`, the four top-level keys are read and ignored, whatever their value, including malformed values (`shape_workers: x`, `review_material: {mode: sometimes}`, `shape_audit: {enabled: 'true'}`, nested unknown keys). Their sections are not validated and produce no problems. Give them one `case` with a short comment in the style of the existing `models.plan` rule ("Older project files may retain ... It is ignored"). Delete the validators that only served them: `(*validator).workers`, `(*validator).audit`, `(*validator).reviewMaterial`, and `(*validator).enabledOnly` once it has no caller.
- Every Config these functions return from parseable text carries the fixed values: `ShapeWorkers == Workers{Enabled: false, Roles: map[string]Role{}}` (an empty, non-nil map), `ShapeAudit == Audit{Enabled: false}`, `ShapeDecisionCheck == DecisionCheck{Enabled: false}` and `ReviewMaterial == ReviewMaterial{Mode: "parts"}`. `ReadableConfig` of unparsable text keeps its current fallback value.
- Every other key keeps its behaviour. Other unknown top-level keys are still rejected as `unknown key <key>`. `models.<role>.max_rounds` is still rejected with its existing message. `models.plan` is still ignored.

Keep the exported Go symbols `Workers`, `Audit`, `DecisionCheck`, `ReviewMaterial` and the Config fields `ShapeWorkers`, `ShapeAudit`, `ShapeDecisionCheck`, `ReviewMaterial`. Their doc comments change to say the YAML option was removed and the field always holds the fixed value above. Reason: consumer production code still reads these fields (kogen `cli/readiness/readiness.go`, kogen-shaping `shape/shape.go` and `shape/batch.go`, kogen-build `build/legacy.go`), and the request's ordering rule removes the reader before the provider. Deleting the symbols is a follow-up coordinator item after kogen, kogen-shaping and kogen-build stop reading them. `configDigest` in `project/provenance.go` stays unchanged. It now always encodes `shape_workers => %{enabled: false}`, so the digest of every file without the removed keys stays byte-identical.

K17 (`max_rounds`) is already settled in this repository: commit ce1e6ba rejects the YAML key, and `DefaultExternalRounds` is the hardcoded constant 6, asserted by existing tests. `Role.MaxRounds` stays for consumers, as that Intent decided. The other KI-5 rows (K9 build budget, K11 shape retry, K12 shell timeout, K18/K19 node environment) and K16's `Request.Single` wiring have no setting in this repository (`project/`, `git/`, `durable/`, `route/` searched). They are follow-up items in the repositories that own them (kogen-build, kogen-shaping, kogen-executor, kogen). Do not change any other repository, `go.mod`/`go.sum` pins, CLI commands or flags. Add no new option.

Tests and goldens:
- In `project/config_test.go`, delete the cases that tested only the removed options: the `shape_audit`, `shape_decision_check`, `review_material` and `shape_workers` error-table rows; `TestParseConfigReviewMaterial`; the audit and decision-check default and enabled tests; the workers parse test; the `shape_workers` section from the provider/executor loops; and the `shape_workers.read` executor case. Replace them with one unit test. It parses a file that names all four keys with non-default values and one with malformed values, and asserts that both load and carry exactly the fixed values above. Keep every other test unchanged.
- In `contract/config_test.go` `TestConfigPathAndLoad`, keep `fullConfig` as it is (it still names the four keys). Assert `ShapeAudit == Audit{Enabled: false}`, `ShapeDecisionCheck == DecisionCheck{Enabled: false}`, `ReviewMaterial == ReviewMaterial{Mode: "parts"}`, `ShapeWorkers.Enabled == false` and `ShapeWorkers.Roles` equal to an empty non-nil `map[string]project.Role{}`. In `contract/README.md`, update the `config-path` bullet to say that the removed keys are ignored and these fields hold the fixed values. Keep the inventory rows, because the symbols remain.
- The recorded goldens drift only in results: the 13 `golden.json` config cases whose text names `shape_workers`, and the three `facts-golden.json` `config_digests` cases whose text names `shape_workers`. Those three now share the digest of `version: 1\n`, `2ae4efac7f8bb732b81bfd44902c93bc856aaa5d78a08a40ff473c42485dcc47`, and at least 10 distinct digests remain. Re-record them only with `go test ./project/ -update` on current main, review `git diff -- project/testdata`, then run `go test ./...` without the flag. Never edit golden bytes by hand. `parity.json` and every approval hash, contract hash and receipt must not change: their fixture `project.yaml` with `shape_workers: enabled: false` still loads to the same Config and digest.
- Docs: in README.md, next to the existing `max_rounds` paragraph, add one sentence saying the former `shape_workers`, `shape_audit`, `shape_decision_check` and `review_material` settings are ignored, and that Config holds their fixed defaults (workers off, audit off, decision check off, review material `parts`). This repository has no CHANGELOG or docs/configuration.md.

Consumers: their tests that set one of these keys to a non-default value and expect the old effect will now see the fixed values. This is a deliberate change. End the Build's final summary with one line per affected consumer test you can identify from the contract inventory: `consumer-first: <consumer repo> <test>: <what the consumer should stop pinning>`. Candidates are kogen-build `build/k_revod_gate_test.go` (`review_material: on_demand`), kogen-shaping `shape/decision_test.go` (`shape_decision_check`), kogen-shaping `shape/lineup_test.go` and kogen-build `build/legacy_test.go` (`shape_workers` enabled and roles), and kogen-shaping tests of `shape_audit`. Do not claim the consumer suites were run.

## Decisions
- Files that still name a removed option are loaded with that key ignored, not rejected. The request says "behaviour with today's defaults is unchanged", and older project files state those defaults (for example `shape_workers: enabled: false` in the recorded parity fixture). This follows the existing `models.plan` rule. (source: request)
- Each removed option becomes a constant at today's default (workers off, audit off, decision check off, review material `parts`), because no finding names a different winner. The commit body states this. (source: request)
- The exported Go fields and types stay, fixed at those values, until consumers stop reading them, per the request's rule that the setter goes first and the provider second. Deleting them is a follow-up coordinator item. (source: request)
- No new option, CLI command or flag, and no change to other repositories or dependency pins. (source: request)

## Source comparison
- Addressed: K13 `shape_audit`, K14 `shape_decision_check`, K15 `review_material` and K16 `shape_workers` (configuration part) are removed as options and hardcoded at today's defaults. Acceptance scenarios 1–3 and the unit and contract tests cover this.
- Addressed: "Tests that exercised only them are deleted, every default-behaviour test passes unchanged" and "where a value is hardcoded, a test asserts the constant": see the Tests section. Golden results drift only through `-update`.
- Addressed: "No new option. No CLI command or flag change." Scenario 4 shows that other unknown keys and `max_rounds` are still rejected.
- Already settled: K17 `max_rounds` (ce1e6ba). `DefaultExternalRounds` = 6 is asserted by the existing `TestExecutorRoleLineup` and project tests.
- Omitted, owned elsewhere: K9, K11, K12, K18, K19, and K16's `Request.Single` wiring. They have no setting in kogen-coordinator and are follow-up items for kogen-build, kogen-shaping, kogen-executor or kogen.
- Omitted, owned elsewhere: `cli/third_party/kogen-loop/**`, `cli/loop-pin.json`, re-pins and the loop Intents (LI-*). They are not in this repository and nothing here changes them.
- Superseded: the earlier candidate 0e1480d3 and its golden conflict. Build on current main and re-record goldens only with `-update`. The `review_invalid` stops came from the reviewer route, not from this contract. The rejected `gofmt` step is gone: acceptance contains no shell check commands, and the configured checks run them.

## Tests
- Removed top-level options are ignored with any value, and Config carries the fixed defaults: one new ParseConfig test in `project/config_test.go` replaces the deleted option tests (unit).
- The contract pins the fixed values for a file that still names the keys: update `TestConfigPathAndLoad` in `contract/config_test.go` (unit).
- `LoadConfig` of real project files that name the removed keys with non-default, malformed or default values: acceptance scenarios 1–3 through a Go driver (integration).
- Other unknown keys and the removed `max_rounds` are still rejected: acceptance scenario 4 plus the existing config error tests (existing).
- Default configuration digests, approval hashes and receipts stay byte-identical: existing `TestConfigDigestMatchesElixirTermToBinary`, `TestBaselineHashMatchesElixir` (`parity_test.go`) and provenance tests. Only the three `shape_workers` digest results and 13 golden config results are re-recorded with `-update` (existing).

## Feasibility
- none
