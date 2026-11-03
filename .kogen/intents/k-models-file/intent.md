# Add opt-in model lineup files

Slug: k-models-file
Model: not applicable — deterministic file resolution and hashing, with no new workflow state machine
Acceptance:
- .kogen/intents/k-models-file/acceptance.feature
- features/steps/models_file.js
- features/steps/models_file_driver.go.txt

Expand the coordinator API without switching any existing consumer. Add a separately callable team/local lineup loader and template. Existing configuration parsing, loading, rendering and setup-facing APIs retain their behavior, including project.yaml models and defaults. Do not edit this repository's .kogen/project.yaml or migrate its lineup. Do not add this repository's team lineup in this landing: delivery moves the identical lineup in a separately reviewed follow-up commit.

## Decisions
- Expansion only: existing consumers continue to use project.yaml even when a conflicting team/local lineup exists. Adoption is explicit through the new API. (source: answer 1)
- Team lineup path is .kogen/models.yaml; optional machine override is .kogen/local/models.yaml. Each named local role replaces the whole team role, never individual fields. (source: request)
- No command, flag, environment variable, limit, timeout or retry changes; fixture projects only, no live providers or executors. Preserve macOS Apple Silicon and Linux x86-64 glibc support. (source: request)
- The effective local lineup is not approved Intent content. Team file bytes are protected approval content; changes only to the local override leave approval valid. A Build must not edit either lineup file. (source: request)

Expose project.ModelsPath = ".kogen/models.yaml", project.LocalModelsPath = ".kogen/local/models.yaml", ModelsTemplate() string, and LoadModels(root string) (*ModelLineup, error). ModelLineup has Roles map[string]Role and Sources map[string]string. Sources records the repository-relative file per role. The new YAML format is a root mapping with only `models:` containing the existing shape/build/review role mappings; no version or commands. ModelsTemplate writes this wrapper and DefaultModels in ModelRoles order. LoadModels requires the team file; absent team is an error naming it, not a fallback to project.yaml. Omitted team roles use DefaultModels and name ModelsPath as their source. Missing local file is normal; a present invalid local file fails rather than silently falling back. Reuse existing role semantics and validation, including provider/base_url, native/claude-code and max_rounds. Invalid new file errors use environment/project_config_invalid, detail naming the offending file, exit 3, and line diagnostics like ParseConfig. Unreadable or missing required files must produce an error naming that file. Neither loader writes files.

Baseline must automatically include ModelsPath once, immediately after ConfigPath, even when absent (the existing Hash missing marker applies). LocalModelsPath is never automatically included. Preserve all other baseline ordering and explicit protect behavior. This makes adding or changing the team file invalidate approval while changing only the ignored local override does not. Existing protection consumers receive the team path via Baseline; do not implement Build policy in another repository.

Update coordinator README/API documentation and contract/ to describe this additive interface and pin the new behavior while preserving all legacy setup-facing contract assertions. Keep Template, RenderConfig, Config.Models, DefaultModels, ReadableConfig, ParseConfig and LoadConfig working unchanged. Do not remove or rename APIs used by kogen-setup. Contract suite failures from the earlier replacement candidate are regression evidence, not permission to switch the existing contract. If golden baseline hashes change, regenerate with `go test ./... -update`, review the diff, and run without -update; never hand-edit hashes.

## Source comparison
- Addressed: original K-MODELS-FILE team/local paths, per-role replacement, validation, provenance data and protection/approval requirements are implemented by the new opt-in API and baseline rules above, exercised by acceptance and focused implementation tests.
- Superseded: original immediate refusal of project.yaml models, removal of Config.Models/rendered Models, and switching existing loading/init behavior conflict with the 3 Nov 19:5xZ expansion ruling and answer 1. This landing deliberately preserves those old paths, including when both files disagree. The reported TestConfigPathAndLoad, TestExecutorRoleLineup, TestReadableConfigAndModelRoles and TestTemplateAndRenderConfig failures must not recur; TestBaselineOrderAndProtectGlobs changes only to include the new protected team path.
- Omitted as explicit follow-ups under the repository split and answer 1: actual init writing the new template in kogen-setup; consumer adoption; runtime refusal/removal of the old path; Build evidence and commit summary naming the effective lineup in kogen-build; and root spec/configuration documentation owned elsewhere. This coordinator landing supplies role values and source paths for those consumers, but does not claim their runtime adoption.
- Addressed: separate reviewed delivery migration retains this repository's existing shape chatgpt/gpt-6.1-sol/low, build chatgpt/gpt-6.1-terra/high, review chatgpt/gpt-6.1-terra/medium; Build leaves its protected old configuration untouched and its own checks continue working before that migration. No runtime automatic migration or dual-source loading is added to LoadConfig.
- Addressed: approved design dated 30 Oct and 2 Nov split are bounded by latest expansion ruling and answer 1; earlier candidate 763c1ecc and landing failures are reference only. No other component repository changes are part of this item.

## Tests
- New team template and role resolution with per-role source paths: callable fixture API acceptance and focused new contract tests (integration)
- Whole-role local replacement and untouched team roles: fixture acceptance with native/provider and external executor roles (integration)
- Existing setup-facing parsing/loading/template/rendering behavior including conflicting files: fixture acceptance plus preserved contract/config_test.go tests (regression)
- Existing role validation on new files and invalid local not silently ignored: focused validation parity tests and fixture rejection acceptance (integration)
- Team protected once after project config, local excluded, local-only edits preserve approval hash and team edits change it: fixture baseline/hash acceptance and updated baseline contract tests (integration)
- No runtime writes or migration: loader fixture byte comparison acceptance (integration)
- Missing required team, missing optional local, omitted team roles and template defaults: fixture acceptance and focused contract tests (integration)

## Feasibility
- none
