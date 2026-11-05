Feature: The commit message file is created private and never follows a link

  Scenario: A fresh message path is a private file while git commit runs and is gone afterwards
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: nothing exists at the message path
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: git commit found a regular message file with mode "600"
    And coord-commit-message-file-private: git commit read the message:
      """
      Add the app

      Kogen-Intent: add-app
      """
    And coord-commit-message-file-private: the commit lands on top of the start commit with the message:
      """
      Add the app

      Kogen-Intent: add-app
      """
    And coord-commit-message-file-private: nothing exists at the message path after Commit returned

  Scenario: A message path that is a symbolic link to a victim file is refused before any git command
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the message path is a symbolic link to a victim file containing:
      """
      victim bytes that must not change
      """
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: Commit is refused with the plain error "git: refusing the commit message file <message file>: it is a symbolic link"
    And coord-commit-message-file-private: the victim file still contains:
      """
      victim bytes that must not change
      """
    And coord-commit-message-file-private: Commit ran no git command
    And coord-commit-message-file-private: the message path is still the symbolic link to the victim file
    And coord-commit-message-file-private: HEAD is still the start commit

  Scenario: A message path that is a symbolic link to a missing file is refused and creates nothing
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the message path is a symbolic link to a missing file
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: Commit is refused with the plain error "git: refusing the commit message file <message file>: it is a symbolic link"
    And coord-commit-message-file-private: the message path is still the symbolic link and its missing target was not created
    And coord-commit-message-file-private: Commit ran no git command
    And coord-commit-message-file-private: HEAD is still the start commit

  Scenario: A message path that is a directory is refused before any git command
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the message path is an empty directory
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: Commit is refused with the plain error "git: refusing the commit message file <message file>: it is not a regular file"
    And coord-commit-message-file-private: the message path is still an empty directory
    And coord-commit-message-file-private: Commit ran no git command
    And coord-commit-message-file-private: HEAD is still the start commit

  Scenario: A regular leftover message file is replaced, so the commit uses only the new text
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the message path is a leftover regular file with mode 0644 containing:
      """
      Old title from an interrupted commit

      A body line that is longer than the new message.

      Kogen-Intent: old-slug
      """
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: git commit found a regular message file with mode "600"
    And coord-commit-message-file-private: git commit read the message:
      """
      Add the app

      Kogen-Intent: add-app
      """
    And coord-commit-message-file-private: the commit lands on top of the start commit with the message:
      """
      Add the app

      Kogen-Intent: add-app
      """
    And coord-commit-message-file-private: nothing exists at the message path after Commit returned

  Scenario: A failing git commit returns the existing commit_failed error and removes the message file
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the fake git commit prints "fake git commit refuses" and exits 1
    When coord-commit-message-file-private: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-message-file-private: Commit fails with the class environment, the reason commit_failed, exit 3, the detail "git commit failed (status 1); the verified changes are left uncommitted" and the lines:
      """
      fake git commit refuses
      """
    And coord-commit-message-file-private: git commit found a regular message file with mode "600"
    And coord-commit-message-file-private: nothing exists at the message path after Commit returned
    And coord-commit-message-file-private: HEAD is still the start commit

  Scenario: An interrupt during git commit removes the message file
    Given coord-commit-message-file-private: a repository with a verified candidate and a fake git first on PATH
    And coord-commit-message-file-private: the fake git commit holds until it is released
    When coord-commit-message-file-private: Kogen commits the candidate and the caller interrupts with SIGINT while git commit runs
    Then coord-commit-message-file-private: Commit returns the interrupt "SIGINT"
    And coord-commit-message-file-private: nothing exists at the message path after Commit returned
    And coord-commit-message-file-private: HEAD is still the start commit
