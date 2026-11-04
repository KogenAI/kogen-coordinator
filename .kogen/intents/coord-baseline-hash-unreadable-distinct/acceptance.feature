Feature: Distinguish baseline read failures
  Scenario Outline: Hash real filesystem inputs and report unreadable paths
    When coord-baseline-hash-unreadable-distinct: I hash fixture "<fixture>"
    Then coord-baseline-hash-unreadable-distinct: contributions use missing "missing" and unreadable "unreadable"
    Examples:
      | fixture |
      | readable |
      | absent |
      | directory |
      | mixed |
      | permission |
