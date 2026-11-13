# Detect PHP Composer projects from root files

Slug: coord-detect-composer
Model: not applicable — deterministic transformation of the files map and tracked list, with no lifecycle state
Acceptance:
- .kogen/intents/coord-detect-composer/acceptance.feature
- features/steps/coord-detect-composer__detect.js

Extend `project.Detect(files map[string]string, tracked []string) Detected` in `project/detect.go` with a Composer detector, with focused unit tests in `project/detect_test.go`. Today a repository whose root has a `composer.json` gets nothing; after this change it gets a Composer setup command, checks and protect entries justified by committed files. The detector runs after the Python detector and before Gradle and Maven, and only appends, so existing detectors' values and order stay as they are. The function signature, the `Detected` and `Check` types and `AcceptanceCommand` do not change.

Rules:
- A Composer project is recognised when `composer.json` is both a key of `files` and contained in `tracked`. A file present in `files` but not tracked counts as absent. Without it the detector adds nothing.
- Setup (exactly one entry): `composer install --no-interaction --prefer-dist` when `tracked` contains `composer.lock`, else `composer update --no-interaction --prefer-dist`.
- Check `composer-test` = `vendor/bin/phpunit` when the `composer.json` text contains the substring `phpunit/phpunit`.
- Check `composer-stan` = `vendor/bin/phpstan analyse`, appended after `composer-test`, when the `composer.json` text contains `phpstan/phpstan`.
- Protect: each of `phpunit.xml`, `phpunit.xml.dist`, `phpstan.neon`, `phpstan.neon.dist` that `tracked` contains, in that order, only when a Composer project was recognised.
- Fix and Runner are untouched. Fields nothing sets stay nil.

## Decisions
- Recognise Composer from a tracked root `composer.json` whose text is in the files map, the rule the Go, Cargo and Python detectors use. (evidence: project/detect.go) (source: request)
- The lock choice depends on `composer.lock` being tracked, not on its presence in files. (source: request)
- Tool mention is a case-sensitive substring match of `phpunit/phpunit` or `phpstan/phpstan` anywhere in the `composer.json` text, covering require and require-dev. (assumption: a substring match anywhere in the text is acceptable) (source: request)
- Append the Composer detector right after Python in `Detect`, so a Go plus Composer root keeps Go's setup and checks first and unchanged. (evidence: project/detect.go; project/detect_test.go) (source: request)

## Source comparison
- Addressed: every synthetic acceptance item is a scenario: phpunit with lock, without lock, neither tool, phpstan with tracked and untracked `phpstan.neon`, Go plus Composer; plus untracked `composer.json` and no `composer.json`.
- Addressed: literals `composer install --no-interaction --prefer-dist`, `composer update --no-interaction --prefer-dist`, `vendor/bin/phpunit`, `vendor/bin/phpstan analyse`, names `composer-test`, `composer-stan`, files `phpunit.xml`, `phpunit.xml.dist`, `phpstan.neon`, `phpstan.neon.dist`.
- Omitted: which root files `kogen init` reads into `files` (a consumer outside this checkout), and running Composer.

## Tests
- Setup form by tracked lock, and composer-test / composer-stan by tool mention: add TestDetectComposer table cases and acceptance scenarios (unit)
- Protect lists only tracked config files; untracked composer.json counts as absent: TestDetectComposer cases and acceptance scenarios (unit)
- No composer.json adds nothing; Go plus Composer keeps Go unchanged: acceptance scenarios (scenario)
- Existing detectors' outputs stay unchanged: existing Detect tests and golden tests (existing)

## Feasibility
- none
