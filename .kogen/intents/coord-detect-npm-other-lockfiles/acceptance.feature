Feature: Select a package manager from tracked root lockfiles
  Scenario Outline: Select install and all script commands without guessing
    When coord-detect-npm-other-lockfiles: Detect receives:
      """
      {"Files":{"package.json":"{\"scripts\":{\"test\":\"jest\",\"lint\":\"eslint .\",\"typecheck\":\"tsc\",\"check\":\"custom\"}}","yarn.lock":"","pnpm-lock.yaml":""},"Tracked":<tracked>}
      """
    Then coord-detect-npm-other-lockfiles: Detect returns:
      """
      {"Setup":<setup>,"Fix":null,"Checks":[{"Name":"test","Run":"<manager> run test"},{"Name":"lint","Run":"<manager> run lint"},{"Name":"typecheck","Run":"<manager> run typecheck"},{"Name":"check","Run":"<manager> run check"}],"Protect":null,"Runner":""}
      """
    Examples:
      | tracked | setup | manager |
      | ["package.json","yarn.lock"] | ["yarn install --frozen-lockfile"] | yarn |
      | ["package.json","pnpm-lock.yaml"] | ["pnpm install --frozen-lockfile"] | pnpm |
      | ["package.json","package-lock.json"] | ["npm ci --no-audit --no-fund"] | npm |
      | ["package.json","yarn.lock","pnpm-lock.yaml"] | null | npm |
      | ["package.json"] | null | npm |
      | ["package.json","package-lock.json","yarn.lock"] | ["npm ci --no-audit --no-fund"] | npm |
      | ["package.json","package-lock.json","pnpm-lock.yaml"] | ["npm ci --no-audit --no-fund"] | npm |
      | ["package.json","package-lock.json","yarn.lock","pnpm-lock.yaml"] | ["npm ci --no-audit --no-fund"] | npm |

  Scenario Outline: Keep placeholder filtering and Cucumber detection
    When coord-detect-npm-other-lockfiles: Detect receives:
      """
      {"Files":{"package.json":"{\"scripts\":{\"test\":\"echo \\\"Error: no test specified\\\" && exit 1\",\"lint\":\"eslint .\"},\"devDependencies\":{\"@cucumber/cucumber\":\"*\"}}"},"Tracked":["package.json","<lock>","features/step_definitions/example.js"]}
      """
    Then coord-detect-npm-other-lockfiles: Detect returns:
      """
      {"Setup":["<manager> install --frozen-lockfile"],"Fix":null,"Checks":[{"Name":"lint","Run":"<manager> run lint"}],"Protect":null,"Runner":"features/step_definitions"}
      """
    Examples:
      | lock | manager |
      | yarn.lock | yarn |
      | pnpm-lock.yaml | pnpm |

  Scenario Outline: Keep npm collision prefix with Mix
    When coord-detect-npm-other-lockfiles: Detect receives:
      """
      {"Files":{"mix.exs":"","package.json":"{\"scripts\":{\"test\":\"jest\"}}"},"Tracked":["mix.exs","package.json","<lock>"]}
      """
    Then coord-detect-npm-other-lockfiles: Detect returns:
      """
      {"Setup":["mix deps.get","<manager> install --frozen-lockfile"],"Fix":null,"Checks":[{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"},{"Name":"npm-test","Run":"<manager> run test"}],"Protect":null,"Runner":""}
      """
    Examples:
      | lock | manager |
      | yarn.lock | yarn |
      | pnpm-lock.yaml | pnpm |

  Scenario: Lockfiles without package.json do not install
    When coord-detect-npm-other-lockfiles: Detect receives:
      """
      {"Files":{},"Tracked":["yarn.lock"]}
      """
    Then coord-detect-npm-other-lockfiles: Detect returns:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """
