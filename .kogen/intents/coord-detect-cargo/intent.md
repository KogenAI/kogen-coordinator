# Detect Cargo commands for Rust projects

Slug: coord-detect-cargo
Model: not applicable — deterministic transformation of the files map and tracked list, with no lifecycle state
Acceptance:
- .kogen/intents/coord-detect-cargo/acceptance.feature
- features/steps/coord-detect-cargo__detect.js

Extend `project.Detect(files map[string]string, tracked []string) Detected` in `project/detect.go` with a Rust (Cargo) detector, with focused unit tests in `project/detect_test.go`. Today a repository whose only manifest is `Cargo.toml` gets an empty result (`Setup`, `Fix`, `Checks` and `Protect` all nil); after this change it gets Cargo setup, fix, checks and protect entries. The detector runs after the existing Mix, npm, Go and Bundler detectors and only appends, so their values and order stay exactly as they are today. The function signature, the `Detected` and `Check` types, `AcceptanceCommand` and the Elixir golden files (`project/testdata/*.json`) do not change.

Rules:
- A Rust project is recognised only when `files` has a `Cargo.toml` key and `tracked` contains `Cargo.toml`. This is the same rule the Go and Bundler detectors use. If either is missing, the detector adds nothing.
- Setup: append `cargo fetch --locked` when `tracked` contains `Cargo.lock`, else `cargo fetch`. A `Cargo.lock` that is only in `files` and not in `tracked` does not count.
- Fix: append `cargo fmt`.
- Checks, appended in this order: `cargo-format` = `cargo fmt --check`, `cargo-build` = `cargo build --all-targets`, `cargo-test` = `cargo test`. Then, only when `tracked` contains `clippy.toml` or `.clippy.toml`, one last check `cargo-clippy` = `cargo clippy --all-targets -- -D warnings`. If both clippy files are tracked there is still only one clippy check.
- Protect: append each of `rustfmt.toml`, `.rustfmt.toml` and `clippy.toml` that `tracked` contains, in that order. `.clippy.toml` turns on the clippy check but is not protected, because the request lists only those three files.
- The config files count only through `tracked`. Their presence in `files` alone does not count.
- Runner is unchanged. When no detector adds anything to a field, it stays nil (JSON `null`), as it does today.
- Check names all start with `cargo-`, so they never collide with the Go (`go-*`, `go-root-*`, `go-cli-*`), Mix (`format`, `compile`, `test`, `credo`), npm or Bundler names. No renaming logic is needed.

Boundary: this repository owns `Detect`. Which root files `kogen init` reads into the `files` map is decided by its consumer (kogen-setup), outside this checkout, and is not changed here. That is the same boundary the Bundler detection used. Detect does not run cargo, parse `Cargo.toml` or inspect workspaces.

## Decisions
- Recognise Rust from a tracked root `Cargo.toml` whose text is in the files map. Setup is `cargo fetch --locked` with a tracked `Cargo.lock`, else `cargo fetch`. Fix is `cargo fmt`. Checks are `cargo-format` (`cargo fmt --check`), `cargo-build` (`cargo build --all-targets`) and `cargo-test` (`cargo test`) in that order. (source: request)
- Add `cargo-clippy` (`cargo clippy --all-targets -- -D warnings`) last, only when `clippy.toml` or `.clippy.toml` is tracked. (source: request)
- Protect tracked `rustfmt.toml`, `.rustfmt.toml` and `clippy.toml` in that order. Do not protect `.clippy.toml`, `Cargo.toml` or `Cargo.lock`. (source: request)
- Append the Cargo detector after Bundler, so Go and Cargo together give Go's commands first and then Cargo's, with distinct names, and every existing detector's output stays byte-identical. (source: request)

## Source comparison
- Addressed: the Problem (an empty result for a Cargo repository) is replaced by the rules above. The positive acceptance scenarios fail on the current tree.
- Addressed: every synthetic acceptance item is an executable scenario. These are: Cargo.toml plus Cargo.lock (exact setup, fix, three checks in order, no clippy check, no protect entries); added rustfmt.toml plus clippy.toml (both protected, clippy last); Cargo.toml present but untracked (nothing); no Cargo.lock (`cargo fetch`); go.mod plus Cargo.toml (all Go and Cargo check names, none duplicated); and byte-identical Mix, npm, Go and Bundler outputs. The expected bytes for the existing detectors were recorded from the unchanged tree through `features/steps/bundler_detect_probe`.
- Addressed: non-secret literals are preserved verbatim. They are `cargo fetch --locked`, `cargo fetch`, `cargo fmt`, `cargo fmt --check`, `cargo build --all-targets`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, the check names `cargo-format`, `cargo-build`, `cargo-test`, `cargo-clippy`, and the files `rustfmt.toml`, `.rustfmt.toml`, `clippy.toml`, `.clippy.toml`.
- Decided (technical): the "tracked root file" check also requires the `files` entry, matching Go and Bundler ("like the others"). Lock and config files are judged by `tracked` only, matching the npm lockfile and Mix `.formatter.exs` handling.
- Omitted deliberately: changing kogen-setup's manifest list, cargo workspaces or nested crates, toolchain files, and any execution of cargo during detection. The request does not ask for any of these.

## Tests
- A tracked Cargo.toml with a tracked Cargo.lock yields `cargo fetch --locked`, `cargo fmt`, and cargo-format, cargo-build, cargo-test in order, with no clippy and no protect: add TestDetectCargo table cases and an exact-output acceptance scenario (regression)
- No tracked Cargo.lock (absent, or only in files) yields `cargo fetch`: TestDetectCargo cases and an acceptance outline (unit)
- Cargo.toml untracked, or tracked without text in files, yields nothing for Rust: TestDetectCargo cases and an acceptance outline (unit)
- A tracked clippy.toml or .clippy.toml adds a single cargo-clippy check last. Tracked rustfmt.toml, .rustfmt.toml and clippy.toml are protected in that order, and untracked config files are ignored: TestDetectCargo cases and acceptance scenarios (unit)
- Cargo beside Go or Mix appends after them with distinct check names, and Fix, Setup and Protect are appended: TestDetectCargo mixed-stack cases and acceptance scenarios (unit)
- Existing Mix, npm, Go and Bundler outputs stay byte-identical: acceptance scenarios with recorded current JSON, plus the existing Detect, contract and Elixir golden tests unchanged (existing)

## Feasibility
- none
