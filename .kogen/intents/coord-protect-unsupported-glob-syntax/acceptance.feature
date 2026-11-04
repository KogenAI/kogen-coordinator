Feature: Diagnose unsupported protect syntax without changing membership
  Scenario: Brace alternatives do not expand
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["tests/*.{js,ts}"],"files":["tests/a.js"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[],"diagnostics":[{"entry":"tests/*.{js,ts}","severity":"lint","contains":["tests/*.{js,ts}","brace alternatives","**/","**","*","?"]},{"entry":"tests/*.{js,ts}","severity":"warning","contains":["tests/*.{js,ts}","matches no file"]}]}
      """

  Scenario: Character classes do not expand
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["src/[ab].js"],"files":["src/a.js","src/b.js"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[],"diagnostics":[{"entry":"src/[ab].js","severity":"lint","contains":["src/[ab].js","character classes","**/","**","*","?"]},{"entry":"src/[ab].js","severity":"warning","contains":["src/[ab].js","matches no file"]}]}
      """

  Scenario: Literal bracket and brace files are accepted
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["src/[ab].js","src/{ab}.js"],"files":["src/[ab].js","src/{ab}.js"],"tracked":["src/[ab].js"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":["src/[ab].js","src/{ab}.js"],"diagnostics":[]}
      """

  Scenario: Leading negation and backslash escaping are unsupported
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["!src/a.js","src/\\a.js"],"files":["src/a.js"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[],"diagnostics":[{"entry":"!src/a.js","severity":"lint","contains":["!src/a.js","leading negation","**/","**","*","?"]},{"entry":"!src/a.js","severity":"warning","contains":["!src/a.js","matches no file"]},{"entry":"src/\\a.js","severity":"lint","contains":["src/\\a.js","backslash escapes","**/","**","*","?"]},{"entry":"src/\\a.js","severity":"warning","contains":["src/\\a.js","matches no file"]}]}
      """

  Scenario Outline: Empty and absent directories warn without errors
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["docs/"],"dirs":<dirs>}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[],"diagnostics":[{"entry":"docs/","severity":"warning","contains":["docs/","matches no file"]}]}
      """
    Examples:
      | dirs      |
      | []        |
      | ["docs/"] |

  Scenario: Ignored files do not satisfy a pattern
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["docs/"],"files":["docs/ignored.txt"],"ignored":["docs/"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[],"diagnostics":[{"entry":"docs/","severity":"warning","contains":["docs/","matches no file"]}]}
      """

  Scenario: Supported forms retain membership without new diagnostics
    When coord-protect-unsupported-glob-syntax: I check protection for:
      """
      {"patterns":["**/*.feature",".kogen/project.yaml","docs/","src/?.js","assets/**","tests/*.js"],"files":["root.feature","nested/a.feature","docs/readme.md","src/a.js","src/ab.js","assets/deep/a.txt","tests/a.js","tests/deep/b.js","notes!ok.txt"],"tracked":["nested/a.feature","docs/readme.md"]}
      """
    Then coord-protect-unsupported-glob-syntax: the machine-readable results are:
      """
      {"files":[".kogen/project.yaml","assets/deep/a.txt","docs/readme.md","nested/a.feature","root.feature","src/a.js","tests/a.js"],"diagnostics":[]}
      """
