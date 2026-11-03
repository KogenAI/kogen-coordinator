Feature: Acceptance paths stay inside the repository
  Scenario: Report synthetic violations alongside other lint
    When I check acceptance paths with:
      """
      {"Entries":["../x.js","/etc/hosts","features/steps/a//b.js",".git/config"],"BadTitle":true}
      """
    Then the acceptance path lint lines are:
      """
      ["title: the title must not end with a period","acceptance: ../x.js must be a clean relative path","acceptance: /etc/hosts must be a clean relative path","acceptance: features/steps/a//b.js must be a clean relative path","acceptance: .git/config must not contain .git"]
      """

  Scenario: Overlay does not excuse invalid spellings
    When I check acceptance paths with:
      """
      {"Entries":["","./a","a/../b","a/./b","a/","a/.git/b"],"Mode":"overlay"}
      """
    Then the acceptance path lint lines are:
      """
      ["acceptance:  must be a clean relative path","acceptance: ./a must be a clean relative path","acceptance: a/../b must be a clean relative path","acceptance: a/./b must be a clean relative path","acceptance: a/ must be a clean relative path","acceptance: a/.git/b must not contain .git"]
      """

  Scenario Outline: Normal disk and overlay lists and internal symlinks are allowed
    When I check acceptance paths with:
      """
      {"Entries":["features/steps/x.js"],"Mode":"<mode>"}
      """
    Then the acceptance path lint lines are:
      """
      []
      """
    Examples:
      | mode     |
      | disk     |
      | overlay  |
      | internal |

  Scenario: Reject an external final symlink
    When I check acceptance paths with:
      """
      {"Entries":["features/steps/x.js"],"Mode":"external"}
      """
    Then the acceptance path lint lines are:
      """
      ["acceptance: features/steps/x.js resolves outside the repository"]
      """

  Scenario: Reject an escaping parent
    When I check acceptance paths with:
      """
      {"Entries":["linked/outside.js"],"Mode":"parent"}
      """
    Then the acceptance path lint lines are:
      """
      ["acceptance: linked/outside.js resolves outside the repository"]
      """
