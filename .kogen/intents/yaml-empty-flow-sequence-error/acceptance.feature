Feature: Return YAML problems for unfinished flow collections

  Scenario: An opener alone reports a sequence parse problem
    Given yaml-empty-flow-sequence-error: the "yaml" parser receives this document
      """
      x: [
      """
    Then yaml-empty-flow-sequence-error: it returns exactly this result without a panic
      """
      {"returned": false, "lines": ["line 1: unclosed ["]}
      """

  Scenario: A map opener reports an unclosed mapping
    Given yaml-empty-flow-sequence-error: the "yaml" parser receives this document
      """
      a: {
      """
    Then yaml-empty-flow-sequence-error: it returns exactly this result without a panic
      """
      {"returned": false, "lines": ["line 1: unclosed {"]}
      """

  Scenario: A nonempty unclosed sequence keeps its diagnostic
    Given yaml-empty-flow-sequence-error: the "yaml" parser receives this document
      """
      a: [1, 2
      """
    Then yaml-empty-flow-sequence-error: it returns exactly this result without a panic
      """
      {"returned": false, "lines": ["line 1: unclosed ["]}
      """

  Scenario: ParseConfig classifies an unfinished flow sequence
    Given yaml-empty-flow-sequence-error: the "config" parser receives this document
      """
      version: 1
      commands: {setup: [
      """
    Then yaml-empty-flow-sequence-error: it returns exactly this result without a panic
      """
      {"returned": false, "class": "environment", "reason": "project_config_invalid", "detail": ".kogen/project.yaml", "exit": 3, "lines": ["line 2: unclosed ["]}
      """

  Scenario: ParseConfig still accepts a closed empty flow sequence
    Given yaml-empty-flow-sequence-error: the "config" parser receives this document
      """
      version: 1
      commands: {setup: []}
      """
    Then yaml-empty-flow-sequence-error: it returns exactly this result without a panic
      """
      {"returned": true}
      """
