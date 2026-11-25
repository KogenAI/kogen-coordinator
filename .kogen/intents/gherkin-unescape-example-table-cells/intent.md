# Decode escapes in Gherkin Examples cells

Slug: gherkin-unescape-example-table-cells
Model: not applicable — a stateless transformation of feature text
Acceptance:
- .kogen/intents/gherkin-unescape-example-table-cells/acceptance.feature
- features/steps/gherkin-unescape-example-table-cells__parse.js
- features/steps/gherkin-unescape-example-table-cells__driver/main.go

`project.ParseGherkin(text string) ([]Scenario, error)` must substitute decoded Examples values into generated scenario names and step text. Replace raw cell substitution, not table parsing: split the original row, keep its current trimming and width checks, then decode each Examples cell (including header cells used as placeholder keys). Decode `\|` as a literal pipe, `\n` as a newline, and `\\` as a single backslash. Decode each escape once; leave other text, including unrecognized backslash sequences, unchanged. An unescaped pipe remains a cell boundary. Do not decode the completed name or step, or change the existing order of placeholder substitution.

Implementation scope is `project/gherkin.go` and `project/gherkin_test.go` only. Escaped-pipe step tables still parse as before and their cells are still discarded. Outline row counts, tags, and report-line mapping are unchanged.

The configured Cucumber runner invokes the slug-owned steps from the repository root. The Given sends the inner feature doc string as UTF-8 on stdin to `go run ./features/steps/gherkin-unescape-example-table-cells__driver/main.go`, using the repository's Go toolchain (Go 1.27.2). The driver calls the public parser and emits one JSON object: `scenarios` is an ordered array with one array per scenario, each containing its name followed by its ordered step texts; a parser error instead yields an `error` string containing the parser's line-qualified message. The Then compares the entire object against the expected `scenarios` from its doc string, so an error, extra scenario or extra step cannot pass. Tool failures are distinct from parser results.

## Decisions
- Keep the existing row splitter and decode the supported escape sequences once in Examples cells after splitting, before matching placeholders or inserting values. (decision: D1, round 1) (evidence: project/gherkin.go; project/gherkin_test.go) (source: request)
- Preserve ordinary cell text and step-table parsing, and leave outline row counts, tags, and report-line mapping unchanged (source: request)

## Source comparison
- Addressed: `ev-bc08cae2` locates the raw-cell leak between `gCells` and `pickles` in `project/gherkin.go`. The output rule above and “An escaped pipe stays in its Examples cell” exercise both the generated name and step through `ParseGherkin`; the raw-substitution control must fail there.
- Addressed: request acceptance 2 requires separator pipes to keep each value paired with its own placeholder. The mixed escaped-and-unescaped row in the first scenario detects premature decoding, and “An unescaped pipe separates ordinary cells” checks ordinary multi-column substitutions and row order independently.
- Addressed: request acceptance 3 and the scope exclusions are preserved by the plain-cell and escaped-pipe step-table scenarios and the existing parser tests named below, including the controls for counts, tags and report lines. The implementation scope remains the two requested project files.
- Superseded: inserting raw Examples escapes into generated text. No requested behavior is omitted and no conflicting scope change is proposed.

## Tests
- An escaped pipe is literal content in both generated outputs and a separator still maps the next cell to its own placeholder: add `TestGherkinDecodesExamplesCells` in `project/gherkin_test.go` through `ParseGherkin`, checking exact names and ordered step texts for the mixed row (regression)
- Examples header keys and values decode supported escapes before substitution, without re-decoding a decoded backslash: include the newline and backslash fixture from acceptance in `TestGherkinDecodesExamplesCells` (unit)
- Ordinary Examples cells keep their content and substitution order: keep `TestGherkinRules/outline_placeholders_replace_in_order` (existing)
- Step tables with escaped pipes are still accepted and skipped, and table validation is unchanged: keep `TestGherkinRules/tables_after_steps_are_skipped` and the row-width and row-without-end controls in `TestGherkinProblems` (existing)
- Outline counts, tags, and report lines remain unchanged: keep `TestGherkinScenariosExposeReportLines` (existing)

## Feasibility
- Go 1.27.2 is installed and the unchanged `go test ./project -run '^TestGherkin' -count=1` passes (baseline probe, exit 0). The configured Node v24.21.0 and Cucumber 13.3.0 report their versions (exit 0).
- Checked the installed Gherkin lexer for the escape alphabet. The initial `dist/src/GherkinLine.js` path was absent (exit 2); inspection of the installed `src/GherkinLine.ts` succeeded (exit 0) and showed the pipe, newline and backslash mappings. No network or new dependency is needed.
- Prepared isolated parser overlays for the expected result and counterexamples in `controls.json` (generation probe, exit 0). The final observer accepts matching ordinary substitutions and rejects swapped cells independently of the missing feature (exit 0 and 1 respectively).
- evidence: {"id":"parse-and-compare","kind":"observer","inputs":["features/steps/gherkin-unescape-example-table-cells__parse.js","features/steps/gherkin-unescape-example-table-cells__driver/main.go"],"observers":["features/steps/gherkin-unescape-example-table-cells__parse.js","features/steps/gherkin-unescape-example-table-cells__driver/main.go"],"checks":[{"name":"good","command":"printf '%s\\n' 'Feature: Labels' '  Scenario Outline: label <left> and <right>' '    Then use <right> with <left>' '    Examples:' '      | left | right |' '      | a | b |' | \"$KOGEN_NODE\" features/steps/gherkin-unescape-example-table-cells__parse.js '[[\"label a and b\",\"use b with a\"]]'","exit":0,"output":"match\n"},{"name":"bad","command":"printf '%s\\n' 'Feature: Labels' '  Scenario Outline: label <left> and <right>' '    Then use <right> with <left>' '    Examples:' '      | left | right |' '      | b | a |' | \"$KOGEN_NODE\" features/steps/gherkin-unescape-example-table-cells__parse.js '[[\"label a and b\",\"use b with a\"]]'","exit":1,"output":"mismatch\n"}]}
