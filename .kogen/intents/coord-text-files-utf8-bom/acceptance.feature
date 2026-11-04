Feature: Ignore a leading UTF-8 byte order mark when reading Kogen's text files
  In the fixtures below, {BOM} stands for the byte order mark U+FEFF (bytes EF BB BF).
  Each fixture is read twice: once with {BOM} replaced by U+FEFF, and once with {BOM} removed.

  Scenario: A feature with a leading BOM parses to the same scenarios as without it
    When coord-text-files-utf8-bom: I parse this feature text
      """
      {BOM}Feature: x
        Scenario: one
          Given a start
          Then an end
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"","scenarios":[{"Name":"one","Line":2,"Tags":null,"Steps":[{"Keyword":"Given ","Text":"a start","Line":3},{"Keyword":"Then ","Text":"an end","Line":4}],"Outline":null}]}
      """

  Scenario: An unclosed doc string after a leading BOM reports the same line
    When coord-text-files-utf8-bom: I parse this feature text
      """
      {BOM}Feature: x
        Scenario: one
          Given a start
            ```
            never closed
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"line 4: the doc string is not closed","scenarios":[]}
      """

  Scenario: A later refusal of a feature with a leading BOM does not mention it
    When coord-text-files-utf8-bom: I parse this feature text
      """
      {BOM}Scenario: one
        Then an end
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: no message of the reading with the BOM mentions it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"line 1: expected Feature:, got: Scenario: one","scenarios":[]}
      """

  Scenario: Only one leading BOM is removed from a feature
    When coord-text-files-utf8-bom: I parse this feature text
      """
      {BOM}{BOM}Feature: x
        Scenario: one
          Then an end
      """
    Then coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"line 1: expected Feature:, got: ﻿Feature: x","scenarios":[]}
      """

  Scenario: A BOM in the middle of a feature line is read as today
    When coord-text-files-utf8-bom: I parse this feature text
      """
      Feature: x
        Scenario: on{BOM}e
          Then an end
      """
    Then coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"","scenarios":[{"Name":"on﻿e","Line":2,"Tags":null,"Steps":[{"Keyword":"Then ","Text":"an end","Line":3}],"Outline":null}]}
      """

  Scenario: An intent.md with a leading BOM reads its title and fields as without it and passes the Intent check
    When coord-text-files-utf8-bom: I read and check this Intent with a BOM-prefixed acceptance feature
      """
      {BOM}# Title
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
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"title":"Title","slug":" demo","model":"not applicable — pure parsing","acceptance":[".kogen/intents/demo/acceptance.feature"],"decisions":["- Keep it (source: request)"],"tests":["- Parsing: add coverage (unit)"],"feasibility":["- none"],"text_as_written":true,"error":"","lines":[]}
      """

  Scenario: A later Intent problem after a leading BOM is reported without mentioning it
    When coord-text-files-utf8-bom: I read and check this Intent with a BOM-prefixed acceptance feature
      """
      {BOM}# Title
      Slug: other
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      ## Tests
      - Parsing: add coverage (unit)
      ## Feasibility
      - none
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: no message of the reading with the BOM mentions it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"title":"Title","slug":" other","error":"intent/lint","lines":["slug: the Slug: line must be demo"]}
      """

  Scenario: A BOM in the middle of an Intent title is read as today
    When coord-text-files-utf8-bom: I read and check this Intent with a BOM-prefixed acceptance feature
      """
      # Ti{BOM}tle
      Slug: demo
      Model: not applicable — pure parsing
      Acceptance:
      - .kogen/intents/demo/acceptance.feature

      ## Tests
      - Parsing: add coverage (unit)
      ## Feasibility
      - none
      """
    Then coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"title":"Ti﻿tle","text_as_written":true}
      """

  Scenario: A project.yaml with a leading BOM loads the same configuration with no problem on line 1
    When coord-text-files-utf8-bom: I load this project.yaml
      """
      {BOM}version: 1
      commands:
        setup: []
        fix:
          - 'gofmt -w .'
        checks:
          - name: vet
            run: 'go vet ./...'
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"","lines":[],"fix":["gofmt -w ."]}
      """

  Scenario: A later project.yaml problem after a leading BOM keeps its line and does not mention the BOM
    When coord-text-files-utf8-bom: I load this project.yaml
      """
      {BOM}version: 1
      commands:
        setup: []
      surprise: true
      """
    Then coord-text-files-utf8-bom: the reading with the BOM equals the reading without it
    And coord-text-files-utf8-bom: no message of the reading with the BOM mentions it
    And coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"environment/project_config_invalid","detail":".kogen/project.yaml","lines":["line 4: unknown key surprise"],"config":null}
      """

  Scenario: A BOM in the middle of a project.yaml line is read as today
    When coord-text-files-utf8-bom: I load this project.yaml
      """
      version: 1
      commands:
        fix:
          - 'gofmt{BOM} -w .'
      """
    Then coord-text-files-utf8-bom: the reading with the BOM includes
      """
      {"error":"","lines":[],"fix":["gofmt﻿ -w ."]}
      """

  Scenario: The byte hash still covers a leading BOM
    When coord-text-files-utf8-bom: I hash this intent.md
      """
      {BOM}# Title
      Slug: demo
      """
    Then coord-text-files-utf8-bom: the reading with the BOM differs from the reading without it
