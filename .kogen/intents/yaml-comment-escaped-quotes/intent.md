# Preserve hashes after escaped YAML quotes

Slug: yaml-comment-escaped-quotes
Model: not applicable — this is a stateless scalar parsing correction, with no meaningful domain state
Acceptance:
- .kogen/intents/yaml-comment-escaped-quotes/acceptance.feature
- features/steps/yaml-comment-escaped-quotes__parse.js
- features/steps/yaml-comment-escaped-quotes__driver/main.go

Correct comment stripping in project/yaml.go and add focused regression coverage in project/yaml_test.go. Preserve hashes inside escaped double-quoted scalars while still removing comments after the closing quote. Replace the erroneous treatment of escaped double quotes as quote terminators; do not expand supported YAML syntax or change scalar escape rules. Preserve existing single-quoted hash handling and plain scalar comment handling.

## Decisions
- Preserve hashes inside escaped double-quoted scalars while still removing comments after the closing quote. (source: request)
- Keep implementation and implementation-test changes scoped to project/yaml.go and project/yaml_test.go; do not expand supported YAML syntax or change scalar escape rules. (source: request)
- Existing single-quoted hash handling and plain scalar comment handling continue to pass. (source: request)
- Observe parsed command scalar values through project.ParseConfig(text, file) and Config.Setup; retain the focused TestYAMLScalars and TestStripComment coverage and add regression cases to project/yaml_test.go. (evidence: project/config.go; project/yaml_test.go) (source: request)
- Keep comment recognition at the start of a line or after a space or tab outside quotes; make double-quote tracking consistent with the existing quotedScalar escape consumption, including escaped backslashes before a closing quote. (evidence: project/yaml.go) (source: request)

## Source comparison
- Addressed: request evidence ev-c02a011c identifies stripComment toggling on escaped double quotes despite quotedScalar accepting them; the outcome, Decisions and escaped-quote scenario correct that mismatch through the real configuration parser.
- Addressed: acceptance 1 requires retaining the hash and all following scalar text, not truncation at an escaped quote; the escaped-quote scenario compares the complete decoded scalar.
- Addressed: acceptance 2 requires removal of the comment after the actual closing quote, not disabling comment stripping for quoted values; the closing-quote scenarios compare complete parsed values with trailing comments excluded, including the existing escaped-backslash rule.
- Addressed: acceptance 3 preserves existing single-quoted hashes and plain scalar comments; separate scenarios preserve both outcomes, and implementation tests retain existing coverage.
- Addressed: requested implementation scope is project/yaml.go and project/yaml_test.go; the Acceptance artifacts are verification-only. Syntax expansion and scalar escape-rule changes are explicitly out of scope. No requested behavior is omitted, conflicting or superseded.

## Tests
- Escaped double quotes do not terminate comment protection: add a focused parseYAML regression in project/yaml_test.go and compare the complete parsed scalar through ParseConfig in acceptance (regression)
- Actual closing quotes still allow trailing comments to be removed: add focused cases in project/yaml_test.go and compare parsed scalar values in acceptance, including an escaped backslash before the closing quote (unit)
- Existing single-quoted hash handling is preserved: retain TestYAMLScalars and TestStripComment and exercise a single-quoted hash with a trailing comment through ParseConfig (existing)
- Existing plain scalar comment handling is preserved: retain TestYAMLScalars and TestStripComment and compare plain scalars with a separated comment and an embedded hash through ParseConfig (existing)

## Feasibility
- The local Go toolchain and focused existing YAML tests passed: go version reported go1.27.2 and go test ./project -run '^(TestYAMLScalars|TestStripComment)$' -count=1 exited 0. The helper only forwards stdin to ParseConfig and JSON-encodes its result; acceptance uses a direct semantic equality assertion.
