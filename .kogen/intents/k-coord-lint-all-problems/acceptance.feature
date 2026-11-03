Feature: Intent lint reports every problem in one refusal
  A refused Intent lists every defect the checks find, each line naming the offending text or value.

  Background:
    Given the Intent demo has this acceptance.feature:
      """
      Feature: F
        Scenario: s
          Then it works
      """

  Scenario: A long title ending in a period and two unsourced decisions are all reported
    Given the Intent demo has this intent.md:
      """
      # Make every lint problem visible at once in one refusal.

      Slug: demo
      Model: not applicable — no state
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      prose

      ## Decisions
      - Report all problems
      - Name the decision text (source: request)
      - Name the current length

      ## Feasibility
      - none

      ## Tests
      - rule: a test (unit)
      """
    When Kogen checks the Intent demo
    Then the check refuses it with exit 1 and prints:
      """
      intent/lint: the Intent needs changes
        title: the title must be at most 50 characters, not 55
        title: the title must not end with a period
        decisions: - Report all problems must end with `(source: request)` or `(source: answer <n>)`
        decisions: - Name the current length must end with `(source: request)` or `(source: answer <n>)`
      """

  Scenario: A title that is too long names its length in characters
    Given the Intent demo has this intent.md:
      """
      # 日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日

      Slug: demo
      Model: not applicable — no state
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      prose

      ## Decisions
      - Keep it (source: answer 2).

      ## Feasibility
      - none

      ## Tests
      - rule: a test (unit)
      """
    When Kogen checks the Intent demo
    Then the check refuses it with exit 1 and prints:
      """
      intent/lint: the Intent needs changes
        title: the title must be at most 50 characters, not 51
      """

  Scenario: An Intent without problems is still accepted
    Given the Intent demo has this intent.md:
      """
      # 日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日日

      Slug: demo
      Model: not applicable — no state
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      prose

      ## Decisions
      - Keep it (source: answer 2).
      - Keep that (source: request)

      ## Feasibility
      - none

      ## Tests
      - rule: a test (unit)
      """
    When Kogen checks the Intent demo
    Then the check accepts it

  Scenario: A Gherkin parse error is reported together with the intent.md problems
    Given the Intent demo has this acceptance.feature:
      """
      Feature: F
        Scenario: s
          Then a
        stray words
      """
    And the Intent demo has this intent.md:
      """
      # Make every lint problem visible at once in one refusal.

      Slug: demo
      Model: not applicable — no state
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      prose

      ## Decisions
      - Report all problems
      - Name the decision text (source: request)
      - Name the current length

      ## Feasibility
      - none

      ## Tests
      - rule: a test (unit)
      """
    When Kogen checks the Intent demo
    Then the check refuses it with exit 1 and prints:
      """
      intent/parse: the Intent cannot be read
        acceptance.feature line 4: unexpected text: stray words
        title: the title must be at most 50 characters, not 55
        title: the title must not end with a period
        decisions: - Report all problems must end with `(source: request)` or `(source: answer <n>)`
        decisions: - Name the current length must end with `(source: request)` or `(source: answer <n>)`
      """

  Scenario: A Gherkin parse error in an otherwise correct Intent is reported alone
    Given the Intent demo has this acceptance.feature:
      """
      Feature: F
        Scenario: s
          Then a
        stray words
      """
    And the Intent demo has this intent.md:
      """
      # Report every lint problem at once

      Slug: demo
      Model: not applicable — no state
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      prose

      ## Decisions
      - Report all problems (source: request)

      ## Feasibility
      - none

      ## Tests
      - rule: a test (unit)
      """
    When Kogen checks the Intent demo
    Then the check refuses it with exit 1 and prints:
      """
      intent/parse: the Intent cannot be read
        acceptance.feature line 4: unexpected text: stray words
      """
