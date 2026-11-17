Feature: The Git runner guard judges the command Git would run

  This feature covers Repo.Run and Repo.OK of kogen-coordinator's git package: spellings of forbidden commands, aliases, built-ins and the added forbidden commands.

  Scenario: A forbidden command after a value-taking option is refused
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    When coord-git-guard-judges-aliased-commands: the runner runs each of these argument lists
      | --config-env\|alias.p=NAMEDVAR\|push | git command not allowed: git push |
      | --super-prefix\|x/\|reset\|--hard | git command not allowed: git reset |
    Then coord-git-guard-judges-aliased-commands: every call is refused with the message in its row
    Then coord-git-guard-judges-aliased-commands: the repository is as it was before the first call

  Scenario: An alias of a forbidden command is refused from the call and from the configuration
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    And coord-git-guard-judges-aliased-commands: README.md has an uncommitted edit and scratch.txt is an untracked file
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "-c|alias.p=reset --hard|p"
    Then coord-git-guard-judges-aliased-commands: the call is refused with the message "git command not allowed: git reset"
    Then coord-git-guard-judges-aliased-commands: the repository is as it was before the first call
    Given coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "p" as "push origin"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "p"
    Then coord-git-guard-judges-aliased-commands: the call is refused with the message "git command not allowed: git push"
    Then coord-git-guard-judges-aliased-commands: the repository is as it was before the first call

  Scenario: A shell alias is refused
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "s" as "!echo ran > shell-ran.txt"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "s"
    Then coord-git-guard-judges-aliased-commands: the call is refused with the message "git command not allowed: git s"
    Then coord-git-guard-judges-aliased-commands: the file "shell-ran.txt" does not exist in the work tree

  Scenario: An alias that shadows a built-in is ignored like Git ignores it
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "status" as "push"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "status|--porcelain" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is ""
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "log|-1|--format=%s" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is "baseline"

  Scenario: Alias chains are followed up to 5 levels
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "c1" as "c2"
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "c2" as "c3"
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "c3" as "c4"
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "c4" as "c5"
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "c5" as "log -1 --format=%s"
    And coord-git-guard-judges-aliased-commands: the repository configuration defines the alias "d1" as "c1"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "c1" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is "baseline"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "d1"
    Then coord-git-guard-judges-aliased-commands: the call is refused with the message "git command not allowed: git d1"

  Scenario: Commands that move HEAD or discard work are refused
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    And coord-git-guard-judges-aliased-commands: README.md has an uncommitted edit and scratch.txt is an untracked file
    When coord-git-guard-judges-aliased-commands: the runner runs each of these argument lists
      | symbolic-ref\|HEAD\|refs/heads/x | git command not allowed: git symbolic-ref |
      | restore\|--\|README.md | git command not allowed: git restore |
      | clean\|-fd | git command not allowed: git clean |
      | worktree\|add\|../w | git command not allowed: git worktree |
      | remote\|add\|o\|u | git command not allowed: git remote |
    Then coord-git-guard-judges-aliased-commands: every call is refused with the message in its row
    Then coord-git-guard-judges-aliased-commands: the repository is as it was before the first call

  Scenario: Ordinary calls keep working
    Given coord-git-guard-judges-aliased-commands: a repository with one commit
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "-c|core.quotepath=off|log|-1|--format=%s" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is "baseline"
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "-c|core.quotepath=off|status|--porcelain" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is ""
    When coord-git-guard-judges-aliased-commands: the runner runs git with the arguments "log|-1|--format=%s" as a command that must succeed
    Then coord-git-guard-judges-aliased-commands: the call succeeded and its output is "baseline"
