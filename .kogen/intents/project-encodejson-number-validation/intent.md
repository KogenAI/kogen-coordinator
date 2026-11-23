# Validate json.Number values in EncodeJSON

Slug: project-encodejson-number-validation
Model: not applicable — EncodeJSON is a stateless pure function; the number check has no state to model
Acceptance:
- .kogen/intents/project-encodejson-number-validation/acceptance.feature
- features/steps/project-encodejson-number-validation__driver.js

`project.EncodeJSON` must stop writing a `json.Number` verbatim when its text is not a valid JSON number. A malformed `json.Number`, at top level or nested anywhere inside a supported map or slice, makes `EncodeJSON` return a non-nil error and no JSON bytes, instead of successful invalid JSON. Valid integer, decimal and exponent numbers are still written with exactly their original text. JSON formatting and the supported input types are out of scope and unchanged. The change is confined to `project/facts.go` and `project/facts_test.go`.

## Decisions
- A `json.Number` is valid when its text follows the JSON number grammar: optional `-`, an integer part of `0` or a nonzero digit followed by digits, an optional `.` fraction with at least one digit, and an optional `e` or `E` exponent with optional sign and at least one digit. Anything else (empty text, leading zeros, `+1`, `.5`, `1.`, `1e`, `NaN`, `Inf`, hex, spaces, commas, braces) is rejected with an error naming the number. (decision: D1, round 1) (evidence: project/facts.go) (assumption: the JSON grammar, not Go's ParseFloat syntax, defines validity, so `1e400` stays valid and `0x10`, `NaN` and `Inf` are rejected) (source: request)
- Validation happens in `writeJSON`'s `json.Number` case, so a malformed number is rejected wherever it appears: top level, a `map[string]any` value, a `[]any` element, and values reached through the structs/default path. (decision: D2, round 1) (evidence: project/facts.go) (source: request)
- A rejected number makes `EncodeJSON` return `nil, err`; no partial bytes are returned. (decision: D3, round 1) (evidence: project/facts.go) (source: request)
- Valid numbers are written byte for byte as given, with no normalization (for example `1.50` stays `1.50`, `1E+10` stays `1E+10`, `-0` stays `-0`). (decision: D4, round 1) (constraint: JSON formatting is out of scope) (evidence: project/facts.go; project/facts_test.go) (source: request)
- Scope is `project/facts.go` and `project/facts_test.go`; `TestEncodeJSONValues` gains valid integer, decimal and exponent numbers and malformed numbers at top level, in a map and in a slice, each rejected with an error. (decision: D5, round 1) (evidence: project/facts_test.go) (source: request)

## Source comparison
- Valid integer, decimal and exponent numbers preserved: addressed (D1, D4; scenarios for top level, map value and slice element).
- Malformed numbers rejected at top level and nested in a map or slice: addressed (D1, D2; scenarios "Malformed numbers at top level/as a map value/as a slice element ...").
- A rejected number returns an error and no result: addressed (D3; every malformed scenario observes `error` and not `error with result ...`).
- JSON formatting and supported input types: omitted by request, unchanged.

## Tests
- Malformed json.Number is rejected with an error, at top level and nested in a map or slice: extend TestEncodeJSONValues in project/facts_test.go with malformed numbers in each position (unit)
- Valid integer, decimal and exponent numbers keep their text: extend TestEncodeJSONValues in project/facts_test.go with decimal and exponent numbers beside the existing integer case (unit)
- A rejected number returns an error and no result: assert a nil result alongside the error in the same test (unit)
- All outcomes through the real EncodeJSON entry point: acceptance.feature driven by a generated Go driver (scenario)

## Feasibility
- none
