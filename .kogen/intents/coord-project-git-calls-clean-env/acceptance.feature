Feature: Project-level git calls use the repository layer's git and cleaned environment

  Scenario Outline: The protected listing comes from the target repository whatever the process environment locates
    When coord-project-git-calls-clean-env: I list the protected files with "<environment>"
    Then coord-project-git-calls-clean-env: the protected files are
      """
      a.txt
      """
    Examples:
      | environment |
      | a clean environment |
      | GIT_INDEX_FILE set to an empty index |
      | GIT_INDEX_FILE set to a zero-byte file |
      | GIT_DIR set to the other repository |
      | GIT_DIR and GIT_INDEX_FILE set to the other repository |

  Scenario Outline: The user-name lookup reads the target repository's name
    When coord-project-git-calls-clean-env: I check the title "<title>" with "<environment>"
    Then coord-project-git-calls-clean-env: the title problems are
      """
      <problems>
      """
    Examples:
      | title | environment | problems |
      | Pat Owner adds retry | GIT_DIR set to the other repository | title: "Pat Owner adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead |
      | Other adds retry | GIT_DIR set to the other repository | [] |
      | Pat Owner adds retry | a clean environment | title: "Pat Owner adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead |
      | Other adds retry | a clean environment | [] |

  Scenario Outline: A git first on PATH runs the project-level calls and the repository layer alike
    When coord-project-git-calls-clean-env: with a recording git first on PATH and "<environment>", I list the protected files, open the repository and check the title "Pat Owner adds retry"
    Then coord-project-git-calls-clean-env: the recording git logged
      """
      ls-files -z --cached --others --exclude-standard|GIT_DIR=|GIT_INDEX_FILE=
      rev-parse --show-toplevel|GIT_DIR=|GIT_INDEX_FILE=
      config --get user.name|GIT_DIR=|GIT_INDEX_FILE=
      check-ignore --no-index -z --stdin|GIT_DIR=|GIT_INDEX_FILE=
      """
    And coord-project-git-calls-clean-env: the protected files are
      """
      a.txt
      """
    And coord-project-git-calls-clean-env: the title problems are
      """
      title: "Pat Owner adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead
      """
    Examples:
      | environment |
      | a clean environment |
      | GIT_DIR and GIT_INDEX_FILE set to the other repository |
