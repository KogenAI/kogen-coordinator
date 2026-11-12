# Name the cause when project config cannot be read

Slug: coord-load-config-read-error-named
Model: not applicable — loading is a stateless file read with a classified error
Acceptance:
- .kogen/intents/coord-load-config-read-error-named/acceptance.feature
- features/steps/coord-load-config-read-error-named__load.js

`project.LoadConfig(root)` reports an absent `.kogen/project.yaml` as before (`environment/not_initialized`, exit code 3, same message). Any other failure to read the file (permission denied, a directory, a dangling symbolic link, an I/O error) is `environment/project_config_unreadable`, exit code 3, with detail `read <root>/.kogen/project.yaml: <operating-system error>` and no mention of `kogen init`. Parsing and validation errors are unchanged.

## Decisions
- The new stable code is `project_config_unreadable`, class `environment`, exit code 3. (decision: D1, round 1) (assumption: the name project_config_unreadable is acceptable) (source: request)
- Absent means `os.Lstat` of the file reports not-exist; a dangling symlink therefore is unreadable, because Lstat finds the link while ReadFile fails with no such file or directory. (decision: D2, round 1) (evidence: project/config.go) (source: request)
- The detail has the form `read <path>: <error>`, naming the file and the operating-system cause. (decision: D3, round 1) (source: request)

## Source comparison
- Absent file: unchanged code, message and exit code 3 (addressed).
- Directory, mode 000, dangling symlink: new code naming file and OS cause (addressed).
- Valid configuration loads unchanged (addressed).

## Tests
- Absent file keeps not_initialized: scenario in acceptance.feature (scenario)
- Directory, mode 000 and dangling symlink give the named unreadable error: scenarios in acceptance.feature (scenario)
- Valid configuration still loads: scenario in acceptance.feature (scenario)

## Feasibility
- none
