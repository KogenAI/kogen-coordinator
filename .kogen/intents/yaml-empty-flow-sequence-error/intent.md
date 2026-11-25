# Reject unfinished YAML flow sequences

Slug: yaml-empty-flow-sequence-error
Model: not applicable — parsing and error classification are stateless
Acceptance:
- .kogen/intents/yaml-empty-flow-sequence-error/acceptance.feature
- features/steps/yaml-empty-flow-sequence-error__parse.js
- features/steps/yaml-empty-flow-sequence-error__driver/bridge.go.txt
- features/steps/yaml-empty-flow-sequence-error__driver/main.go

Return a normal line-numbered YAML parse error for an unfinished flow sequence instead of panicking. Report missing collection closers before parsing an empty item at end of input. Keep implementation and implementation tests in `project/yaml.go` and `project/yaml_test.go`; do not expand the YAML subset or change valid configuration parsing.

## Decisions
- At end of input with a flow collection still open and an item expected, use the existing YAML failure path, the existing unclosed diagnostic for that collection type, and the opening source line. `parseYAML(text)` returns a nil node and one line-numbered problem without panicking. Keep recovery limited to `yamlFail`, rather than masking unrelated runtime panics. (evidence: project/yaml.go; project/yaml_test.go) (source: request)
- Do not convert malformed collections to null or alter the existing unclosed-collection diagnostic text. A closed empty flow sequence remains valid. (evidence: project/yaml.go; project/yaml_test.go) (source: request)
- `project.ParseConfig(text, file)` on a configuration containing an unfinished flow sequence returns a nil `*Config` and its normal classified configuration error without panicking: `environment/project_config_invalid`, exit 3, the supplied file as detail, and the single YAML diagnostic in `Lines`. Use the same parser behavior for direct and nested values, without caller-specific recovery or a new error class. (evidence: project/config.go; project/yaml.go) (source: request)

## Source comparison
- Addressed — evidence ev-7d44ec79 and acceptance 1: the direct-parser scenario uses the exact `x: [` input, checking no root and the line 1 unclosed-sequence problem. At the inspected HEAD, `flowItems` calls the item parser with empty text, but `flow` uses prefix checks and `plainFlow` safely handles empty text; the reported index panic is not reproducible there. The explicit missing-item guard removes that dependency. The unchecked-index control exercises the reported failure mode; it is not a claim about HEAD.
- Addressed — acceptance 2: the direct-parser scenarios use the exact `a: {` and `a: [1, 2` inputs, rejecting both instead of returning a node or null. They require the parser's existing unclosed-collection diagnostics (`unclosed {` and `unclosed [` respectively) and the original source lines. The bare map opener currently falls through to `flowPair` and returns a pair-syntax error; that fallback is replaced for the bare opener by the requested unclosed-map diagnostic, already used for nonempty unclosed maps. The nonempty sequence behavior is unchanged.
- Addressed — acceptance 3 and its caller-only counterexample: the public configuration scenario uses an unfinished sequence inside a flow map on line 2 and compares the real classified error and absence of a config. The wrong-implementation control with a guard only on top-level values leaves that nested value exposed.
- Addressed — requested scope: production and implementation-test edits are limited to the two YAML files named above; the acceptance bridge exists only in the acceptance binary. The adjacent closed-empty scenario checks preservation, not a new YAML form. No syntax expansion or valid parsing change is included.

## Tests
- Bare sequence opener returns a source-line problem without panicking: extend `TestYAMLProblems` and exercise `parseYAML` directly in acceptance (regression)
- Malformed mapping and nonempty unclosed sequence report the unclosed-collection diagnostics: add the bare-map case to `TestYAMLProblems`, retain the existing nonempty collection cases, and compare exact diagnostics in the two direct-parser scenarios (regression)
- Public configuration parsing returns the classified error rather than panicking: add a focused `ParseConfig` regression in `project/yaml_test.go` and exercise the nested flow value through `ParseConfig` in acceptance (regression)
- Closed empty sequences remain valid configuration: compare the successful `ParseConfig` result for the adjacent closed form (scenario)

## Feasibility
- Go 1.27.2 and the configured Node/Cucumber runner are available. The bridge is compiled by `go build -overlay` into a temporary binary; the overlay only adds the acceptance adapter, and the helper is excluded from ordinary Go builds. The exact YAML is sent over stdin. The runner requires normal completion and compares the JSON result structurally; it never recovers a parser panic. The build and invocation have separate 95 s and 5 s bounds within the 110 s assertion step.
- Focused `TestYAMLProblems` and `TestYAMLScalars` passed on HEAD. The focused direct and public probes returned normal sequence errors there. The bare-map probe reached the parser and returned the pair-syntax error instead of the requested unclosed-map diagnostic. The known-panic proof uses the unchecked-index overlay, not the baseline run.
- evidence: {"id":"flow-observer","kind":"observer","inputs":["project/yaml.go","project/config.go"],"observers":["features/steps/yaml-empty-flow-sequence-error__parse.js","features/steps/yaml-empty-flow-sequence-error__driver/bridge.go.txt","features/steps/yaml-empty-flow-sequence-error__driver/main.go"],"checks":[{"name":"good","command":"node features/steps/yaml-empty-flow-sequence-error__parse.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"node features/steps/yaml-empty-flow-sequence-error__parse.js bad","exit":1,"output":"observer rejected\n"}]}
