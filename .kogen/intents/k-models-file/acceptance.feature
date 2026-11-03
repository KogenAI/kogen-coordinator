Feature: Opt-in model lineup files without switching legacy consumers
  Background:
    Given a models-file fixture

  Scenario: Team roles and source files are returned
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models:
        shape: {provider: anthropic, model: team-shape, effort: max}
        build: {provider: openai-compatible, model: x, effort: high, base_url: "http://localhost:11434/v1/"}
        review: {model: team-review, effort: medium}
      """
    When I call the models-file API "load"
    Then the models-file output is:
      """
      shape|anthropic||team-shape|max||0|.kogen/models.yaml
      build|openai-compatible||x|high|http://localhost:11434/v1|0|.kogen/models.yaml
      review|||team-review|medium||0|.kogen/models.yaml
      """
    And the models fixture files are unchanged

  Scenario: Local role replaces the whole team role
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models:
        shape: {model: s, effort: low}
        build: {provider: openai-compatible, model: x, effort: high, base_url: "http://localhost:11434/v1"}
        review: {model: r, effort: medium}
      """
    And models fixture file ".kogen/local/models.yaml" contains:
      """
      models:
        build: {executor: claude-code, model: local, effort: max, max_rounds: 3}
      """
    When I call the models-file API "load"
    Then the models-file output is:
      """
      shape|||s|low||0|.kogen/models.yaml
      build||claude-code|local|max||3|.kogen/local/models.yaml
      review|||r|medium||0|.kogen/models.yaml
      """
    And the models fixture files are unchanged

  Scenario: Legacy consumers still read the project lineup even with conflicting files
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models:
        build: {model: team, effort: high}
      """
    And models fixture file ".kogen/local/models.yaml" contains:
      """
      models:
        build: {model: local, effort: medium}
      """
    When I call the models-file API "legacy"
    Then the models-file output is:
      """
      legacy
      """
    And the models fixture files are unchanged

  Scenario: Omitted team roles retain existing defaults
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models: {}
      """
    When I call the models-file API "load"
    Then the models-file output is:
      """
      shape|||gpt-6.1-sol|high||0|.kogen/models.yaml
      build|||gpt-6.1-sol|medium||0|.kogen/models.yaml
      review|||gpt-6.1-terra|medium||0|.kogen/models.yaml
      """

  Scenario: New template contains only the team lineup
    When I call the models-file API "template"
    Then the models-file output is:
      """
      models:
        shape:
          model: gpt-6.1-sol
          effort: high
        build:
          model: gpt-6.1-sol
          effort: medium
        review:
          model: gpt-6.1-terra
          effort: medium
      """

  Scenario: Required team file does not fall back to the legacy lineup
    When I call the models-file API "load"
    Then the models-file error names ".kogen/models.yaml"
    And the models fixture files are unchanged

  Scenario: Invalid local role fails rather than falling back
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models: {}
      """
    And models fixture file ".kogen/local/models.yaml" contains:
      """
      models:
        build: {executor: claude-code, provider: anthropic, model: bad, effort: max}
      """
    When I call the models-file API "load"
    Then the models-file error names ".kogen/local/models.yaml"
    And the models fixture files are unchanged

  Scenario: Approval protects the team file but not machine selection
    Given models fixture file ".kogen/models.yaml" contains:
      """
      models: {}
      """
    When I call the models-file API "baseline"
    Then the models-file output is:
      """
      {"Paths":[".kogen/project.yaml",".kogen/models.yaml"],"LocalStable":true,"TeamChanged":true}
      """
