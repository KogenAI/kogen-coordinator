Feature: Host-local lineups and checks without a commit under the Build
  A host keeps its own role lineups in .kogen/local/models.yaml and its own check commands in
  .kogen/local/checks.yaml. project.LoadConfig, which a Build reads before any model call, applies
  them over the committed .kogen/project.yaml. .kogen/local/ is ignored and never committed.

  Background:
    Given k-local-lineups-checks: a project whose main commit holds the configuration:
      """
      version: 1
      commands:
        setup: []
        fix:
          - 'gofmt -w .'
        checks:
          - name: format
            run: 'test -z "$(gofmt -l .)"'
          - name: compile
            run: 'go build ./...'
          - name: vet
            run: 'go vet ./...'
          - name: go-test
            run: 'GOFLAGS=-trimpath go test ./...'
        acceptance:
          run: 'NODE_PATH="$KOGEN_CUCUMBER" "$KOGEN_NODE" "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js" --strict --require ''features/steps/*.js'' --format "message:$KOGEN_ACCEPTANCE_REPORT" "$KOGEN_ACCEPTANCE_FEATURES"'
          steps_dir: 'features/steps'
      models:
        shape:
          provider: chatgpt
          model: gpt-6.1-sol
          effort: low
        build:
          provider: chatgpt
          model: gpt-6.1-terra
          effort: high
        review:
          provider: chatgpt
          model: gpt-6.1-terra
          effort: medium
      """

  Scenario: Without host-local files the committed configuration decides
    Then k-local-lineups-checks: the checkout has nothing to commit
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the checks are:
      | name    | run                               |
      | format  | test -z "$(gofmt -l .)"           |
      | compile | go build ./...                    |
      | vet     | go vet ./...                      |
      | go-test | GOFLAGS=-trimpath go test ./...   |
    And k-local-lineups-checks: the roles are:
      | role   | executor | provider | model         | effort |
      | shape  |          | chatgpt  | gpt-6.1-sol   | low    |
      | build  |          | chatgpt  | gpt-6.1-terra | high   |
      | review |          | chatgpt  | gpt-6.1-terra | medium |
    And k-local-lineups-checks: the committed configuration is unchanged and nothing is left to commit

  Scenario: A host-local lineup replaces each role it names as a whole
    Given k-local-lineups-checks: the host-local file ".kogen/local/models.yaml" contains:
      """
      models:
        shape:
          executor: claude-code
          model: claude-opus-5-5
          effort: high
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the roles are:
      | role   | executor    | provider | model             | effort |
      | shape  | claude-code |          | claude-opus-5-5   | high   |
      | build  | claude-code |          | claude-sonnet-5-5 | high   |
      | review |             | chatgpt  | gpt-6.1-terra     | medium |
    And k-local-lineups-checks: the checks are:
      | name    | run                               |
      | format  | test -z "$(gofmt -l .)"           |
      | compile | go build ./...                    |
      | vet     | go vet ./...                      |
      | go-test | GOFLAGS=-trimpath go test ./...   |
    And k-local-lineups-checks: the committed configuration is unchanged and nothing is left to commit

  Scenario: A host-local check list replaces commands under the committed names and order
    Given k-local-lineups-checks: the host-local file ".kogen/local/checks.yaml" contains:
      """
      checks:
        - name: go-test
          run: 'GOMAXPROCS=2 GOFLAGS=-trimpath nice -n 19 go test -p 2 ./...'
        - name: compile
          run: 'GOMAXPROCS=2 nice -n 19 go build ./...'
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the checks are:
      | name    | run                                                          |
      | format  | test -z "$(gofmt -l .)"                                      |
      | compile | GOMAXPROCS=2 nice -n 19 go build ./...                       |
      | vet     | go vet ./...                                                 |
      | go-test | GOMAXPROCS=2 GOFLAGS=-trimpath nice -n 19 go test -p 2 ./... |
    And k-local-lineups-checks: the roles are:
      | role   | executor | provider | model         | effort |
      | shape  |          | chatgpt  | gpt-6.1-sol   | low    |
      | build  |          | chatgpt  | gpt-6.1-terra | high   |
      | review |          | chatgpt  | gpt-6.1-terra | medium |
    And k-local-lineups-checks: the committed configuration is unchanged and nothing is left to commit

  Scenario: A Build with host-local files runs on the main commit and lands a commit whose parent is that commit
    Given k-local-lineups-checks: the host-local file ".kogen/local/models.yaml" contains:
      """
      models:
        shape:
          executor: claude-code
          model: claude-opus-5-5
          effort: high
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
        review:
          executor: claude-code
          model: claude-opus-5-5
          effort: high
      """
    And k-local-lineups-checks: the host-local file ".kogen/local/checks.yaml" contains:
      """
      checks:
        - name: go-test
          run: 'GOMAXPROCS=2 GOFLAGS=-trimpath nice -n 19 go test -p 2 ./...'
      """
    Then k-local-lineups-checks: the checkout has nothing to commit
    When k-local-lineups-checks: a Build on the main commit lands the new file "notes.txt" containing "host-local lineups"
    Then k-local-lineups-checks: the parent of the landed commit is exactly the main commit
    And k-local-lineups-checks: the landed commit changes only "notes.txt"
    And k-local-lineups-checks: the files of the landed commit are:
      """
      .gitignore
      .kogen/project.yaml
      notes.txt
      """
    And k-local-lineups-checks: the committed configuration is unchanged and nothing is left to commit
    And k-local-lineups-checks: the roles are:
      | role   | executor    | provider | model             | effort |
      | shape  | claude-code |          | claude-opus-5-5   | high   |
      | build  | claude-code |          | claude-sonnet-5-5 | high   |
      | review | claude-code |          | claude-opus-5-5   | high   |
    And k-local-lineups-checks: the checks are:
      | name    | run                                                          |
      | format  | test -z "$(gofmt -l .)"                                      |
      | compile | go build ./...                                               |
      | vet     | go vet ./...                                                 |
      | go-test | GOMAXPROCS=2 GOFLAGS=-trimpath nice -n 19 go test -p 2 ./... |

  Scenario: A malformed host-local lineup stops the Build before it starts
    Given k-local-lineups-checks: the host-local file ".kogen/local/models.yaml" contains:
      """
      models:
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
          max_rounds: 6
      """
    When k-local-lineups-checks: a Build on the main commit lands the new file "notes.txt" containing "host-local lineups"
    Then k-local-lineups-checks: the load fails naming ".kogen/local/models.yaml" with the lines:
      """
      line 6: models.build.max_rounds was removed; the external executor's own round limit caps a role, and 6 caps a review role whose executor supplies none
      """
    And k-local-lineups-checks: no commit landed and HEAD is still the main commit

  Scenario: A host-local check list naming a check the project does not commit stops the load
    Given k-local-lineups-checks: the host-local file ".kogen/local/checks.yaml" contains:
      """
      checks:
        - name: lint
          run: 'golangci-lint run'
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the load fails naming ".kogen/local/checks.yaml" with the lines:
      """
      line 2: check name lint is not in .kogen/project.yaml
      """

  Scenario: A host-local check list naming a check twice stops the load
    Given k-local-lineups-checks: the host-local file ".kogen/local/checks.yaml" contains:
      """
      checks:
        - name: go-test
          run: 'nice -n 19 go test ./...'
        - name: go-test
          run: 'nice -n 10 go test ./...'
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the load fails naming ".kogen/local/checks.yaml" with the lines:
      """
      line 4: check name go-test is used twice
      """

  Scenario: A host-local check list that is not valid YAML stops the load naming its line
    Given k-local-lineups-checks: the host-local file ".kogen/local/checks.yaml" contains:
      """
      checks:
        - name: go-test
          run: [nice
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the load fails naming ".kogen/local/checks.yaml" with the lines:
      """
      line 3: unclosed [
      """

  Scenario: A malformed committed configuration is reported before the host-local files
    Given k-local-lineups-checks: the host-local file ".kogen/local/models.yaml" contains:
      """
      models:
        build: {executor: claude-code, model: claude-sonnet-5-5, effort: high, max_rounds: 6}
      """
    And k-local-lineups-checks: the working copy of .kogen/project.yaml is replaced with:
      """
      version: 1
      commands:
        acceptance:
          run: true
      """
    When k-local-lineups-checks: Kogen loads the project configuration
    Then k-local-lineups-checks: the load fails naming ".kogen/project.yaml" with the lines:
      """
      line 4: commands.acceptance.run must be a string or null
      """
