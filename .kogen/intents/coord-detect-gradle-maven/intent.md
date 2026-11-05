# Detect Gradle and Maven checks

Slug: coord-detect-gradle-maven
Model: not applicable — deterministic transformation of the files map and tracked list, with no lifecycle state
Acceptance:
- .kogen/intents/coord-detect-gradle-maven/acceptance.feature
- features/steps/coord-detect-gradle-maven__detect.js

Extend `project.Detect(files map[string]string, tracked []string) Detected` in `project/detect.go` with a Gradle detector and a Maven detector, with focused unit tests in `project/detect_test.go`. Today a repository whose build is Gradle or Maven gets nothing from Detect (for a Gradle- or Maven-only repository `Setup`, `Fix`, `Checks` and `Protect` are all nil); after this change it gets one check per build system and its tracked wrapper files protected. Both detectors run after the existing Mix, npm, Go, Bundler and Cargo detectors, in the order Gradle then Maven, and only append, so every existing detector's values and order stay byte-identical. The function signature, the `Detected` and `Check` types, `AcceptanceCommand` and the Elixir golden files (`project/testdata/*.json`) do not change.

Gradle rules:
- Gradle is recognised when `tracked` contains at least one of the root paths `build.gradle`, `build.gradle.kts`, `settings.gradle` or `settings.gradle.kts` (exact path match, so `sub/build.gradle` does not count). Otherwise the Gradle detector adds nothing, including no protect entries.
- Check: exactly one, named `gradle-check`. Its command is `./gradlew check --console=plain` when `tracked` contains the root path `gradlew`, else `gradle check --console=plain`.
- No setup command and no fix command.
- Protect: append each of `gradlew`, `gradle/wrapper/gradle-wrapper.properties` and `gradle.properties` that `tracked` contains, in that order.

Maven rules:
- Maven is recognised when `tracked` contains the root path `pom.xml` (so `sub/pom.xml` does not count). Otherwise the Maven detector adds nothing, including no protect entries.
- Check: exactly one, named `maven-verify`. Its command is `./mvnw -B -ntp verify` when `tracked` contains the root path `mvnw`, else `mvn -B -ntp verify`.
- No setup command and no fix command.
- Protect: append each of `mvnw` and `.mvn/wrapper/maven-wrapper.properties` that `tracked` contains, in that order.

Common rules:
- Recognition, wrapper choice and protection are decided by `tracked` alone. A manifest or wrapper that is only a key of `files` (present on disk but untracked) counts for nothing; a tracked manifest is recognised whether or not `files` has its text. Detect does not read or parse `build.gradle*`, `settings.gradle*` or `pom.xml`, and it runs no Gradle or Maven command.
- A repository with both build systems gets `gradle-check` followed by `maven-verify`, and Gradle's protect entries before Maven's. The names `gradle-check` and `maven-verify` never collide with the Mix, npm, Go, Bundler or Cargo check names, so no renaming logic is needed.
- Runner is unchanged. When no detector adds anything to a field, it stays nil (JSON `null`), as it does today.

Boundary: this repository owns `Detect`. How `kogen init` gathers the files map and the tracked list is decided by its consumer, outside this checkout, and is not changed here; because these detectors only need `tracked`, they work with any files map.

## Decisions
- Recognise Gradle from a tracked root `build.gradle`, `build.gradle.kts`, `settings.gradle` or `settings.gradle.kts`; its one check is `gradle-check` = `./gradlew check --console=plain` with a tracked root `gradlew`, else `gradle check --console=plain`; no setup (the wrapper fetches its own distribution) and no fix. (source: request)
- Recognise Maven from a tracked root `pom.xml`; its one check is `maven-verify` = `./mvnw -B -ntp verify` with a tracked root `mvnw`, else `mvn -B -ntp verify`; no setup and no fix. (source: request)
- Protect tracked `gradlew`, `gradle/wrapper/gradle-wrapper.properties`, `gradle.properties`, `mvnw` and `.mvn/wrapper/maven-wrapper.properties`, each only when its build system is recognised, in that order. (source: request)
- Both build systems in one repository give both checks with distinct names; detection is deterministic and never changes the other detectors' output. (source: request)

## Source comparison
- Addressed: the Problem (no detected checks for a Gradle or Maven repository) is replaced by the rules above; the positive acceptance scenarios fail on the current tree, where Detect returns all-null fields for these inputs (observed through `features/steps/bundler_detect_probe`).
- Addressed: every synthetic acceptance item is an executable scenario: tracked `build.gradle` and `gradlew` (one `gradle-check` with the wrapper command, protect `gradlew`); tracked `settings.gradle.kts` only (`gradle check --console=plain`, with the other three manifests as further outline rows); tracked `pom.xml`, `mvnw` and `.mvn/wrapper/maven-wrapper.properties` (`maven-verify` with `./mvnw`, both protected); `pom.xml` in files but untracked (nothing); nested `sub/pom.xml` only (nothing); `go.mod` plus `pom.xml` (Go check names then `maven-verify`, no duplicates); and byte-identical Mix, npm, Go and Bundler outputs, plus the existing Cargo detector. The expected bytes for the existing detectors were recorded from the unchanged tree through `features/steps/bundler_detect_probe`.
- Addressed: non-secret literals are preserved verbatim: `build.gradle`, `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`, `gradlew`, `gradle/wrapper/gradle-wrapper.properties`, `gradle.properties`, `pom.xml`, `mvnw`, `.mvn/wrapper/maven-wrapper.properties`, `sub/pom.xml`, the check names `gradle-check` and `maven-verify`, and the commands `./gradlew check --console=plain`, `gradle check --console=plain`, `./mvnw -B -ntp verify`, `mvn -B -ntp verify`.
- Decided (technical): "is tracked" is read literally, so recognition uses `tracked` alone and does not also require a `files` entry (unlike Go, Bundler and Cargo, which need the manifest text). This keeps the detectors working regardless of which root files the consumer reads into `files`, and the untracked-on-disk counterexample still detects nothing. Protect order follows the request's listing, with `gradle.properties` after the Gradle wrapper files; protect entries belong to their build system, so wrapper files without a recognised manifest are not protected.
- Decided (technical): the detectors are appended after Cargo, Gradle before Maven, so they never alter earlier detectors' output.
- Omitted deliberately: nested or multi-module discovery, parsing build files, Gradle or Maven setup/fix commands, protecting `pom.xml` or `build.gradle*`, and running Gradle or Maven during detection. The request asks for none of these.

## Tests
- A tracked root Gradle manifest yields one `gradle-check` check, using `./gradlew check --console=plain` with a tracked root `gradlew` and `gradle check --console=plain` otherwise (each of the four manifests, untracked or nested wrapper), with no setup or fix: add TestDetectGradle table cases and exact-output acceptance scenarios (unit)
- A tracked root `pom.xml` yields one `maven-verify` check, using `./mvnw -B -ntp verify` with a tracked root `mvnw` and `mvn -B -ntp verify` otherwise, with no setup or fix: add TestDetectMaven table cases and exact-output acceptance scenarios (unit)
- Tracked `gradlew`, `gradle/wrapper/gradle-wrapper.properties`, `gradle.properties`, `mvnw` and `.mvn/wrapper/maven-wrapper.properties` are protected in that order only for a recognised build system: TestDetectGradle and TestDetectMaven cases and acceptance scenarios (unit)
- An untracked root manifest, a nested `sub/pom.xml` or `sub/build.gradle`, or wrapper files without a manifest detect nothing, and a tracked manifest without `files` text is still recognised: TestDetectGradle and TestDetectMaven cases and an acceptance outline (unit)
- Gradle and Maven together, and Go plus Maven, give all checks in detector order with distinct names: TestDetectGradle/TestDetectMaven mixed cases and acceptance scenarios (unit)
- Existing Mix, npm, Go, Bundler and Cargo outputs stay byte-identical: acceptance scenarios with recorded current JSON, plus the existing Detect, contract and Elixir golden tests unchanged (existing)

## Feasibility
- none
