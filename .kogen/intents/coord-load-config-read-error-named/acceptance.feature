Feature: Unreadable project configuration is named
  This feature checks project.LoadConfig on roots whose .kogen/project.yaml is absent, a directory, unreadable, a dangling symlink or valid.

  Scenario: Absent file is not initialized
    Given coord-load-config-read-error-named: a root with project.yaml "absent"
    When coord-load-config-read-error-named: LoadConfig runs
    Then coord-load-config-read-error-named: the error is "environment/not_initialized" with exit code 3
    And coord-load-config-read-error-named: the detail ends with " has no .kogen/project.yaml; run kogen init"

  Scenario: Directory is named
    Given coord-load-config-read-error-named: a root with project.yaml "directory"
    When coord-load-config-read-error-named: LoadConfig runs
    Then coord-load-config-read-error-named: the error is "environment/project_config_unreadable" with exit code 3
    And coord-load-config-read-error-named: the detail names the file and contains "is a directory"
    And coord-load-config-read-error-named: the detail does not contain "kogen init"

  Scenario: Mode 000 is named
    Given coord-load-config-read-error-named: a root with project.yaml "unreadable"
    When coord-load-config-read-error-named: LoadConfig runs
    Then coord-load-config-read-error-named: the error is "environment/project_config_unreadable" with exit code 3
    And coord-load-config-read-error-named: the detail names the file and contains "permission denied"
    And coord-load-config-read-error-named: the detail does not contain "kogen init"

  Scenario: Dangling symlink is named
    Given coord-load-config-read-error-named: a root with project.yaml "dangling"
    When coord-load-config-read-error-named: LoadConfig runs
    Then coord-load-config-read-error-named: the error is "environment/project_config_unreadable" with exit code 3
    And coord-load-config-read-error-named: the detail names the file and contains "no such file or directory"
    And coord-load-config-read-error-named: the detail does not contain "kogen init"

  Scenario: Valid configuration loads
    Given coord-load-config-read-error-named: a root with project.yaml "valid"
    When coord-load-config-read-error-named: LoadConfig runs
    Then coord-load-config-read-error-named: the load succeeds with check "test" running "go test ./..."
