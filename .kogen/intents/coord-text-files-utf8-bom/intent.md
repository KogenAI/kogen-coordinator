# Ignore a leading UTF-8 BOM when parsing files

Slug: coord-text-files-utf8-bom
Model: not applicable — stateless text parsing; each read is a pure function of one file's text
Acceptance:
- .kogen/intents/coord-text-files-utf8-bom/acceptance.feature
- features/steps/coord-text-files-utf8-bom__read.js

Some editors save text files with a UTF-8 byte order mark (BOM, U+FEFF, bytes EF BB BF). Today Kogen's readers compare line starts against literal prefixes, and Go's whitespace trimming does not remove U+FEFF. So a feature file with a BOM is refused with `line 1: expected Feature:, got: ﻿Feature: x`, where both texts look identical. An `intent.md` with a BOM before `# Title` gets an empty Title, and lint reports `title: intent.md must start with a # title`. A `.kogen/project.yaml` with a BOM before its first key fails with `environment/project_config_invalid` and `line 1: expected key: value`. These failures were observed on the unchanged tree.

After this change, each of these readers removes exactly one leading U+FEFF before parsing, and then parses as today:
- `project.ParseGherkin(text)`. It reads `acceptance.feature` and every other `.feature` text that Kogen parses; `CheckIntent` uses it.
- The Intent reader behind `project.ReadIntent`, `project.LoadIntent` and `project.CheckIntent` (`parseIntent` on the `intent.md` text).
- The shared YAML reader `parseYAML`. It serves `project.ParseConfig`, `project.LoadConfig` and `project.ReadableConfig` for `.kogen/project.yaml`. Because `project.LoadModels` uses the same reader, the models files are read the same way.

The parsed result is identical to reading the same text without the BOM: scenarios, steps, tags, lines, Title, Slug line, Model line, Acceptance, Decisions, Tests, Feasibility and the Config. Reported line numbers do not change, because the BOM is removed from within line 1 and no line is added or dropped. When the file has a leading BOM and a later problem, the refusal message is the BOM-free message and does not contain U+FEFF.

Only a BOM at the very start of the text is removed, and only once. A second BOM directly after it stays ordinary text: `{BOM}{BOM}Feature: x` is refused with `line 1: expected Feature:, got: ﻿Feature: x`. A U+FEFF anywhere else, such as in the middle of a line, is read exactly as today.

The removal applies only to the parsed view:
- `Intent.Text` keeps the file text as written, including a leading BOM.
- The `Fetch`/`fetch` bytes, `project.Hash`, `HashWithUnreadable`, `Baseline`, approval hashes, execution pins and digests keep covering the file bytes as written. Adding or removing a BOM still changes them.
- No file is rewritten.

Nothing else changes. Golden files under `project/testdata` contain no BOM input, so their recorded results stay unchanged.

## Decisions
- Ignore exactly one leading U+FEFF for parsing in the Gherkin, Intent and project configuration readers, so the result equals the BOM-free reading with unchanged line numbers (source: request)
- Keep a non-leading or second consecutive BOM as ordinary text, read as today (source: request)
- Keep hashes, baselines and pins over the bytes as written, so adding or removing a BOM is still a change; Intent.Text likewise keeps the text as written (source: request)
- Refusal messages for a later problem in a BOM-prefixed file equal the BOM-free messages and do not mention the BOM (source: request)

## Source comparison
- Addressed: the synthetic acceptance example "A feature text of `{BOM}Feature: x` with one scenario parses to the same scenarios as the text without the BOM" is in the acceptance scenario "A feature with a leading BOM parses to the same scenarios as without it".
- Addressed: the synthetic example "intent.md with a BOM before `# Title` reads Title as `Title`; Slug, Model, Acceptance and section bullets equal the BOM-free reading" is in the scenario "An intent.md with a leading BOM reads its title and fields as without it and passes the Intent check". That scenario also gives `CheckIntent` a BOM-prefixed acceptance.feature, which proves the feature-file path end to end.
- Addressed: the synthetic example "project.yaml with a BOM before its first key loads with the same configuration and no problem on line 1" is in the scenario "A project.yaml with a leading BOM loads the same configuration with no problem on line 1". It runs through `LoadConfig` on a real file.
- Addressed: the synthetic example "feature file with a BOM and an unclosed doc string reports the same line number" is in the scenario "An unclosed doc string after a leading BOM reports the same line" (line 4).
- Addressed: the synthetic example "a file with U+FEFF in the middle of a line is read exactly as today" is in the three middle-of-line scenarios (feature, Intent title, project.yaml). The "only a leading BOM, once" rule is in "Only one leading BOM is removed from a feature".
- Addressed: the synthetic example "byte hash of the same file with and without the BOM differs" is in "The byte hash still covers a leading BOM", through `project.Hash`.
- Addressed: the Need "refusal messages of any later problem do not mention it" is in three scenarios: the feature (`line 1: expected Feature:, got: Scenario: one`), the Intent (`slug: the Slug: line must be demo`) and the project.yaml (`line 4: unknown key surprise`).
- Addressed: "step files that are feature files" are handled because every `.feature` text Kogen parses goes through `ParseGherkin`. Kogen does not parse the JavaScript step definitions.
- Omitted: nothing from the request is omitted. No conflicting or superseded behavior was found.

## Tests
- ParseGherkin ignores one leading BOM, giving the same scenarios and the same error lines (including an unclosed doc string on line 4 and a non-Feature first line whose message has no U+FEFF): add cases to project/gherkin_test.go and run the feature scenarios (unit)
- Only one leading BOM is removed, and a U+FEFF in the middle of a line is read as today: add ParseGherkin, ReadIntent and ParseConfig cases for a double leading BOM and a middle-of-line BOM (unit)
- ReadIntent and CheckIntent read a BOM-prefixed intent.md and acceptance.feature like the BOM-free text, while Intent.Text keeps the text as written and later lint lines do not mention the BOM: add cases to project/intent_test.go and run the Intent scenarios (unit)
- ParseConfig and LoadConfig read a BOM-prefixed project.yaml as the same Config with no line 1 problem, and keep later problem lines unchanged: add cases to project/config_test.go and run the project.yaml scenarios (unit)
- Hashes cover the bytes as written, so a BOM still changes project.Hash: covered by the existing byte-hash tests and the hash acceptance scenario (existing)

## Feasibility
- Observed on the unchanged tree in a scratch run of these scenarios. The 8 leading-BOM scenarios fail only because the BOM is read as text, for example `line 1: expected Feature:, got: ﻿Feature: x`, a missing title, and `line 1: expected key: value`. The 4 middle-of-line and hash scenarios pass. A control run with every {BOM} removed met each BOM-free expectation. No external technical facts are material.
- evidence: {"id":"subset-compare","kind":"observer","inputs":["features/steps/coord-text-files-utf8-bom__read.js"],"observers":["features/steps/coord-text-files-utf8-bom__read.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-text-files-utf8-bom__read.js '{\"title\":\"Title\",\"error\":\"\",\"lines\":[]}' '{\"title\":\"Title\",\"lines\":[]}'","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-text-files-utf8-bom__read.js '{\"title\":\"\",\"error\":\"intent/lint\",\"lines\":[\"title: intent.md must start with a # title\"]}' '{\"title\":\"Title\",\"lines\":[]}'","exit":1,"output":"mismatch\n"}]}
