Feature: Roles may select the experimental messages-compatible provider
  This feature covers the role validation of the model lineup. A role may name provider
  messages-compatible with a nonblank model, a nonblank effort and an http(s) base_url, and the
  parsed role carries the provider and the normalized base URL. Each scenario writes its own
  temporary project and uses a small Go driver built from this checkout's module. No model is
  called and no network is used.

  Background:
    Given accept-experimental-messages-compatible-896bcb: a temporary project with a valid ".kogen/project.yaml"

  Scenario Outline: Each supported role accepts messages-compatible and returns provider and base URL
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        <role>:
          provider: messages-compatible
          model: claude-sonnet-5-5
          effort: high
          base_url: 'https://api.example.com/v1'
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the "<role>" role has provider "messages-compatible", model "claude-sonnet-5-5", effort "high" and base URL "https://api.example.com/v1"

    Examples:
      | role   |
      | shape  |
      | build  |
      | review |

  Scenario: The base URL is normalized and every role of a mixed lineup keeps its own provider
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        shape:
          provider: messages-compatible
          model: m-shape
          effort: low
          base_url: 'https://llm.example.com/v1/'
        build:
          provider: openai-compatible
          model: m-build
          effort: default
          base_url: 'http://localhost:11434/v1/'
        review:
          provider: messages-compatible
          model: m-review
          effort: medium
          base_url: 'http://localhost:8080'
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the "shape" role has provider "messages-compatible", model "m-shape", effort "low" and base URL "https://llm.example.com/v1"
    And accept-experimental-messages-compatible-896bcb: the "build" role has provider "openai-compatible", model "m-build", effort "default" and base URL "http://localhost:11434/v1"
    And accept-experimental-messages-compatible-896bcb: the "review" role has provider "messages-compatible", model "m-review", effort "medium" and base URL "http://localhost:8080"

  Scenario: LoadModels returns the same provider and normalized base URL
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build:
          provider: messages-compatible
          model: claude-opus-5-5
          effort: max
          base_url: "https://api.example.com/v1/"
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the model lineup with LoadModels
    Then accept-experimental-messages-compatible-896bcb: the "build" role has provider "messages-compatible", model "claude-opus-5-5", effort "max" and base URL "https://api.example.com/v1"
    And accept-experimental-messages-compatible-896bcb: the "shape" role has provider "chatgpt", model "gpt-6.1-sol", effort "high" and base URL ""

  Scenario: A messages-compatible role without base_url is refused
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build:
          provider: messages-compatible
          model: claude-sonnet-5-5
          effort: high
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the load fails with the error "environment/project_config_invalid" with exit 3 and detail "<root>/.kogen/models.yaml"
    And accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "messages-compatible needs base_url"

  Scenario Outline: A blank, malformed or non-http(s) base_url is refused for messages-compatible
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build:
          provider: messages-compatible
          model: claude-sonnet-5-5
          effort: high
          base_url: '<base_url>'
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the load fails with the error "environment/project_config_invalid" with exit 3 and detail "<root>/.kogen/models.yaml"
    And accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "base_url must be an http:// or https:// URL"

    Examples:
      | base_url                      |
      |                               |
      | localhost:11434               |
      | api.example.com/v1            |
      | ftp://api.example.com/v1      |
      | https://                      |
      | http://api.example.com/v1?x=1 |
      | not a url                     |

  Scenario Outline: A messages-compatible role without a nonblank model or effort is refused
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {provider: messages-compatible, <fields>, base_url: 'https://api.example.com/v1'}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the load fails with the error "environment/project_config_invalid" with exit 3 and detail "<root>/.kogen/models.yaml"
    And accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "{model, effort}"

    Examples:
      | fields                |
      | effort: high          |
      | model: m              |
      | model: '', effort: high |
      | model: '  ', effort: high |
      | model: m, effort: ''  |
      | model: m, effort: '  ' |

  Scenario: openai-compatible keeps accepting a valid base_url and normalizing it
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {provider: openai-compatible, model: qwen3-coder:30b, effort: default, base_url: 'https://llm.example.com/v1/'}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the "build" role has provider "openai-compatible", model "qwen3-coder:30b", effort "default" and base URL "https://llm.example.com/v1"

  Scenario: openai-compatible without base_url is still refused
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {provider: openai-compatible, model: m, effort: default}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "openai-compatible needs base_url"

  Scenario Outline: openai-compatible still refuses a malformed base_url
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {provider: openai-compatible, model: m, effort: default, base_url: '<base_url>'}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "base_url must be an http:// or https:// URL"

    Examples:
      | base_url                |
      | ftp://host/v1           |
      | localhost:11434         |
      | http://h/v1?x=1         |

  Scenario Outline: base_url is still refused for every provider that does not take one
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {<fields>, base_url: 'http://localhost:1/v1'}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build"
    And accept-experimental-messages-compatible-896bcb: that error line contains "base_url is only for provider"
    And accept-experimental-messages-compatible-896bcb: that error line contains "openai-compatible"
    And accept-experimental-messages-compatible-896bcb: that error line contains "messages-compatible"

    Examples:
      | fields                                         |
      | model: gpt-6.1-sol, effort: high               |
      | provider: chatgpt, model: gpt-6.1-sol, effort: high |
      | provider: supergrok, model: grok-4.7, effort: high |
      | provider: opencode-go, model: kimi-k3, effort: high |
      | provider: anthropic, model: claude-sonnet-5-5, effort: high |

  Scenario: An unknown provider is still refused and the message names messages-compatible
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        build: {provider: grok, model: grok-4.7, effort: low}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the error has exactly one line and it starts with "line 2: models.build.provider must be"
    And accept-experimental-messages-compatible-896bcb: that error line contains "openai-compatible"
    And accept-experimental-messages-compatible-896bcb: that error line contains "messages-compatible"

  Scenario: The existing providers without a base_url keep their roles and carry no base URL
    Given accept-experimental-messages-compatible-896bcb: the project's ".kogen/models.yaml" is:
      """
      models:
        shape: {provider: supergrok, model: grok-4.7, effort: high}
        build: {provider: opencode-go, model: kimi-k3, effort: high}
        review: {provider: anthropic, model: claude-sonnet-5-5, effort: high}
      """
    When accept-experimental-messages-compatible-896bcb: Kogen loads the configuration with LoadConfig
    Then accept-experimental-messages-compatible-896bcb: the "shape" role has provider "supergrok", model "grok-4.7", effort "high" and base URL ""
    And accept-experimental-messages-compatible-896bcb: the "build" role has provider "opencode-go", model "kimi-k3", effort "high" and base URL ""
    And accept-experimental-messages-compatible-896bcb: the "review" role has provider "anthropic", model "claude-sonnet-5-5", effort "high" and base URL ""
