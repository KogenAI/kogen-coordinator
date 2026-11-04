Feature: An unreadable Intent folder entry is a baseline error

  Scenario: An unreadable subfolder makes the baseline fail with an error naming it
    Given coord-baseline-intent-walk-errors-visible: a fixture repository
    And coord-baseline-intent-walk-errors-visible: the Intent "demo" has the files:
      | intent.md          |
      | acceptance.feature |
      | fixtures/data.txt  |
      | notes.txt          |
    And coord-baseline-intent-walk-errors-visible: the Intent "demo" folder "fixtures" is made unreadable
    When coord-baseline-intent-walk-errors-visible: I compute the baseline of "demo"
    Then coord-baseline-intent-walk-errors-visible: the baseline fails with an error naming ".kogen/intents/demo/fixtures"

  Scenario: The same tree readable lists the same files in the same order
    Given coord-baseline-intent-walk-errors-visible: a fixture repository
    And coord-baseline-intent-walk-errors-visible: the Intent "demo" has the files:
      | intent.md          |
      | acceptance.feature |
      | fixtures/data.txt  |
      | notes.txt          |
    When coord-baseline-intent-walk-errors-visible: I compute the baseline of "demo"
    Then coord-baseline-intent-walk-errors-visible: the baseline succeeds with:
      | .kogen/intents/demo/intent.md          |
      | .kogen/intents/demo/acceptance.feature |
      | .kogen/intents/demo/fixtures/data.txt  |
      | .kogen/intents/demo/notes.txt          |
      | .kogen/project.yaml                    |
      | .kogen/models.yaml                     |

  Scenario: An absent Intent folder still yields the configuration and lineup
    Given coord-baseline-intent-walk-errors-visible: a fixture repository
    When coord-baseline-intent-walk-errors-visible: I compute the baseline of "demo"
    Then coord-baseline-intent-walk-errors-visible: the baseline succeeds with:
      | .kogen/project.yaml |
      | .kogen/models.yaml  |

  Scenario: A dangling symlink is skipped as a non-regular file without an error
    Given coord-baseline-intent-walk-errors-visible: a fixture repository
    And coord-baseline-intent-walk-errors-visible: the Intent "demo" has the files:
      | intent.md          |
      | acceptance.feature |
      | notes.txt          |
    And coord-baseline-intent-walk-errors-visible: the Intent "demo" has a dangling symlink "dangling"
    When coord-baseline-intent-walk-errors-visible: I compute the baseline of "demo"
    Then coord-baseline-intent-walk-errors-visible: the baseline succeeds with:
      | .kogen/intents/demo/intent.md          |
      | .kogen/intents/demo/acceptance.feature |
      | .kogen/intents/demo/notes.txt          |
      | .kogen/project.yaml                    |
      | .kogen/models.yaml                     |
