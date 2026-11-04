# Reject removed max_rounds configuration

Slug: k-coord-reject-max-rounds
Model: not applicable — configuration validation is stateless
Acceptance:
- .kogen/intents/k-coord-reject-max-rounds/acceptance.feature
- features/steps/k-coord-reject-max-rounds__load.js

Reject models.<role>.max_rounds in project configuration and both model-lineup files. Diagnose the removed key regardless of its value or executor. Retain normal file/line configuration diagnostics. The message must name max_rounds, say it was removed, and explain that the external executor's own round limit caps a role and 6 caps a review role whose executor supplies none. No new commands, flags, or increased timeouts. Update contract tests and documentation together with the schema change, not by preserving YAML acceptance.

Preserve all other configuration semantics, exported API compatibility and checkpoint bytes. Keep Role.MaxRounds (zero for loaded roles) and DefaultExternalRounds=6 available for existing consumers; removing the YAML key does not require removing Go symbols. Do not change module identity or dependency pins as part of this fix. Work from current main, not the old ffca707 candidate.

## Decisions
- Reject the removed key rather than silently accepting it; explain the actual round policy (source: request).
- No commands, flags or timeout increases; this absence-of-interface-expansion constraint needs human evaluation of the final diff, not a claim from configuration scenarios (source: request).
- Consumer comparison needs human evaluation of delivery's external consumer gate against current main: consumers and their harness are not present in this repository. Require no new shaping regressions and successful unrelated kogen/kogen-review behavior; local acceptance does not claim this external result (source: request).

## Source comparison
- Addressed: Request Problem/Need in rejection scenarios and contract-test updates; max_rounds is no longer an accepted schema option, including the shared LoadModels schema.
- Addressed: every other key remains unchanged through existing project and contract suites and positive acceptance cases. Preserve MaxRounds/DefaultExternalRounds Go compatibility rather than needlessly expanding this deliberate YAML interface change.
- Superseded: Earlier attempt 85520cbd/cfe50c65 on ffca707 and the demand to repair title shortening are explicitly withdrawn by delivery's 4 Nov correction. TestSubmissionRetryOne/title_fallback and TestShapeShortensATooLongTitleOnlyOnTheLastAttempt/last_attempt are baseline failures, not requirements to fix here. Require no new kogen-shaping failures relative to current coordinator main, not an invented all-green historical baseline.
- Addressed: automatic retry consumer-gate refusal: preserve canonical github.com/KogenAI/kogen-loop/sys type identity, avoiding reported kogen BUILD failures in approve.go:77, init.go:1123 and refine.go:81. kogen-review TestLoadConfigReadsTheCommands and TestRoleKeepsTheCheckpointBytes must retain unrelated semantics; if their fixtures pin max_rounds acceptance, that pin intentionally changes. Report deliberate consumer changes as final lines `consumer-first: <consumer repo> <test>: <what the consumer should stop pinning>`. Do not claim inaccessible consumer suites were run. Delivery's consumer gate compares candidate with current main, including kogen-shaping; retain that external release requirement and human handoff.

## Tests
- Removed max_rounds always fails clearly: add focused ParseConfig regression coverage and file-loader scenarios; update TestExecutorRoleLineup and models contract cases from acceptance to rejection, retaining API and checkpoint checks (regression).
- Shared lineup schema rejects the same key: exercise LoadModels for team and local files, updating contract/models_test.go (integration).
- Other configuration behavior and exported compatibility stay unchanged: retain existing project, contract and consumes suites, adjusting only fixtures that deliberately set the removed key; retain canonical module imports and dependency pins (existing).
- Consumer compatibility relative to current main: delivery's external consumer gate must introduce no unrelated failures in kogen, kogen-review or kogen-shaping; human evaluation must confirm the gate result, with the two corrected title failures treated as baseline (integration).

## Feasibility
- none
