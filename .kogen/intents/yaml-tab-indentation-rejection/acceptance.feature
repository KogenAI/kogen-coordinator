Feature: Reject tabs used as YAML indentation
  This feature preserves space indentation and scalar contents while rejecting tabs before nodes.
  JSON string inputs represent literal tab and newline bytes without relying on editor whitespace.

  Scenario: Reject a tab before a YAML node
    When yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML
      """
      "version: 1\n\tcommands: {}\n"
      """
    Then yaml-tab-indentation-rejection: parsing reports an indentation problem on line 2

  Scenario: Reject mixed space and tab indentation
    When yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML
      """
      "version: 1\n  \tcommands: {}\n"
      """
    Then yaml-tab-indentation-rejection: parsing reports an indentation problem on line 2

  Scenario: Reject tab indentation before a sequence item
    When yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML
      """
      "version: 1\ncommands:\n  setup:\n  \t- echo ok\n"
      """
    Then yaml-tab-indentation-rejection: parsing reports an indentation problem on line 4

  Scenario: Preserve a space-indented block sequence
    When yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML
      """
      "version: 1\ncommands:\n  setup:\n    - echo first\n    - echo second\n"
      """
    Then yaml-tab-indentation-rejection: parsing succeeds with these exact setup scalars
      """
      ["echo first", "echo second"]
      """

  Scenario: Preserve a tab inside a plain scalar
    When yaml-tab-indentation-rejection: ParseConfig reads this JSON-encoded YAML
      """
      "version: 1\ncommands:\n  setup:\n    - echo\tkeep this tab\n"
      """
    Then yaml-tab-indentation-rejection: parsing succeeds with these exact setup scalars
      """
      ["echo\tkeep this tab"]
      """
