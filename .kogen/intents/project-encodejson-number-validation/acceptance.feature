Feature: EncodeJSON rejects malformed json.Number values

  This feature drives project.EncodeJSON through a generated Go driver. For each json.Number text
  listed, the driver encodes it at top level, as the value of a map entry n, or as the only element
  of a slice, and observes the outcome: the encoded text, or error when EncodeJSON returned an error
  and no result.

  Scenario: Valid integer, decimal and exponent numbers keep their text at top level
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "top level"
      """
      [
        "0",
        "-0",
        "12345678901234567890",
        "3.14",
        "1.50",
        "1E+10",
        "2.5e-3",
        "1e400"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "0": "0",
        "-0": "-0",
        "12345678901234567890": "12345678901234567890",
        "3.14": "3.14",
        "1.50": "1.50",
        "1E+10": "1E+10",
        "2.5e-3": "2.5e-3",
        "1e400": "1e400"
      }
      """

  Scenario: Valid numbers keep their text as a map value
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "a map"
      """
      [
        "0",
        "-0",
        "12345678901234567890",
        "3.14",
        "1.50",
        "1E+10",
        "2.5e-3",
        "1e400"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "0": "{\"n\":0}",
        "-0": "{\"n\":-0}",
        "12345678901234567890": "{\"n\":12345678901234567890}",
        "3.14": "{\"n\":3.14}",
        "1.50": "{\"n\":1.50}",
        "1E+10": "{\"n\":1E+10}",
        "2.5e-3": "{\"n\":2.5e-3}",
        "1e400": "{\"n\":1e400}"
      }
      """

  Scenario: Valid numbers keep their text as a slice element
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "a slice"
      """
      [
        "0",
        "-0",
        "12345678901234567890",
        "3.14",
        "1.50",
        "1E+10",
        "2.5e-3",
        "1e400"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "0": "[0]",
        "-0": "[-0]",
        "12345678901234567890": "[12345678901234567890]",
        "3.14": "[3.14]",
        "1.50": "[1.50]",
        "1E+10": "[1E+10]",
        "2.5e-3": "[2.5e-3]",
        "1e400": "[1e400]"
      }
      """

  Scenario: Malformed numbers at top level are rejected with an error and no result
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "top level"
      """
      [
        "",
        "abc",
        "01",
        "1.",
        ".5",
        "+1",
        "1e",
        "0x10",
        "NaN",
        "1,2"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "": "error",
        "abc": "error",
        "01": "error",
        "1.": "error",
        ".5": "error",
        "+1": "error",
        "1e": "error",
        "0x10": "error",
        "NaN": "error",
        "1,2": "error"
      }
      """

  Scenario: Malformed numbers as a map value are rejected with an error and no result
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "a map"
      """
      [
        "",
        "abc",
        "01",
        "1.",
        ".5",
        "+1",
        "1e",
        "0x10",
        "NaN",
        "1,2"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "": "error",
        "abc": "error",
        "01": "error",
        "1.": "error",
        ".5": "error",
        "+1": "error",
        "1e": "error",
        "0x10": "error",
        "NaN": "error",
        "1,2": "error"
      }
      """

  Scenario: Malformed numbers as a slice element are rejected with an error and no result
    When project-encodejson-number-validation: EncodeJSON encodes these json.Number values in "a slice"
      """
      [
        "",
        "abc",
        "01",
        "1.",
        ".5",
        "+1",
        "1e",
        "0x10",
        "NaN",
        "1,2"
      ]
      """
    Then project-encodejson-number-validation: the outcomes are
      """
      {
        "": "error",
        "abc": "error",
        "01": "error",
        "1.": "error",
        ".5": "error",
        "+1": "error",
        "1e": "error",
        "0x10": "error",
        "NaN": "error",
        "1,2": "error"
      }
      """
