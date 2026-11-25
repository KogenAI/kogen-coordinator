Feature: A done context wins over a missing Studio token

  This feature exercises configured projects with a verified same-scope cache.

  Scenario: An already-cancelled context takes precedence over a missing token
    When rules-cancelled-context-before-token: the driver loads with context state "active" and a missing token
    Then rules-cancelled-context-before-token: the active load yields without an HTTP request or cache read
      """
      {"error":{"kind":"*rules.Error","class":"rules/refused","reason":"token_missing"},"snapshot":null}
      """
    When rules-cancelled-context-before-token: the driver loads with context state "cancelled" and a missing token
    Then rules-cancelled-context-before-token: the "cancelled" load yields without token lookup, HTTP requests, or cache reads
      """
      {"error":{"kind":"context.Canceled"},"snapshot":null}
      """

  Scenario: An already-expired deadline takes precedence over a missing token
    When rules-cancelled-context-before-token: the driver loads with context state "expired" and a missing token
    Then rules-cancelled-context-before-token: the "expired" load yields without token lookup, HTTP requests, or cache reads
      """
      {"error":{"kind":"context.DeadlineExceeded"},"snapshot":null}
      """
