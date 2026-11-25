Feature: Decode table escapes in outline Examples

  Scenario: An escaped pipe stays in its Examples cell
    Given gherkin-unescape-example-table-cells: ParseGherkin reads the feature text
      """
      Feature: Labels
        Scenario Outline: label <left> and <right>
          Then use <right> with <left>
          Examples:
            | left   | right |
            | a\|b   | plain |
      """
    Then gherkin-unescape-example-table-cells: the generated names and step texts are
      """
      [["label a|b and plain", "use plain with a|b"]]
      """

  Scenario: An unescaped pipe separates ordinary cells
    Given gherkin-unescape-example-table-cells: ParseGherkin reads the feature text
      """
      Feature: Labels
        Scenario Outline: label <left> and <right>
          Then use <right> with <left>
          Examples:
            | left      | right |
            | first one | two   |
            | three     | four  |
      """
    Then gherkin-unescape-example-table-cells: the generated names and step texts are
      """
      [["label first one and two", "use two with first one"], ["label three and four", "use four with three"]]
      """

  Scenario: Examples decode newline and backslash escapes once
    Given gherkin-unescape-example-table-cells: ParseGherkin reads the feature text
      """
      Feature: Labels
        Scenario Outline: label <multi|line> and <literal>
          Then use <literal> with <multi|line>
          Examples:
            | multi\|line | literal  |
            | one\ntwo    | path\\n  |
      """
    Then gherkin-unescape-example-table-cells: the generated names and step texts are
      """
      [["label one\ntwo and path\\n", "use path\\n with one\ntwo"]]
      """

  Scenario: Escaped pipes in a step table do not change the scenario
    Given gherkin-unescape-example-table-cells: ParseGherkin reads the feature text
      """
      Feature: Labels
        Scenario: ordinary
          Given rows
            | a | b\|c |
            | 1 | 2    |
          Then continue
      """
    Then gherkin-unescape-example-table-cells: the generated names and step texts are
      """
      [["ordinary", "rows", "continue"]]
      """
