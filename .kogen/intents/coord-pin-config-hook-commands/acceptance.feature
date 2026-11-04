Feature: The Git execution pin covers hooks defined in Git configuration

  Scenario: Adding a configuration-defined hook command is reported
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.lint.command ./x"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"

  Scenario: A later different value of the hook command is reported again
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    And coord-pin-config-hook-commands: the repository has local configuration "hook.lint.command" set to "./x"
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.lint.command ./lint-secret-value"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"
    And coord-pin-config-hook-commands: no string retained by the pins contains "lint-secret-value"

  Scenario: Removing the hook command is reported
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    And coord-pin-config-hook-commands: the repository has local configuration "hook.lint.command" set to "./x"
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config --unset hook.lint.command"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"

  Scenario: A hook event added alone changes nothing
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.lint.event pre-commit"
    Then coord-pin-config-hook-commands: the comparison reports no change

  Scenario: A hook enabled flag changed alone changes nothing
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    And coord-pin-config-hook-commands: the repository has local configuration "hook.lint.command" set to "./x"
    And coord-pin-config-hook-commands: the repository has local configuration "hook.lint.event" set to "pre-commit"
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.lint.enabled false"
    Then coord-pin-config-hook-commands: the comparison reports no change

  Scenario: A hook name containing dots is covered
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.a.b.command ./x"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.a.b.command"

  Scenario: A hook command in the global configuration is reported
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config --global hook.lint.command ./global-secret-value"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"
    And coord-pin-config-hook-commands: no string retained by the pins contains "global-secret-value"

  Scenario: A command-line hook command stays ignored
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after adding command-line configuration "hook.lint.command" set to "./x"
    Then coord-pin-config-hook-commands: the comparison reports no change

  Scenario: Two repositories differing only in hook command values have different pins that keep no value
    Given coord-pin-config-hook-commands: two repositories sharing one hooks directory whose local "hook.lint.command" values are "./lint-secret-one" and "./lint-secret-two"
    When coord-pin-config-hook-commands: the pins of the two repositories are compared
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"
    And coord-pin-config-hook-commands: no string retained by the pins contains "lint-secret-one"
    And coord-pin-config-hook-commands: no string retained by the pins contains "lint-secret-two"

  Scenario: Two repositories with the same hook command value have equal pins
    Given coord-pin-config-hook-commands: two repositories sharing one hooks directory whose local "hook.lint.command" values are "./same" and "./same"
    When coord-pin-config-hook-commands: the pins of the two repositories are compared
    Then coord-pin-config-hook-commands: the comparison reports no change

  Scenario: Taking and comparing the pin runs no configuration-defined hook
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    And coord-pin-config-hook-commands: a hook script that records when it runs
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config hook.lint.command HOOK_SCRIPT && git config hook.lint.event pre-commit"
    Then coord-pin-config-hook-commands: the comparison reports exactly "hook.lint.command"
    And coord-pin-config-hook-commands: the hook script did not run

  Scenario Outline: Existing selectors keep their results
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "<command>"
    Then coord-pin-config-hook-commands: the comparison reports exactly "<changes>"
    Examples:
      | command | changes |
      | git config alias.audit !true | alias.audit |
      | git config core.sshCommand ssh | core.sshCommand |

  Scenario: Unrelated configuration stays unpinned
    Given coord-pin-config-hook-commands: a repository with no hook-section configuration
    When coord-pin-config-hook-commands: the pin is taken and compared after "git config user.name Someone"
    Then coord-pin-config-hook-commands: the comparison reports no change

  Scenario: The existing pin tests pass unchanged
    Then coord-pin-config-hook-commands: the existing pin tests pass
