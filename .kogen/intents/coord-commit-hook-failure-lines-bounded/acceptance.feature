Feature: The hook-related commit refusals are bounded and readable

  This feature covers the refusals a hook-failed or hook-rewritten commit gives through Commit and CommitPaths of kogen-coordinator's git package.

  Scenario: Commit failure keeps the last 20 hook lines
    Given coord-commit-hook-failure-lines-bounded: a repository with a verified candidate
    And coord-commit-hook-failure-lines-bounded: a "pre-commit" hook that prints 30 lines and exits 7
    When coord-commit-hook-failure-lines-bounded: Kogen commits the candidate
    Then coord-commit-hook-failure-lines-bounded: the commit is refused as class "environment" reason "commit_failed" exit 3 with the detail "git commit failed (status 1); the verified changes are left uncommitted"
    Then coord-commit-hook-failure-lines-bounded: HEAD is still the start commit
    Then coord-commit-hook-failure-lines-bounded: the refusal carries 20 hook lines, the first "line 11" and the last "line 30"

  Scenario: CommitPaths failure keeps the last 20 hook lines
    Given coord-commit-hook-failure-lines-bounded: a repository with a verified candidate
    And coord-commit-hook-failure-lines-bounded: a "pre-commit" hook that prints 30 lines and exits 1
    When coord-commit-hook-failure-lines-bounded: Kogen commits only README.md as the configuration
    Then coord-commit-hook-failure-lines-bounded: the commit is refused as class "environment" reason "commit_failed" exit 3 with the detail "git commit failed (status 1); the configuration is left uncommitted"
    Then coord-commit-hook-failure-lines-bounded: nothing is staged
    Then coord-commit-hook-failure-lines-bounded: the refusal carries 20 hook lines, the first "line 11" and the last "line 30"

  Scenario: More than 10 changed paths are counted
    Given coord-commit-hook-failure-lines-bounded: a repository with a verified candidate
    And coord-commit-hook-failure-lines-bounded: a "pre-commit" hook that writes and stages 12 files named hook-01.txt onwards
    When coord-commit-hook-failure-lines-bounded: Kogen commits the candidate
    Then coord-commit-hook-failure-lines-bounded: HEAD is still the start commit
    Then coord-commit-hook-failure-lines-bounded: the files "hook-01.txt" to "hook-12.txt" are still in the work tree
    Then coord-commit-hook-failure-lines-bounded: the commit is undone with the detail "a commit hook changed hook-01.txt, hook-02.txt, hook-03.txt, hook-04.txt, hook-05.txt, hook-06.txt, hook-07.txt, hook-08.txt, hook-09.txt, hook-10.txt and 2 more; the commit was undone and the changes are left in place"

  Scenario: Exactly 10 changed paths are all listed
    Given coord-commit-hook-failure-lines-bounded: a repository with a verified candidate
    And coord-commit-hook-failure-lines-bounded: a "pre-commit" hook that writes and stages 10 files named hook-01.txt onwards
    When coord-commit-hook-failure-lines-bounded: Kogen commits the candidate
    Then coord-commit-hook-failure-lines-bounded: the files "hook-01.txt" to "hook-10.txt" are still in the work tree
    Then coord-commit-hook-failure-lines-bounded: the commit is undone with the detail "a commit hook changed hook-01.txt, hook-02.txt, hook-03.txt, hook-04.txt, hook-05.txt, hook-06.txt, hook-07.txt, hook-08.txt, hook-09.txt, hook-10.txt; the commit was undone and the changes are left in place"
