Feature: Reject duplicate JSON keys in Studio rules responses

  Scenario: Reject a duplicate top-level product key
    Given rules-reject-duplicate-json-keys: an uncached project with policy "hold"
    When rules-reject-duplicate-json-keys: Studio replies with HTTP 200 and body
      """
      {"product":"other","product":"kogen","repo":"r","rules":[]}
      """
    Then rules-reject-duplicate-json-keys: the load outcome is
      """
      {"error":{"class":"rules/hold","reason":"malformed_response"},"snapshot":null}
      """

  Scenario: Reject duplicate keys within a rule
    Given rules-reject-duplicate-json-keys: an uncached project with policy "unavailable"
    When rules-reject-duplicate-json-keys: Studio replies with HTTP 200 and body
      """
      {"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"repo","topic":"t","text":"old","text":"new","owner":"o","overrides":null}]}
      """
    Then rules-reject-duplicate-json-keys: the load outcome is
      """
      {"error":{"class":"rules/unavailable","reason":"malformed_response"},"snapshot":null}
      """

  Scenario: Reject keys with the same decoded name and value
    Given rules-reject-duplicate-json-keys: an uncached project with policy "hold"
    When rules-reject-duplicate-json-keys: Studio replies with HTTP 200 and body
      """
      {"product":"kogen","repo":"r","rules":[],"future":true,"f\u0075ture":true}
      """
    Then rules-reject-duplicate-json-keys: the load outcome is
      """
      {"error":{"class":"rules/hold","reason":"malformed_response"},"snapshot":null}
      """

  Scenario: Use the verified cache after a duplicate-key response
    Given rules-reject-duplicate-json-keys: an uncached project with policy "hold"
    And rules-reject-duplicate-json-keys: prime the project's cache with this successful Studio body
      """
      {"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"repo","topic":"t","text":"cached","owner":"o","overrides":null}]}
      """
    When rules-reject-duplicate-json-keys: Studio replies with HTTP 200 and body
      """
      {"product":"other","product":"kogen","repo":"r","rules":[{"id":"a","revision":2,"scope":"repo","topic":"t","text":"replacement","owner":"o","overrides":null}]}
      """
    Then rules-reject-duplicate-json-keys: the load outcome is
      """
      {"error":null,"snapshot":{"origin":"cached","fallback_reason":"malformed_response","rule_ids":["a"],"matches_seed":true}}
      """

  Scenario: Load a valid response with unique keys as live
    Given rules-reject-duplicate-json-keys: an uncached project with policy "hold"
    When rules-reject-duplicate-json-keys: Studio replies with HTTP 200 and body
      """
      {"product":"kogen","repo":"r","rules":[{"id":"a","revision":1,"scope":"repo","topic":"t","text":"first","owner":"o","overrides":null},{"id":"b","revision":2,"scope":"repo","topic":"u","text":"second","owner":"o","overrides":null}]}
      """
    Then rules-reject-duplicate-json-keys: the load outcome is
      """
      {"error":null,"snapshot":{"origin":"live","fallback_reason":"","rule_ids":["a","b"],"matches_seed":false}}
      """
