Feature: A missing Intent refusal names the slug it looked for and the next command

  project.RequireIntentDir(root, slug) is the refusal behind `kogen intent approve|refine|build <slug>`
  for a slug with no Intent folder. A generated Go driver calls it in a repository holding the
  named Intents and prints what it returned. The rendered refusal is the first line
  `intent/not_found: <detail>` followed by two-space-indented lines.

  Scenario Outline: A missing Intent names the slug, the searched folder and the next commands
    When k-coord-intent-not-found-names-next-command: the repository holds the Intents "" and the Intent "<slug>" is required
    Then k-coord-intent-not-found-names-next-command: the refusal is class "intent", reason "not_found" and exit 2
    Then k-coord-intent-not-found-names-next-command: the refusal text is exactly:
      """
      intent/not_found: Intent does not exist: <slug> (looked in .kogen/intents/<slug>)
        kogen intent list shows existing Intents; kogen intent shape <slug> <request-file> creates one
      """

    Examples:
      | slug     |
      | greeting |
      | other    |

  Scenario: A mistyped slug is offered the existing Intent it is closest to
    When k-coord-intent-not-found-names-next-command: the repository holds the Intents "greeting" and the Intent "greting" is required
    Then k-coord-intent-not-found-names-next-command: the refusal is class "intent", reason "not_found" and exit 2
    Then k-coord-intent-not-found-names-next-command: the refusal text is exactly:
      """
      intent/not_found: Intent does not exist: greting (looked in .kogen/intents/greting)
        kogen intent list shows existing Intents; kogen intent shape greting <request-file> creates one
        did you mean: greeting?
      """

  Scenario: At most the two nearest Intents are offered, nearest first
    When k-coord-intent-not-found-names-next-command: the repository holds the Intents "greeting-x,greetings,greeting,unrelated-thing" and the Intent "greting" is required
    Then k-coord-intent-not-found-names-next-command: the refusal text is exactly:
      """
      intent/not_found: Intent does not exist: greting (looked in .kogen/intents/greting)
        kogen intent list shows existing Intents; kogen intent shape greting <request-file> creates one
        did you mean: greeting, greetings?
      """

  Scenario: The nearest Intent is offered even when it is not close
    When k-coord-intent-not-found-names-next-command: the repository holds the Intents "invoice-export" and the Intent "greeting" is required
    Then k-coord-intent-not-found-names-next-command: the refusal text is exactly:
      """
      intent/not_found: Intent does not exist: greeting (looked in .kogen/intents/greeting)
        kogen intent list shows existing Intents; kogen intent shape greeting <request-file> creates one
        did you mean: invoice-export?
      """

  Scenario: An Intent that exists is accepted as before
    When k-coord-intent-not-found-names-next-command: the repository holds the Intents "greeting,other" and the Intent "greeting" is required
    Then k-coord-intent-not-found-names-next-command: the Intent is accepted without a refusal
