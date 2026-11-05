Feature: The team model lineup file is in the baseline only when the project has it

  Scenario: A project without the team file gets its pre-lineup list, and adding the file inserts it once after the configuration
    Given coord-baseline-optional-files-when-present: a fixture project whose protect patterns are:
      | guard/** |
    When coord-baseline-optional-files-when-present: I compute the baseline
    Then coord-baseline-optional-files-when-present: the baseline is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |
    When coord-baseline-optional-files-when-present: the fixture file ".kogen/models.yaml" is added
    And coord-baseline-optional-files-when-present: I compute the baseline
    Then coord-baseline-optional-files-when-present: the baseline is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | .kogen/models.yaml                        |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |

  Scenario: A protect pattern that also matches the team file still lists it once, right after the configuration
    Given coord-baseline-optional-files-when-present: a fixture project whose protect patterns are:
      | .kogen/*.yaml |
      | guard/**      |
    When coord-baseline-optional-files-when-present: I compute the baseline
    Then coord-baseline-optional-files-when-present: the baseline is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |
    When coord-baseline-optional-files-when-present: the fixture file ".kogen/models.yaml" is added
    And coord-baseline-optional-files-when-present: I compute the baseline
    Then coord-baseline-optional-files-when-present: the baseline is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | .kogen/models.yaml                        |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |

  Scenario: The machine-local lineup file on its own adds nothing
    Given coord-baseline-optional-files-when-present: a fixture project whose protect patterns are:
      | guard/** |
    When coord-baseline-optional-files-when-present: the fixture file ".kogen/local/models.yaml" is added
    And coord-baseline-optional-files-when-present: I compute the baseline
    Then coord-baseline-optional-files-when-present: the baseline is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |

  Scenario: The former rule's list is available to recognize checkpoints and approvals saved before the change
    Given coord-baseline-optional-files-when-present: a fixture project whose protect patterns are:
      | guard/** |
    When coord-baseline-optional-files-when-present: I compute the baseline
    And coord-baseline-optional-files-when-present: I apply the former rule to that baseline
    Then coord-baseline-optional-files-when-present: the former rule's list is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | .kogen/models.yaml                        |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |
    When coord-baseline-optional-files-when-present: the fixture file ".kogen/models.yaml" is added
    And coord-baseline-optional-files-when-present: I compute the baseline
    And coord-baseline-optional-files-when-present: I apply the former rule to that baseline
    Then coord-baseline-optional-files-when-present: the former rule's list is:
      | .kogen/intents/fixture/intent.md          |
      | .kogen/intents/fixture/acceptance.feature |
      | features/steps/a.js                       |
      | .kogen/intents/fixture/notes.md           |
      | .kogen/project.yaml                       |
      | .kogen/models.yaml                        |
      | guard/a/deep.txt                          |
      | guard/z.txt                               |

  Scenario: The producer contract golden records the new lists and its test passes
    Then coord-baseline-optional-files-when-present: the contract golden contract/testdata/baseline.json holds:
      """
      {
        "basic": [
          ".kogen/intents/fixture/intent.md",
          ".kogen/project.yaml"
        ],
        "acceptance": [
          ".kogen/intents/fixture/intent.md",
          ".kogen/intents/fixture/acceptance.feature",
          "features/steps/z.js",
          "features/steps/a.js",
          ".kogen/intents/fixture/b.txt",
          ".kogen/intents/fixture/notes.md",
          ".kogen/project.yaml"
        ],
        "protect": [
          ".kogen/intents/fixture/intent.md",
          ".kogen/project.yaml",
          "guard/a/deep.txt",
          "guard/z.txt"
        ],
        "team": [
          ".kogen/intents/fixture/intent.md",
          ".kogen/project.yaml",
          ".kogen/models.yaml"
        ]
      }
      """
    And coord-baseline-optional-files-when-present: every TestBaselineContractGolden subtest passes in ./contract
