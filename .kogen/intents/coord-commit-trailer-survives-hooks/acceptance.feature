Feature: A landed commit that lost its Kogen-Intent trailer is undone and named

  Scenario: Without hooks the commit lands with the exact message bytes
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit lands on top of the start commit with the reviewed tree
    And coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app

      Kogen-Intent: add-app
      """

  Scenario: A hook that appends a Signed-off-by trailer lets the commit land
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "commit-msg" hook that runs:
      """
      printf 'Signed-off-by: Fixture <fixture@example.invalid>\n' >> "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit lands on top of the start commit with the reviewed tree
    And coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app

      Kogen-Intent: add-app
      Signed-off-by: Fixture <fixture@example.invalid>
      """

  Scenario: A hook that rewrites only the title lets the commit land
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "commit-msg" hook that runs:
      """
      { printf 'Reworded title\n'; tail -n +2 "$1"; } > "$1.new" && mv "$1.new" "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit lands on top of the start commit with the reviewed tree
    And coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Reworded title

      Kogen-Intent: add-app
      """

  Scenario Outline: A <hook> hook that removes the trailer has the commit undone
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "<hook>" hook that runs:
      """
      printf 'Add the app\n' > "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app
      """
    And coord-commit-trailer-survives-hooks: the commit is undone with the detail "a commit hook changed the commit message: it no longer carries the Intent trailer Kogen-Intent: add-app (no Kogen-Intent trailer found); the commit was undone and the changes are left in place"
    And coord-commit-trailer-survives-hooks: the verified changes are left in place

    Examples:
      | hook               |
      | commit-msg         |
      | prepare-commit-msg |

  Scenario: A hook that replaces the slug has the commit undone with the expected and found values
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "commit-msg" hook that runs:
      """
      printf 'Add the app\n\nKogen-Intent: other-slug\n' > "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app

      Kogen-Intent: other-slug
      """
    And coord-commit-trailer-survives-hooks: the commit is undone with the detail "a commit hook changed the commit message: it no longer carries the Intent trailer Kogen-Intent: add-app (found Kogen-Intent: other-slug); the commit was undone and the changes are left in place"
    And coord-commit-trailer-survives-hooks: the verified changes are left in place

  Scenario Outline: A hook that appends a second Kogen-Intent line has the commit undone as a duplicate
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "commit-msg" hook that runs:
      """
      printf 'Kogen-Intent: <second>\n' >> "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app

      Kogen-Intent: add-app
      Kogen-Intent: <second>
      """
    And coord-commit-trailer-survives-hooks: the commit is undone with the detail "a commit hook changed the commit message: it no longer carries the Intent trailer Kogen-Intent: add-app (duplicate Kogen-Intent trailers: add-app, <second>); the commit was undone and the changes are left in place"
    And coord-commit-trailer-survives-hooks: the verified changes are left in place

    Examples:
      | second     |
      | other-slug |
      | add-app    |

  Scenario: A hook that changes the tree and removes the trailer is reported as the tree change
    Given coord-commit-trailer-survives-hooks: a repository with a verified candidate and no hooks
    And coord-commit-trailer-survives-hooks: a "pre-commit" hook that runs:
      """
      printf 'hook edit\n' > hook-made.txt && git add hook-made.txt
      """
    And coord-commit-trailer-survives-hooks: a "commit-msg" hook that runs:
      """
      printf 'Add the app\n' > "$1"
      """
    When coord-commit-trailer-survives-hooks: Kogen commits the candidate as "Add the app" for the Intent "add-app"
    Then coord-commit-trailer-survives-hooks: the commit Kogen made has the message:
      """
      Add the app
      """
    And coord-commit-trailer-survives-hooks: the commit is undone with the detail "a commit hook changed hook-made.txt; the commit was undone and the changes are left in place"
