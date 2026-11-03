# Report every Intent lint problem in one refusal

Slug: k-coord-lint-all-problems
Model: not applicable — `CheckIntent` is a stateless check of submitted text; it returns lines and keeps no state between calls
Acceptance:
- .kogen/intents/k-coord-lint-all-problems/acceptance.feature
- features/steps/lint_all_problems.js
- features/steps/lint_all_problems_driver.go.txt

When `project.CheckIntent` refuses an Intent, it must report every defect its checks can find in one refusal. Each line must name the offending text or value. Today the shaper finds out about defects one at a time, and each refusal costs one invalid submission from its budget.

Changes, all in `project/intent.go` (`CheckIntent` and `lintIntent`):

1. **Title checks are independent.** A title that is not empty is checked for length and for a final period separately, and gets one line for each problem, in that order. A missing or empty title still gives only `title: intent.md must start with a # title`. The length line replaces `title: the title must be at most 50 characters` with `title: the title must be at most 50 characters, not <n>`. `<n>` is the title's length counted by the existing `graphemeLen`, the same count the limit already uses (a 51-character `日` title gives `not 51`). The line `title: the title must not end with a period` keeps its text.
2. **Each unsourced decision gets its own line.** The decisions check no longer stops at the first match. It adds one line per `## Decisions` bullet that does not match `sourceRe`, in document order, and it names the bullet line exactly as `Intent.Decisions` holds it, including its leading `- `. This mirrors the Tests line at `project/intent.go:276`. The line is `decisions: <bullet> must end with `(source: request)` or `(source: answer <n>)``, for example ``decisions: - Report all problems must end with `(source: request)` or `(source: answer <n>)``. It replaces `decisions: a decision has no source`.
3. **A Gherkin parse error no longer hides intent.md problems.** When `acceptance.feature` exists but does not parse, `CheckIntent` still returns `intent/parse: the Intent cannot be read` with exit 1. Its first line is still `acceptance.feature line <n>: <message>`, unchanged. The lint lines found in intent.md follow it, in the same order and text as the lint refusal. These are every lint check except the two that need parsed scenarios: `acceptance: acceptance.feature has no scenario` and the per-scenario tag and Then lines. If intent.md has no problems, the parse refusal has only the Gherkin line, as today.

Unchanged:
- What is accepted.
- The `intent/lint` class, its detail `the Intent needs changes` and exit 1.
- The `intent/parse` class, its detail and exit 1.
- The order of check groups: title, slug, model, tests, acceptance, decisions, feasibility, scenarios, stages.
- The text of every other line.
- The refusals for a missing `intent.md` or a missing `acceptance.feature`.
- The Model and Tests checks. Their `switch` branches are mutually exclusive by nature, so they may be rewritten as plain `if`s, but their output must not change.
- `modelProblems` stopping early when the model path or file is wrong. Its later checks depend on that file.

Out of scope: `durable/`, `project/baseline.go`, `project/detect.go`, the Gherkin parser's accepted language, and kogen-shaping's budget and counters. Consumer tests outside this repository that pin the two old line texts (the contract comment names kogen-shaping `shape/contract_check_test.go`) are paired consumer items for those repositories and are not edited here.

The Build updates the tests that pin the old lines. In `project/intent_test.go`, these are the `TestCheckIntentRules` cases. In `contract/intent_test.go`, these are the `TestCheckIntent` lines for a 51-character title and for the broken Intent's decision. The `intent` results recorded in `project/testdata/golden.json` are regenerated only with `go test ./project/ -update`, as the README prescribes, never edited by hand. Afterwards, review `git diff -- project/testdata`: only the changed title and decision lines may differ.

## Decisions
- Every check reports independently: title length and final period each get a line, and each unsourced decision gets its own line, in document order (source: request)
- Lines keep the `<field>: <what to change>` shape and name the offending value: the title's current length and the decision bullet's text (source: request)
- A Gherkin parse error stays `intent/parse` (exit 1) with its line first, followed by the intent.md lint lines that do not need scenarios (source: request)
- No change to what is accepted, to the `intent/lint` class or exit code 1, or to the shaper's budget (source: request)

## Source comparison
- Addressed: exclusive title `switch` (`project/intent.go:250-257`) → change 1; acceptance scenario 1 expects both title lines.
- Addressed: `decisions: a decision has no source` names no decision and `break`s (`:297-301`) → change 2; scenarios 1 and 4 expect two decision lines with their text, and a sourced decision between them gets no line.
- Addressed: the 50-character line gives no current length (`:253`) → change 1 adds `, not <n>`; scenario 1 (`not 55`) and scenario 2 (`not 51` for 51 `日`, a grapheme count rather than a byte count).
- Addressed: a Gherkin parse error returns alone before lint (`:228-231`) → change 3; scenario 4 shows it with intent.md lines and scenario 5 shows it alone for an otherwise correct intent.md.
- Addressed without an output change: the Model and Tests `switch`es (`:263-279`) have mutually exclusive branches, so making them independent changes no output; existing cases stay green.
- Preserved: the request's probe L0 (a long title ending in a period plus two unsourced decisions, today one title line and one decision line without text) is acceptance scenario 1.
- Preserved: no change to acceptance, the `intent/lint` class, exit 1 or the shaper's budget; scenario 3 shows that a correct Intent (a 50-character title and sourced decisions, one ending in a period) is still accepted.
- Not encoded, as requested: the evidence counts (LANE.md Registration 3, FBANK row 6, the aorclaude runs) motivate the change but are not a rescue claim. The share of multi-defect lint refusals is not measured.
- Out of scope as requested: `durable/`, `project/baseline.go`, `project/detect.go`, the Gherkin language, kogen-shaping counters, and the earlier tests-line regex fix 514dab4.

## Tests
- Title length and final period are reported independently, and the length line names the current length: update the `title of 51` case in `TestCheckIntentRules` (`project/intent_test.go`) to `title: the title must be at most 50 characters, not 51`, and add a case with a title longer than 50 characters that ends in a period, expecting both title lines (unit)
- Each unsourced decision gets its own line naming its bullet text: update every `decision ...` case and the `many problems in order` case in `TestCheckIntentRules` to the new line, and add a case with two unsourced decisions around a sourced one, expecting two lines in order (unit)
- A Gherkin parse error is followed by the intent.md lint lines: add a `TestCheckIntentRules` case with an unparseable feature and intent.md problems, expecting reason `parse` and the Gherkin line first; keep `acceptance not parseable` expecting the Gherkin line alone (unit)
- The contract pins the new line texts: update `TestCheckIntent` in `contract/intent_test.go` for the 51-character title (`, not 51`) and for the broken Intent's decision line (`decisions: - Fixture decision. must end with ...`) (unit)
- The recorded intent results follow the new lines: regenerate `project/testdata/golden.json` with `go test ./project/ -update` and review the diff (existing)
- Accepted Intents and every other line are unchanged: the existing valid and other-problem cases in `TestCheckIntentRules`, `TestCheckIntent` and `TestIntentCheckMatchesElixir` stay as they are (existing)
- The end-to-end refusal through `project.CheckIntent` shows every problem: acceptance scenarios driven by `features/steps/lint_all_problems.js` (scenario)

## Feasibility
- The scratch driver (the submitted `lint_all_problems_driver.go.txt`, copied to a temporary `main.go` and built with `go build` from the repository root, go1.27.2) calls `project.CheckIntent` and prints `sys.Error.Render()`. On the unchanged tree, scenario 1 gives `intent/lint: the Intent needs changes` with only `title: the title must be at most 50 characters` and `decisions: a decision has no source`, which reproduces the request's L0. Scenario 4 gives only the Gherkin line. Scenarios 3 and 5 pass and scenarios 1, 2 and 4 fail (5 scenarios, 2 passed, 3 failed).
- A scratch reference implementation, applied to a copy outside this checkout and not submitted, passed all 5 scenarios (27 steps). This confirms the fixtures are reachable and consistent. The same run failed only the old-line expectations in `TestCheckIntentRules`, `TestIntentCheckMatchesElixir` and the contract, which the Tests section updates.
- evidence: {"id":"lint-observer","kind":"observer","inputs":[".kogen/intents/k-coord-lint-all-problems/acceptance.feature","features/steps/lint_all_problems_driver.go.txt"],"observers":["features/steps/lint_all_problems.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/lint_all_problems.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/lint_all_problems.js bad","exit":1,"output":"rejected\n"}]}
