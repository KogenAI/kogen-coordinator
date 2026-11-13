Feature: Remove obsolete configuration representations
  This feature checks that removed options and the former-baseline API are gone and that code and tests still compile.

  Scenario: Removed names no longer exist
    Given simplify-coordinator-obsolete-config: the repository checkout
    When simplify-coordinator-obsolete-config: the tracked Go sources and README are searched for the removed names
    Then simplify-coordinator-obsolete-config: no removed name is found

  Scenario: Code and tests compile after the removal
    Given simplify-coordinator-obsolete-config: the repository checkout
    When simplify-coordinator-obsolete-config: go vet runs for the repository
    Then simplify-coordinator-obsolete-config: go vet passes
