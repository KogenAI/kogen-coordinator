Feature: Repository Git commands stop at a deadline instead of hanging
  Every Git command the git package runs for a repository has a bounded wall time:
  git.CommandTimeout, or git.CommitTimeout for commits and commit hooks. A command past its
  bound is stopped together with its children, and the caller receives a *git.TimeoutError
  whose text names the command's first arguments and the bound. These scenarios shorten the
  bounds through the test seam git.OverrideTimeouts. A fake git first on PATH hangs, fails or
  prints, and a hanging fake or hook records its processes so that none may be left.

  Scenario: The bounds are documented named constants
    When coord-git-command-deadline: I read the documented bounds
    Then coord-git-command-deadline: the bounds are "10m0s" for commands and "1h0m0s" for commits

  Scenario: A git that sleeps far past the bound is stopped and named in the error
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "sleeps far past the bound"
    When coord-git-command-deadline: I run git "status --porcelain"
    Then coord-git-command-deadline: the error is "git status --porcelain timed out after 1.5s"
    And coord-git-command-deadline: the error is a timeout of git "status --porcelain" after "1.5s"
    And coord-git-command-deadline: the result is
      """
      {"status": -1}
      """
    And coord-git-command-deadline: the call returned after at least the bound and within the bound plus 2 s
    And coord-git-command-deadline: no process of the hanging fake or hook remains
    And coord-git-command-deadline: the error contains no environment value passed to the command

  Scenario: A command that must succeed and times out is named by its first four arguments
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "sleeps far past the bound"
    When coord-git-command-deadline: I run git "log -1 --format=%s --no-color HEAD" as a command that must succeed
    Then coord-git-command-deadline: the error is "git log -1 --format=%s --no-color timed out after 1.5s"
    And coord-git-command-deadline: the error is a timeout of git "log -1 --format=%s --no-color" after "1.5s"
    And coord-git-command-deadline: the call returned after at least the bound and within the bound plus 2 s
    And coord-git-command-deadline: no process of the hanging fake or hook remains
    And coord-git-command-deadline: the error contains no environment value passed to the command

  Scenario: A blob stream read that times out returns the timeout error and closes the stream
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "hangs only in the cat-file blob stream"
    When coord-git-command-deadline: I materialize the HEAD tree
    Then coord-git-command-deadline: the error is "git cat-file --batch timed out after 1.5s"
    And coord-git-command-deadline: the error is a timeout of git "cat-file --batch" after "1.5s"
    And coord-git-command-deadline: the call returned after at least the bound and within the bound plus 2 s
    And coord-git-command-deadline: no process of the hanging fake or hook remains
    And coord-git-command-deadline: the error contains no environment value passed to the command

  Scenario: A git that exits 1 with stderr text returns its status and output exactly as today
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "exits 1 with stderr text"
    When coord-git-command-deadline: I run git "status --porcelain"
    Then coord-git-command-deadline: the error is ""
    And coord-git-command-deadline: the error is not a timeout
    And coord-git-command-deadline: the result is
      """
      {"status": 1, "stdout": "partial out\n", "stderr": "fatal: fake failure\n"}
      """
    And coord-git-command-deadline: the call returned before the command bound

  Scenario: A command that must succeed and exits 1 still reports its command error
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "exits 1 with stderr text"
    When coord-git-command-deadline: I run git "status --porcelain" as a command that must succeed
    Then coord-git-command-deadline: the error is "git status --porcelain failed (status 1): fatal: fake failure"
    And coord-git-command-deadline: the error is not a timeout
    And coord-git-command-deadline: the call returned before the command bound

  Scenario: A git that prints 1 MiB and exits 0 inside the bound returns the complete output
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository whose git first on PATH "prints 1 MiB and exits 0 inside the bound"
    When coord-git-command-deadline: I run git "status --porcelain"
    Then coord-git-command-deadline: the error is ""
    And coord-git-command-deadline: the result is
      """
      {"status": 0, "stdout_bytes": 1048576, "stdout_sha256": "9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360", "stderr": ""}
      """
    And coord-git-command-deadline: the call returned before the command bound

  Scenario: A commit whose hook runs longer than the command bound uses the larger commit bound
    Given coord-git-command-deadline: the command bound is 1500 ms and the commit bound is 8000 ms
    And coord-git-command-deadline: a repository with an edited README whose pre-commit hook "sleeps 2.5 s"
    When coord-git-command-deadline: I commit the edited README
    Then coord-git-command-deadline: the error is ""
    And coord-git-command-deadline: HEAD is a new commit on top of the start

  Scenario: A commit whose hook never returns stops at the commit bound
    Given coord-git-command-deadline: the command bound is 8000 ms and the commit bound is 1500 ms
    And coord-git-command-deadline: a repository with an edited README whose pre-commit hook "never returns"
    When coord-git-command-deadline: I commit the edited README
    Then coord-git-command-deadline: the error is "git commit -q -F <message> timed out after 1.5s"
    And coord-git-command-deadline: the error is a timeout of git "commit -q -F <message>" after "1.5s"
    And coord-git-command-deadline: the call returned after at least the bound and within the bound plus 2 s
    And coord-git-command-deadline: no process of the hanging fake or hook remains
    And coord-git-command-deadline: HEAD is unchanged
