Feature: Read wrapped Intent bullets without rewriting text
  Scenario: Join indented and unindented continuations in all four lists
    When coord-intent-wrapped-bullets: I read and lint this Intent
      """
      # Handle wrapped bullets
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature
      
      ## Decisions
      - Retry twice before failing the call
        with a short pause (source: request)
      ## Tests
      - Retry: add coverage
        (unit)
      ## Feasibility
      - none: local
      parsing only
      
      not part of the bullet
      """
    Then coord-intent-wrapped-bullets: the parsed result is
      """
      {"acceptance":[".kogen/intents/demo/acceptance.feature"],"decisions":["- Retry twice before failing the call with a short pause (source: request)"],"tests":["- Retry: add coverage (unit)"],"feasibility":["- none: local parsing only"],"unchanged":true,"lines":[]}
      """

  Scenario: A missing layer still fails after joining
    When coord-intent-wrapped-bullets: I read and lint this Intent
      """
      # Handle wrapped bullets
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      ## Tests
      - Retry: add coverage
        without a layer
      ## Feasibility
      - none
      """
    Then coord-intent-wrapped-bullets: the parsed result is
      """
      {"tests":["- Retry: add coverage without a layer"],"unchanged":true,"lines":["tests: - Retry: add coverage without a layer must be `- <rule>: <test to add or update> (<layer>)` or `- none: <reason>`"]}
      """

  Scenario: Continuations stop at blanks, new bullets and headings
    When coord-intent-wrapped-bullets: I read and lint this Intent
      """
      # Handle wrapped bullets
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature
      extra
      - second
        path

      ignored
      - not-in-acceptance
      ## Decisions
      - First
      paragraph (source: request)

      ignored paragraph
      - Second (source: request)
      ## Tests
      - none: local
      ## Feasibility
      - none
      ## Other
      not in feasibility
      """
    Then coord-intent-wrapped-bullets: the parsed result is
      """
      {"acceptance":[".kogen/intents/demo/acceptance.feature extra","second path"],"decisions":["- First paragraph (source: request)","- Second (source: request)"],"tests":["- none: local"],"feasibility":["- none"],"unchanged":true}
      """

  Scenario: Preserve clean single-line lists
    When coord-intent-wrapped-bullets: I read and lint this Intent
      """
      # Handle wrapped bullets
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      ## Decisions
      - Keep it (source: request)
      ## Tests
      - Parsing: add coverage (unit)
      ## Feasibility
      - none
      """
    Then coord-intent-wrapped-bullets: the parsed result is
      """
      {"acceptance":[".kogen/intents/demo/acceptance.feature"],"decisions":["- Keep it (source: request)"],"tests":["- Parsing: add coverage (unit)"],"feasibility":["- none"],"unchanged":true,"lines":[]}
      """

  Scenario Outline: Diagnose unsupported markers rather than empty lists
    When coord-intent-wrapped-bullets: I read and lint this Intent
      """
      # Handle wrapped bullets
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      <acceptance>

      ## Decisions
      <decisions>
      ## Tests
      <tests>
      ## Feasibility
      <feasibility>
      """
    Then coord-intent-wrapped-bullets: lint names the required marker for "<section>"
    Examples:
      | section     | acceptance                                    | decisions                     | tests                | feasibility |
      | acceptance  | * .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | - none: fixture      | - none      |
      | acceptance  | + .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | - none: fixture      | - none      |
      | decisions   | - .kogen/intents/demo/acceptance.feature        | * item                        | - none: fixture      | - none      |
      | decisions   | - .kogen/intents/demo/acceptance.feature        | + item                        | - none: fixture      | - none      |
      | tests       | - .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | * item               | - none      |
      | tests       | - .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | + item               | - none      |
      | feasibility | - .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | - none: fixture      | * item      |
      | feasibility | - .kogen/intents/demo/acceptance.feature        | - Keep it (source: request)    | - none: fixture      | + item      |
