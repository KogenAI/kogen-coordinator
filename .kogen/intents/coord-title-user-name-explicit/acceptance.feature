Feature: Explicit Git user title validation
  Scenario Outline: Repository configuration explains the result
    When coord-title-user-name-explicit: I check "<title>" using repository name "<name>"
    Then coord-title-user-name-explicit: the problems are
      """
      <problems>
      """
    Examples:
      | title | name | problems |
      | Pat Owner adds retry | Pat Owner | title: "Pat Owner adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead |
      | Pat Ownership adds retry | Pat Owner | [] |
      | Pat Owner adds retry | | [] |
      | PAT OWNER adds retry | Pat Owner | title: "PAT OWNER adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead |
      | The owner approved retry | Pat Owner | title: "The owner approved retry" narrates owner or user approval or authorization in the third person |
      | The owner approved retry | | title: "The owner approved retry" narrates owner or user approval or authorization in the third person |

  Scenario Outline: Direct calls supply the name without Git
    When coord-title-user-name-explicit: I check "<title>" directly with name "<name>"
    Then coord-title-user-name-explicit: the problems are
      """
      <problems>
      """
    Examples:
      | title | name | problems |
      | Sam Lee fixes export | Sam Lee | title: "Sam Lee fixes export" names the Git user "Sam Lee" (git user.name); use an owner-authored title instead |
      | Pat Owner fixes export | Sam Lee | [] |
      | The owner approved retry | | title: "The owner approved retry" narrates owner or user approval or authorization in the third person |
      | The owner approved retry | Sam Lee | title: "The owner approved retry" narrates owner or user approval or authorization in the third person |
