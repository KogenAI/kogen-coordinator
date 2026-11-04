# Detect Yarn and pnpm install commands

Slug: coord-detect-npm-other-lockfiles
Model: not applicable — deterministic detection has no meaningful state transitions
Acceptance:
- .kogen/intents/coord-detect-npm-other-lockfiles/acceptance.feature
- features/steps/coord-detect-npm-other-lockfiles__detect.js

Update project.Detect(files map[string]string, tracked []string) so valid package.json projects use Yarn or pnpm when exactly that manager's root lockfile is tracked and package-lock.json is not. Select both Setup and script commands consistently. All other lockfile combinations retain existing npm behavior: package-lock.json adds npm ci --no-audit --no-fund even with other locks; without it ambiguous or absent locks add no install. Only tracked paths select a manager; a lockfile merely in files does not. Keep unrelated detection unchanged. No manager execution, version detection or packageManager field policy is added.

## Decisions
- Use yarn install --frozen-lockfile and yarn run <script>, or pnpm install --frozen-lockfile and pnpm run <script>, respectively. (source: request)
- Keep ordered names test, lint, typecheck, check, the npm- collision prefix for every manager, placeholder filtering and Cucumber detection. (source: request)
- Preserve Elixir-parity goldens; regenerate npm-only results only for new cases using the documented update workflow, never hand-edit recorded outputs. (source: request)

## Source comparison
- Addressed: request Problem and Need replace npm-only detection in project/detect.go with the manager selection described above; acceptance lockfile matrix covers exact installs, checks and ambiguity including package-lock precedence.
- Addressed: synthetic Yarn/pnpm test and lint examples are included alongside all four supported scripts; placeholder, collision prefix and Cucumber behavior are executable scenarios. npm-only behavior and no-package behavior remain unchanged.
- Addressed: synthetic golden requirement is retained above and verified by existing golden tests under configured go-test. README regeneration instructions remain authoritative. No scope conflicts or deliberate omissions.

## Tests
- Select the single tracked alternative manager for both install and all supported script checks: add focused Detect table regression cases and acceptance matrix (regression)
- Preserve npm selection for package-lock and ambiguous/absent locks, ignoring untracked locks and requiring package.json: extend Detect matrix (unit)
- Preserve placeholder filtering, ordering, npm- collision naming and Cucumber runner selection for alternative managers: extend TestDetectNpmScripts and runner cases plus acceptance (unit)
- Preserve recorded Elixir parity and unrelated detectors: existing golden and Detect tests via go test ./... (existing)

## Feasibility
- Existing reusable features/steps/bundler_detect_probe/main.go calls the exported Detect boundary and emits JSON with Setup, Fix, Checks, Protect, Runner. A local probe using go run ./features/steps/bundler_detect_probe on a package-lock fixture exited 0 in 1.2 s, returning npm ci and npm run test as expected. No external capability is required; the requested commands are output literals, not executed integrations.
