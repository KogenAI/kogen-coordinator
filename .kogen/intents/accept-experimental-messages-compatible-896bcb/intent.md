# Accept experimental messages-compatible role

Slug: accept-experimental-messages-compatible-896bcb
Model: not applicable — role validation is a pure function of one role mapping with no state between calls
Acceptance:
- .kogen/intents/accept-experimental-messages-compatible-896bcb/acceptance.feature
- features/steps/accept-experimental-messages-compatible-896bcb__config.js

A model role in the models files may select provider `messages-compatible`, the experimental opt-in Messages adapter. For each supported role (shape, build, review) the role is accepted when it has a nonblank model, a nonblank effort and a valid http(s) `base_url`, and the parsed role (`project.Role`, as returned by `project.LoadConfig` and `project.LoadModels`) carries the provider `messages-compatible` and the normalized base URL (trailing slashes trimmed), so downstream consumers receive both. A messages-compatible role with a missing, blank, malformed or non-http(s) `base_url`, or with a missing or blank model or effort, is refused with the existing `environment/project_config_invalid` (exit 3) error and a `line N: models.<role>...` line that names the role and the offending key.

Provider and `base_url` validation for every other provider is unchanged, including openai-compatible: it still requires a valid `base_url`, and every provider other than openai-compatible and messages-compatible still refuses `base_url`. The unknown-provider message and the base_url-on-other-provider message now also name messages-compatible, so the existing tests and golden expectation that pin those two messages are updated for the new wording.

Boundaries: validation and role-config propagation only. This adds no credential storage, no transport, no default lineup entry, no init option, no automatic provider use, no role qualification and no change to the Loop adapter, to the protected core pin or to the credential-states request.

## Decisions
- Provider `messages-compatible` is added to `project.Providers` and takes `base_url` with exactly the rules openai-compatible has: required, an absolute http(s) URL with a host and no query, fragment, userinfo or whitespace; the role's `BaseURL` is the URL with trailing slashes trimmed (evidence: project/config.go; project/config_test.go) (source: request)
- `Role.BaseURL` already carries the normalized URL to consumers and the provenance encoder already writes provider and base_url when it is set, so no new field is added (evidence: project/provenance.go; project/config.go) (assumption: consumers outside this repository read Role.BaseURL as they do for openai-compatible) (source: request)
- The unknown-provider line ends `or messages-compatible`, the base_url-on-another-provider line says `only for provider openai-compatible or messages-compatible`, and the missing base_url line is `<path>: <provider> needs base_url, for example http://localhost:11434/v1` (identical to today's text for openai-compatible); acceptance asserts the role path, the key and the provider names, not the full wording (evidence: project/config.go; project/config_test.go; project/golden_test.go) (assumption: the exact wording of these actionable messages is chosen here) (source: request)
- Effort for messages-compatible follows the generic rule (any nonblank effort except ultra) as for openai-compatible; no per-route effort list is added (evidence: project/config.go) (source: request)
- Only validation and role-config propagation change: no credential storage, transport, default lineup, init option, automatic use or qualification (source: request)
- Provider messages-compatible joins project.Providers and takes base_url exactly as openai-compatible does: base_url is required, must be an absolute http(s) URL with a host and no query, fragment, userinfo or whitespace, and the stored role BaseURL is the URL with trailing slashes trimmed (decision: D1, round 1) (constraint: no other provider accepts base_url) (constraint: openai-compatible behavior and its messages stay unchanged) (evidence: project/config.go; project/config_test.go) (assumption: none beyond the existing validBaseURL rule being reused as is) (source: request)
- Role propagation needs no new field: Role.BaseURL already carries the normalized URL to every consumer and the provenance encoder already writes provider and base_url when set (decision: D2, round 1) (evidence: project/provenance.go; project/config.go) (assumption: downstream consumers outside this repository are not inspected) (source: request)
- Validation messages that list providers name messages-compatible: the unknown-provider line ends 'or messages-compatible' and the base_url-on-other-provider line says 'only for provider openai-compatible or messages-compatible'; the missing base_url line reads '<path>: <provider> needs base_url, for example http://localhost:11434/v1', identical to today's text for openai-compatible (decision: D3, round 1) (evidence: project/config.go; project/config_test.go; project/golden_test.go) (assumption: Exact wording is chosen here; acceptance asserts only the role path, the key and the provider names) (source: request)
- Effort for messages-compatible follows the generic rule (any nonblank effort except ultra), as for openai-compatible; no route effort list is added (decision: D4, round 1) (evidence: project/config.go) (assumption: none) (source: request)
- Scope is validation and role-config propagation only: no credential storage, transport, default lineup, init option or automatic use (decision: D5, round 1) (assumption: none) (source: request)

## Source comparison
- Need 1 (accept provider messages-compatible with nonblank model and effort and a valid http(s) base_url for each role, return provider and normalized base URL): addressed by scenarios "Each supported role accepts messages-compatible and returns provider and base URL", "The base URL is normalized and every role of a mixed lineup keeps its own provider" and "LoadModels returns the same provider and normalized base URL".
- Need 2 (reject missing, blank, malformed or non-http(s) base_url, and missing model or effort, with actionable errors): addressed by "A messages-compatible role without base_url is refused", "A blank, malformed or non-http(s) base_url is refused for messages-compatible" and "A messages-compatible role without a nonblank model or effort is refused".
- Need 3 (retain existing provider and base_url validation including openai-compatible): addressed by the openai-compatible, unknown-provider, base_url-on-other-providers and existing-providers scenarios and by the existing Go tests, updated for the two changed messages.
- Need 3 (run the Coordinator project tests and report the exact landed commit and results): this is the Build's verification and the landing report, not an acceptance scenario; the configured checks run `go test ./...`.
- Boundaries (no credential storage, transport, default lineup, init option, automatic use, role qualification, core pin edits or credential-states change; Loop adapter stays the transport owner): omitted from the implementation by design; the Factory adoption and the held core item ad89b0f7 r2 are outside this repository.

## Tests
- A messages-compatible role of each supported role is accepted and returns provider and normalized base URL: scenario outline and LoadModels scenario in acceptance.feature (scenario)
- Invalid base_url, model or effort for messages-compatible is refused with the role path and key named: acceptance.feature outlines, plus new cases in project/config_test.go beside the openai-compatible provider cases (unit)
- Existing providers and base_url rules are retained: openai-compatible, other-provider and unknown-provider scenarios in acceptance.feature, and the updated provider-message expectations in project/config_test.go and project/golden_test.go (regression)
- The whole Coordinator suite still passes with the updated pinned messages: the configured go-test check (existing)

## Feasibility
- none
