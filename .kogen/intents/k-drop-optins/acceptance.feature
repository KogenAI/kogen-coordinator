Feature: Drop the opt-in Shape and review options

  shape_workers, shape_audit, shape_decision_check and review_material are no longer options.
  A project file that still names them loads with those keys ignored, and the configuration
  always holds today's defaults: workers off, audit off, decision check off, review material parts.

  Scenario: Non-default values of the removed options no longer change the configuration
    When k-drop-optins: I load this project configuration:
      """
      version: 1
      protect:
        - keep
      shape_workers:
        enabled: true
        read: {model: r1, effort: low}
        probe: {model: p1, effort: low}
        draft: {model: d1, effort: low}
      shape_audit:
        enabled: true
      shape_decision_check:
        enabled: true
      review_material:
        mode: on_demand
      models:
        build: {model: b1, effort: high}
      """
    Then k-drop-optins: the output is:
      """
      RESULT: {"BuildModel":"b1","Protect":["keep"],"ReviewMaterial":{"Mode":"parts"},"ShapeAudit":{"Enabled":false},"ShapeDecisionCheck":{"Enabled":false},"ShapeWorkers":{"Enabled":false,"Roles":{}}}
      """

  Scenario: Malformed values of the removed options no longer reject the file
    When k-drop-optins: I load this project configuration:
      """
      version: 1
      protect:
        - keep
      shape_workers: x
      shape_audit:
        enabled: 'true'
      shape_decision_check:
        extra: 1
      review_material:
        mode: sometimes
      models:
        build: {model: b1, effort: high}
      """
    Then k-drop-optins: the output is:
      """
      RESULT: {"BuildModel":"b1","Protect":["keep"],"ReviewMaterial":{"Mode":"parts"},"ShapeAudit":{"Enabled":false},"ShapeDecisionCheck":{"Enabled":false},"ShapeWorkers":{"Enabled":false,"Roles":{}}}
      """

  Scenario: An older file that states today's defaults loads as before
    When k-drop-optins: I load this project configuration:
      """
      version: 1
      protect:
        - keep
      shape_workers:
        enabled: false
      review_material:
        mode: parts
      models:
        build: {model: b1, effort: high}
      """
    Then k-drop-optins: the output is:
      """
      RESULT: {"BuildModel":"b1","Protect":["keep"],"ReviewMaterial":{"Mode":"parts"},"ShapeAudit":{"Enabled":false},"ShapeDecisionCheck":{"Enabled":false},"ShapeWorkers":{"Enabled":false,"Roles":{}}}
      """

  Scenario: Other unknown keys and the removed round setting are still rejected
    When k-drop-optins: I load this project configuration:
      """
      version: 1
      bogus: 1
      models:
        build: {model: b1, effort: high, max_rounds: 2}
      """
    Then k-drop-optins: the output is:
      """
      ERROR: environment/project_config_invalid
      line 2: unknown key bogus
      line 4: models.build.max_rounds was removed; the external executor's own round limit caps a role, and 6 caps a review role whose executor supplies none
      """
