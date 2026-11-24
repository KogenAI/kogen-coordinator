Feature: Preserve hashes after escaped double quotes
  This feature corrects comment stripping without changing scalar escape rules or the supported YAML subset.

  Scenario: Preserve the entire scalar after an escaped quote
    When yaml-comment-escaped-quotes: ParseConfig reads
      """
      version: 1
      commands:
        setup:
          - "before \" # inside and all following text"
      """
    Then yaml-comment-escaped-quotes: the parsed setup scalars are
      """
      ["before \" # inside and all following text"]
      """

  Scenario: Remove a comment after the actual closing quote
    When yaml-comment-escaped-quotes: ParseConfig reads
      """
      version: 1
      commands:
        setup:
          - "before \" # inside and all following text" # outside comment
      """
    Then yaml-comment-escaped-quotes: the parsed setup scalars are
      """
      ["before \" # inside and all following text"]
      """

  Scenario: Remove a comment after a closing quote preceded by an escaped backslash
    When yaml-comment-escaped-quotes: ParseConfig reads
      """
      version: 1
      commands:
        setup:
          - "ends with a backslash \\" # outside comment
      """
    Then yaml-comment-escaped-quotes: the parsed setup scalars are
      """
      ["ends with a backslash \\"]
      """

  Scenario: Preserve existing single-quoted hash handling
    When yaml-comment-escaped-quotes: ParseConfig reads
      """
      version: 1
      commands:
        setup:
          - 'it''s # not a comment' # outside comment
      """
    Then yaml-comment-escaped-quotes: the parsed setup scalars are
      """
      ["it's # not a comment"]
      """

  Scenario: Preserve existing plain scalar comment handling
    When yaml-comment-escaped-quotes: ParseConfig reads
      """
      version: 1
      commands:
        setup:
          - some text, with [brackets] # outside comment
          - text#inside
      """
    Then yaml-comment-escaped-quotes: the parsed setup scalars are
      """
      ["some text, with [brackets]", "text#inside"]
      """
