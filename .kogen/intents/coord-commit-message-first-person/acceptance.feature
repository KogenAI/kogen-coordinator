Feature: Owner-authored commit titles
  Scenario Outline: Lint against the target repository identity
    When coord-commit-message-first-person: I lint title "<title>" with Git user "Pat Owner"
    Then coord-commit-message-first-person: the title is "<result>"
    Examples:
      | title                                    | result   |
      | Add retry to export                      | accepted |
      | Pat Owner approved the retry change      | refused  |
      | Approved by the owner: add retry          | refused  |
      | Owner authorized export retry            | refused  |
      | Add owner field to project               | accepted |

  Scenario: Preserve exact commit message
    When coord-commit-message-first-person: I lint title "Add retry to export" with Git user "Pat Owner"
    Then coord-commit-message-first-person: the commit message is
      """
      Add retry to export\n\nKogen-Intent: demo\n
      """
