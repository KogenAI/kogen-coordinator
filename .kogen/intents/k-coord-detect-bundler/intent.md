# Detect Bundler setup and Rails tests

Slug: k-coord-detect-bundler
Model: not applicable — deterministic file-map transformation without lifecycle state
Acceptance:
- .kogen/intents/k-coord-detect-bundler/acceptance.feature
- features/steps/bundler_detect.js
- features/steps/bundler_detect_probe/main.go

Extend project.Detect(files map[string]string, tracked []string) Detected in project/detect.go, with focused tests in project/detect_test.go. Committed root Gemfile text plus tracked Gemfile and Gemfile.lock identify the supported Bundler project. Emit exactly one additional setup command, bundle install. A tracked bin/rails additionally emits a test check running bin/rails test. Without the lockfile emit neither Bundler setup nor its check. Without bin/rails emit setup only. Do not infer RSpec, rake, database preparation, mise trust, formatters, fixers, protection or runner settings. This replaces the empty detection result for the supplied Rails tree; existing callers need no change.

## Decisions
- Use bundle install for tracked Gemfile/Gemfile.lock and bin/rails test for the supported conventional tracked entry bin/rails. No database step: root files do not establish database requirements. (source: request)
- Support bin/rails only in this increment; other test frameworks require evidence not supplied here. Do not parse Ruby or execute project files during detection. (source: request)
- Append Bundler detection after existing Mix, npm and Go detection, preserving their output and order. Name the Rails check test unless already occupied, then bundler-test. Add no Fix, Protect or Runner values. (source: request)

## Source comparison
- Addressed: K-COORD-DETECT-BUNDLER Need and free L0 probe through the feature's exact Gemfile/Gemfile.lock/bin/rails reproduction and negative cases, exercising the exported Detect entry point. Setup is bundle install; test is bin/rails test. This settles the request's delegated command decision without claiming database readiness.
- Addressed: Independence and unchanged Mix/Go counterexamples through exact acceptance results, existing Detect tests and the unchanged project/testdata/parity.json golden. Do not change call sites, intent.go, baseline.go or durable/; no golden regeneration is needed or permitted for this item.
- Addressed: supplied historical evidence (13 contradictions in 200 cells, 10 missing-table failures, 3 mise-trust refusals and 3 pre-edit baseline failures) remains context, not proof of Detect's effect. Those project.yaml files came from the task kit, not Detect. No claims that this fixes those failures; no changes to task kits or protected configurations.
- Addressed: original empty setup/checks/fix/protect Rails reproduction is represented by the positive scenario that fails on the current implementation. No separate init integration is needed because this item changes the source transformation, not its already-consumed wiring.
- Omitted deliberately: guessing database setup or generic Ruby tests from a Gemfile alone. The complete contract is limited to committed file evidence and the one conventional entry point above.

## Tests
- Locked Bundler Rails detection replaces the empty result: add TestDetectBundler table coverage and positive acceptance through Detect (regression)
- Missing lockfile, missing/untracked Gemfile or untracked lockfile emits no Bundler commands: table cases and acceptance outline (unit)
- Locked Bundler without tracked bin/rails emits setup but no guessed test: table cases and acceptance outline (unit)
- Existing Mix, npm and Go results retain order and values; Bundler appends and avoids test-name collision: focused mixed-stack table cases and acceptance examples, plus existing Detect and parity golden tests unchanged (unit)
- Bundler adds no fixer, protection or runner: exact full-result acceptance comparisons (unit)

## Feasibility
- none

Technical references: documentation search discovered RubyGems' official bundle-install reference and Rails' official testing guide. Fetches returned retrieved, untrusted bodies at https://guides.rubygems.org/command-reference/bundle-install/ (Install the gems section explains Gemfile.lock use) and https://guides.rubyonrails.org/testing.html (bin/rails test examples). They support command spelling only, not project-specific database readiness. No Ruby installation or network install is needed for this deterministic detector change.
