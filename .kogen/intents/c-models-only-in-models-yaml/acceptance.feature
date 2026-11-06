Feature: Model roles live only in the models files
  .kogen/project.yaml no longer accepts a models: key. project.LoadConfig takes every role from the
  built-in defaults, then the team file .kogen/models.yaml, then the host-local
  .kogen/local/models.yaml; each role a file names replaces the whole role. RenderConfig and the
  template write no models block. Each scenario uses its own temporary project and a small Go
  driver built from this checkout's module.

  Scenario: A models key in .kogen/project.yaml is refused by LoadConfig and ParseConfig
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      models:
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
      """
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the result is the error "environment/project_config_invalid" with exit 3, detail "<root>/.kogen/project.yaml" and exactly the lines:
      """
      line 6: models is no longer read from .kogen/project.yaml; move the model lineup to .kogen/models.yaml
      """
    When c-models-only-in-models-yaml: Kogen parses ".kogen/project.yaml" with ParseConfig
    Then c-models-only-in-models-yaml: the result is the error "environment/project_config_invalid" with exit 3, detail "<root>/.kogen/project.yaml" and exactly the lines:
      """
      line 6: models is no longer read from .kogen/project.yaml; move the model lineup to .kogen/models.yaml
      """

  Scenario: The team file decides every role it names
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      """
    And c-models-only-in-models-yaml: the project's ".kogen/models.yaml" is:
      """
      models:
        shape:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
        review:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
      """
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the roles are:
      | role   | executor    | provider | model             | effort | external |
      | shape  | claude-code |          | claude-sonnet-5-5 | high   | true     |
      | build  | claude-code |          | claude-sonnet-5-5 | high   | true     |
      | review | claude-code |          | claude-sonnet-5-5 | high   | true     |
    And c-models-only-in-models-yaml: the checks are:
      | name | run           |
      | test | go test ./... |

  Scenario: A team file naming one role keeps the defaults for the others
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      """
    And c-models-only-in-models-yaml: the project's ".kogen/models.yaml" is:
      """
      models:
        review:
          provider: anthropic
          model: claude-opus-5-5
          effort: max
      """
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the roles are:
      | role   | executor | provider  | model           | effort | external |
      | shape  |          |           | gpt-6.1-sol     | high   | false    |
      | build  |          |           | gpt-6.1-sol     | medium | false    |
      | review |          | anthropic | claude-opus-5-5 | max    | false    |

  Scenario: The local file replaces only the roles it names over the team file
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      """
    And c-models-only-in-models-yaml: the project's ".kogen/models.yaml" is:
      """
      models:
        shape:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
        review:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
      """
    And c-models-only-in-models-yaml: the project's ".kogen/local/models.yaml" is:
      """
      models:
        build:
          executor: claude-code
          model: claude-opus-5-5
          effort: max
      """
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the roles are:
      | role   | executor    | provider | model             | effort | external |
      | shape  | claude-code |          | claude-sonnet-5-5 | high   | true     |
      | build  | claude-code |          | claude-opus-5-5   | max    | true     |
      | review | claude-code |          | claude-sonnet-5-5 | high   | true     |

  Scenario: Without models files the roles are the defaults
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      """
    And c-models-only-in-models-yaml: the project has no ".kogen/models.yaml" and no ".kogen/local/models.yaml"
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the roles equal the built-in DefaultModels

  Scenario: A malformed team file fails the load with its path and line
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: test
            run: 'go test ./...'
      """
    And c-models-only-in-models-yaml: the project's ".kogen/models.yaml" is:
      """
      models:
        build:
          executor: claude-code
          model: claude-sonnet-5-5
          effort: high
          max_rounds: 3
      """
    When c-models-only-in-models-yaml: Kogen loads the configuration with LoadConfig
    Then c-models-only-in-models-yaml: the result is the error "environment/project_config_invalid" with exit 3, detail "<root>/.kogen/models.yaml" and exactly the lines:
      """
      line 6: models.build.max_rounds was removed; the external executor's own round limit caps a role, and 6 caps a review role whose executor supplies none
      """

  Scenario: RenderConfig and the template write no models block
    When c-models-only-in-models-yaml: Kogen renders with RenderConfig a configuration whose three roles are executor "claude-code", model "claude-sonnet-5-5" and effort "high"
    Then c-models-only-in-models-yaml: the rendered text has no line starting with "models:"
    And c-models-only-in-models-yaml: the rendered text is exactly:
      """
      version: 1
      commands:
        setup:
          - 'go mod download'
        fix:
          - 'gofmt -w .'
        checks:
          - name: test
            run: 'go test ./...'
        acceptance:
          run: 'it''s'
          steps_dir: 'features/steps'
      protect:
        - '.golangci.yml'
      """
    And c-models-only-in-models-yaml: the rendered text reads back with ParseConfig to the rendered setup, fix, checks, acceptance and protect
    And c-models-only-in-models-yaml: the roles read back from the rendered text equal the built-in DefaultModels
    And c-models-only-in-models-yaml: the template has no line starting with "models:"
    And c-models-only-in-models-yaml: the template reads back with ParseConfig with the built-in DefaultModels
    And c-models-only-in-models-yaml: RenderConfig of an empty configuration is the template

  Scenario: ReadableConfig reads the rest and does not apply a models key
    Given c-models-only-in-models-yaml: a temporary project whose ".kogen/project.yaml" is:
      """
      version: 1
      commands:
        checks:
          - name: unit
            run: u
      protect:
        - keep
      models:
        build: {model: x, effort: low}
      """
    When c-models-only-in-models-yaml: Kogen reads ".kogen/project.yaml" with ReadableConfig
    Then c-models-only-in-models-yaml: the checks are:
      | name | run |
      | unit | u   |
    And c-models-only-in-models-yaml: the protect patterns are:
      | pattern |
      | keep    |
    And c-models-only-in-models-yaml: the roles equal the built-in DefaultModels
