Feature: Reject removed round configuration
  Scenario Outline: Removed option is explained when loading files
    When k-coord-reject-max-rounds: I load "<file>" with role "<role>" and options "<options>"
    Then k-coord-reject-max-rounds: the result matches "(?is)^RESULT:.*max_rounds.*removed.*executor.*(?:round|limit).*6.*review"
    Examples:
      | file                     | role   | options                               |
      | .kogen/project.yaml      | shape  | executor: claude-code, max_rounds: 3   |
      | .kogen/project.yaml      | build  | executor: claude-code, max_rounds: 3   |
      | .kogen/project.yaml      | review | executor: claude-code, max_rounds: 3   |
      | .kogen/project.yaml      | build  | executor: native, max_rounds: 2        |
      | .kogen/project.yaml      | build  | max_rounds: 0                         |
      | .kogen/project.yaml      | build  | max_rounds: nonsense                  |
      | .kogen/models.yaml       | build  | executor: claude-code, max_rounds: 3   |
      | .kogen/local/models.yaml | review | executor: claude-code, max_rounds: 3   |

  Scenario Outline: Roles without the removed key still load
    When k-coord-reject-max-rounds: I load "<file>" with role "<role>" and options "<options>"
    Then k-coord-reject-max-rounds: the result matches "^RESULT: <nil>"
    Examples:
      | file                     | role   | options                |
      | .kogen/project.yaml      | shape  | executor: native       |
      | .kogen/project.yaml      | build  | executor: claude-code  |
      | .kogen/models.yaml       | review | executor: claude-code  |
      | .kogen/local/models.yaml | build  | executor: claude-code  |
