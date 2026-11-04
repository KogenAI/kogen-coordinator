# Pin the baseline list in a contract golden

Slug: coord-baseline-contract-golden
Model: not applicable — this pins a pure ordered file-list result, not a workflow transition
Acceptance:
- .kogen/intents/coord-baseline-contract-golden/acceptance.feature
- features/steps/coord-baseline-contract-golden__contract.js

Add a contract-package golden test of project.Baseline(root, "fixture", cfg), checked by go test ./... before consumers derive bytes and digests from a changed list. Do not change Baseline behavior or other production behavior. Preserve existing useful tests. Add contract/testdata/baseline.json containing the four ordered arrays in acceptance, and TestBaselineContractGolden with subtests basic, acceptance, protect and team. Build independent synthetic temporary Git fixture projects, using the existing contract helpers and isolated Git environment, not the coordinator checkout as fixture data. Read the contract's own golden; do not reuse project/testdata goldens. A missing or malformed golden is an error, never an implicit update. Compare arrays exactly in order; mismatch diagnostics include the fixture name and compact JSON arrays on lines containing `old: <recorded array>` and `new: <actual array>`.

Fixtures all use slug fixture and an Intent titled Fixture intent with Model not applicable and an Acceptance section (empty except in acceptance). Write valid project configuration with an acceptance command and steps directory, no protect patterns except in protect. basic has only .kogen/intents/fixture/intent.md and .kogen/project.yaml. acceptance adds acceptance.feature, b.txt and notes.md in the Intent directory and features/steps/z.js and features/steps/a.js. Its Acceptance lists the feature, z.js, a.js and intent.md in that order, exercising deduplication and unsorted list order. protect starts from basic, adds guard/z.txt and guard/a/deep.txt plus an unrelated unprotected file, and sets protect to ["guard/**"]. team starts from basic and adds .kogen/models.yaml using project.ModelsTemplate(). The missing team file is still listed in the other fixtures. Every result is root-relative with / separators. Use independent temp roots so no working-directory bytes enter the golden.

Update contract/README.md to describe this pinned producer contract and allow its own contract golden alongside its synthetic inputs. Document that deliberate Baseline-list changes require the golden update in the same commit and that the commit message must name the baseline change as an expand step so delivery's consumer gate can see it. This feature itself introduces no baseline expansion. Do not introduce an unrelated commit-message validator or alter existing golden update machinery.

## Decisions
- Pin four fixture lists with a checked-in contract golden and no Baseline behavior change (source: request).
- A deliberate future list change must update the golden in the same commit and name the change as an expand step in that commit. This ongoing maintenance obligation needs human evaluation of the actual future change, commit and consumer delivery classification; current acceptance cannot prove future commit discipline or delivery's external consumer-gate interpretation. Document the obligation without claiming an automated guarantee (source: request).
- Detect an injected extra path in exactly the affected fixture comparison and print both lists; repeat from two different checkout directories (source: request).

## Source comparison
- Addressed: Problem and Need's consumer-visible list contract by TestBaselineContractGolden and contract/testdata/baseline.json, executed in the existing producer go test ./... gate; the four requested fixture categories are specified above and exactly represented in acceptance.feature.
- Addressed: all three Synthetic acceptance bullets by the acceptance step's normal two-copy package runs and scratch-only mutation of Baseline for protect. The ordered arrays in acceptance.feature pin the current results, including .kogen/models.yaml when absent.
- Addressed as a human-evaluated maintenance requirement: Need's same-commit golden update and named expand change by the contract README policy and Decisions above. No scenario claims to verify future commits or the external consumer gate. No baseline behavior is changed by this delivery.
- Superseded narrowly: contract/README.md's prohibition on reading goldens now permits this contract package's own baseline golden; it still must not read production sources or project/testdata goldens. Existing synthetic-only isolation and standard-library conventions remain.
- Omitted: no requested behavior. Technical filenames and subtest names are settled here to provide an executable boundary; no external provider, protocol, UI or new runtime dependency is involved.

## Tests
- Pin current Baseline ordered paths for the four synthetic fixture projects: TestBaselineContractGolden and exact checked-in JSON comparison (integration).
- Reject a Baseline extra-path mutation only in its affected golden comparison and print old/new ordered lists: scratch protect-only mutation followed by the whole contract package, observing all four subtest outcomes and diagnostics (regression).
- Produce the same root-relative slash-separated lists in different working directories: two independent scratch checkout package runs against identical expected arrays (integration).
- Preserve existing Baseline behavior and existing useful tests: configured go build, vet and go test checks unchanged (existing).

## Feasibility
- A probe looking for the privately retained proposal in a scratch checkout returned exit 1 with no output (0.0 s); private shaping proposals are not copied into probe worktrees. It made no claim about Go support or observer success. The final-byte controls below run against the submitted observer instead.
- evidence: {"id":"baseline-observer","kind":"observer","inputs":["features/steps/coord-baseline-contract-golden__contract.js"],"observers":["features/steps/coord-baseline-contract-golden__contract.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-contract-golden__contract.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-contract-golden__contract.js bad","exit":1,"output":"rejected\n"}]}
