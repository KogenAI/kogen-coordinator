# Detect Python projects from committed root files

Slug: coord-detect-python
Model: not applicable — deterministic transformation of the files map and tracked list, with no lifecycle state
Acceptance:
- .kogen/intents/coord-detect-python/acceptance.feature
- features/steps/coord-detect-python__detect.js

Extend `project.Detect(files map[string]string, tracked []string) Detected` in `project/detect.go` with a Python detector, with focused unit tests in `project/detect_test.go`. Today a repository whose root has only `pyproject.toml` or `requirements.txt` gets nothing; after this change it gets a Python setup command, checks and protect entries as justified by those files. The detector runs after the Cargo detector and before Gradle and Maven, and only appends, so existing detectors' values and order stay as they are. The function signature, the `Detected` and `Check` types and `AcceptanceCommand` do not change.

Rules:
- A Python project is recognised when at least one of `pyproject.toml` or `requirements.txt` is both a key of `files` and contained in `tracked`. A file present in `files` but not tracked counts as absent. With neither, the detector adds nothing.
- Setup (exactly one entry): `python -m pip install -r requirements.txt` when `requirements.txt` counts as present, else `python -m pip install -e .`.
- Check `python-test` = `pytest`, when the text of a present `pyproject.toml` or of a present `requirements.txt` contains the substring `pytest`.
- Check `python-lint` = `python -m ruff check .`, appended after `python-test`, when a present `pyproject.toml` text contains `[tool.ruff` or `tracked` contains `ruff.toml` or `.ruff.toml`. Only one lint check even if several qualify.
- Protect: each of `ruff.toml`, `.ruff.toml`, `pytest.ini` that `tracked` contains, in that order, only when a Python project was recognised. Presence in `files` alone does not count.
- Fix and Runner are untouched by Python. Fields nothing sets stay nil.

## Decisions
- Recognise Python from a tracked root `pyproject.toml` or `requirements.txt` whose text is in the files map, the same rule the Go, Bundler and Cargo detectors use. (evidence: project/detect.go) (source: request)
- Setup prefers `-r requirements.txt` when that file is present, otherwise `-e .`. (source: request)
- Add `python-test` and `python-lint` only when the files justify them; pytest mention is a case-sensitive substring match of `pytest`. (assumption: the substring match is case-sensitive and covers any mention such as a dependency line) (source: request)
- Protect tracked `ruff.toml`, `.ruff.toml`, `pytest.ini` in that order; no Fix command is added. (source: request)
- Append the Python detector right after Cargo in `Detect`, so a Go plus Python root keeps Go's setup and checks first and unchanged. (evidence: project/detect.go; project/detect_test.go) (source: request)

## Source comparison
- Addressed: every synthetic acceptance item is an executable scenario: pyproject with pytest, requirements with pytest, `[tool.ruff]` adding lint and its absence, tracked versus untracked `ruff.toml`, a README-only root, and Go plus Python.
- Addressed: literals `python -m pip install -r requirements.txt`, `python -m pip install -e .`, `pytest`, `python -m ruff check .`, names `python-test`, `python-lint`, files `ruff.toml`, `.ruff.toml`, `pytest.ini`.
- Omitted: which root files `kogen init` reads into `files` (a consumer outside this checkout), and executing python tools.

## Tests
- Setup and python-test from pyproject.toml or requirements.txt, with both-tracked and untracked cases: add TestDetectPython table cases and acceptance scenarios (unit)
- python-lint only with a `[tool.ruff` table or a tracked ruff.toml/.ruff.toml: TestDetectPython cases and acceptance scenarios (unit)
- Protect lists only tracked ruff.toml, .ruff.toml, pytest.ini: TestDetectPython cases and acceptance scenarios (unit)
- README-only root adds nothing; Go plus Python keeps Go unchanged: acceptance scenarios (scenario)
- Existing detectors' outputs stay unchanged: existing Detect tests and golden tests (existing)

## Feasibility
- none
