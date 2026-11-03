Feature: Byte-exact ignored Acceptance paths
  Scenario Outline: Check existing acceptance files against real ignore rules
    Given a quoted-path fixture in a Git repository with acceptance path <path>
    When the quoted-path Intent is checked
    Then its quoted-path result is <result>
    Examples:
      | path                                  | result  |
      | features/steps/café.skip.js            | ignored |
      | features/steps/with space.skip.js      | ignored |
      | features/steps/with"quote.skip.js      | ignored |
      | features/steps/plain.skip.js           | ignored |
      | features/steps/café.js                 | clean   |

  Scenario: A nonrepository is not a clean ignore check
    Given a quoted-path fixture outside a Git repository with acceptance path features/steps/café.js
    When the quoted-path Intent is checked
    Then its quoted-path result is unavailable
