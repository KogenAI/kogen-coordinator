# Validate acceptance paths inside the root

Slug: coord-acceptance-path-inside-root
Model: not applicable — stateless path validation over disk and overlay inputs
Acceptance:
- .kogen/intents/coord-acceptance-path-inside-root/acceptance.feature
- features/steps/acceptance_paths.js
- features/steps/acceptance_paths_driver.go.txt

Validate every Acceptance entry before existence and Git-ignore checks in project.CheckIntent. Replace raw joined-path existence as the sole eligibility check. Reject empty paths, absolute paths, empty segments (including repeated slashes), dot and dot-dot segments, and any .git component. Do not normalize an invalid spelling into a valid path. Use Lstat on the final component and resolve parents and symlink destinations to establish containment within the repository root. Final symlinks to regular files inside the root remain allowed; external final links and escaping parents are rejected. Resolve containment against the canonical root, not a string prefix. Clean overlay-only paths still count, including missing parent directories; an overlay must not bypass lexical or existing-parent containment checks. Preserve existing missing/nonregular and ignored-file behavior for otherwise eligible entries.

Emit exactly one line per invalid entry, naming the entry and its rule; continue collecting other lint problems. Lexical violations use `acceptance: <entry> must be a clean relative path`, .git components use `acceptance: <entry> must not contain .git`, and containment violations use `acceptance: <entry> resolves outside the repository`. Do not additionally label these entries missing or send invalid paths to Git-ignore checking. Validate entries even when the required first-feature-list rule also fails. This change does not alter snapshot path policy (which may reject more symlinks) or add race-proof filesystem snapshotting.

## Decisions
- Allow internal symlinks and clean not-yet-written overlay entries while rejecting paths outside the root. (source: request)
- Collect entry-specific lint lines together with all other problems. (source: request)

## Source comparison
- Addressed: request Problem and Need replace project/intent.go's raw isRegular eligibility with clean relative spelling and resolved containment; outcome and diagnostics are specified above and executable in acceptance.feature.
- Addressed: synthetic ../x.js, /etc/hosts, features/steps/a//b.js and .git/config each receive one rule line rather than an existence line; acceptance.feature covers them together and with another lint error.
- Addressed: internal/external symlinks, normal .kogen/intents/<slug>/acceptance.feature plus features/steps/x.js, and clean overlay files are covered below. Dot/empty segments, nested .git and symlink parents are also executable cases.
- No requested behavior is omitted or superseded. Snapshot restrictions are evidence, not authority to prohibit the explicitly allowed internal link.

## Tests
- Reject unclean and .git entries without existence diagnostics: add focused CheckIntent path validation cases (regression)
- Resolve final symlinks and parents within root: add temporary filesystem CheckIntent cases for external and internal targets (integration)
- Accept normal disk and clean overlay paths while rejecting invalid overlays: add CheckIntent overlay cases (integration)
- Aggregate every entry violation and unrelated lint failures, including malformed first-list ordering: update Intent lint tests (unit)

## Feasibility
- evidence: {"id":"path-observer","kind":"observer","inputs":["features/steps/acceptance_paths.js"],"observers":["features/steps/acceptance_paths.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/acceptance_paths.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/acceptance_paths.js bad","exit":1,"output":"rejected\n"}]}
