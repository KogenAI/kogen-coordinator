Feature: Cancelled Studio rules loads return the context error

  rules.Load asks a local Studio double for the rules of a configured scope. Every case first
  loads once live so a valid same-scope cache exists. A cancelled request context or an expired
  deadline makes Load return that context error itself (errors.Is and the error text of the
  context error), no snapshot and not a rules failure class. An ordinary network failure keeps
  the cached snapshot with the reason unreachable. The driver reports the error text, whether it
  is context.Canceled, context.DeadlineExceeded or a rules failure class, the snapshot summary and
  the number of HTTP requests Studio received after the cache was written.

  Scenario: A load with an already cancelled context returns context.Canceled and asks Studio for nothing
    When rules-cancelled-load-propagation: the driver runs the "cancelled-before-load" case
    Then rules-cancelled-load-propagation: the outcome is
      """
      {
        "error": "context canceled",
        "is_canceled": true,
        "is_deadline_exceeded": false,
        "is_rules_failure_class": false,
        "snapshot": null,
        "requests": 0
      }
      """

  Scenario: A load whose deadline expires while Studio holds the request returns context.DeadlineExceeded
    When rules-cancelled-load-propagation: the driver runs the "deadline-expired" case
    Then rules-cancelled-load-propagation: the outcome is
      """
      {
        "error": "context deadline exceeded",
        "is_canceled": false,
        "is_deadline_exceeded": true,
        "is_rules_failure_class": false,
        "snapshot": null
      }
      """

  Scenario: A load cancelled while Studio holds the request returns context.Canceled
    When rules-cancelled-load-propagation: the driver runs the "cancelled-during-request" case
    Then rules-cancelled-load-propagation: the outcome is
      """
      {
        "error": "context canceled",
        "is_canceled": true,
        "is_deadline_exceeded": false,
        "is_rules_failure_class": false,
        "snapshot": null
      }
      """

  Scenario: An ordinary network failure still returns the cached snapshot with the outage reason
    When rules-cancelled-load-propagation: the driver runs the "network-outage" case
    Then rules-cancelled-load-propagation: the outcome is
      """
      {
        "error": "",
        "is_canceled": false,
        "is_deadline_exceeded": false,
        "is_rules_failure_class": false,
        "snapshot": {"origin": "cached", "fallback_reason": "unreachable", "rule_count": 1}
      }
      """
