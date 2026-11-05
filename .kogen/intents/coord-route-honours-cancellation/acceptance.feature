Feature: The routing cycle and resume stop between steps when the run is cancelled

  route.Cycle and route.Resume check their context before starting each step (Verify, Review,
  Commit, Continue, Fresh, Approved). A cancelled context returns ctx.Err() right away and no
  further step starts; a commit already in progress is not interrupted. A generated Go driver
  routes a scripted fake route.Steps (the trace format of route/route_test.go) and cancels its
  context inside a chosen step call. Cycle cases call route.Cycle with builderPass true; Resume
  cases use a reviewer that can continue its session (Continuable true). The outcome is the trace
  of step calls in order, the error text ("" for none) and, for Cycle, the feedback and landed.

  Scenario: An uncancelled green candidate is verified, reviewed and committed as today
    # Verify is green and the commit does not drift; nothing is cancelled.
    When coord-route-honours-cancellation: the driver runs the "cycle-green" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green"
        ],
        "feedback": "",
        "landed": true,
        "error": ""
      }
      """

  Scenario: An uncancelled red candidate goes back to its implementer as today
    # Verify is red; nothing is cancelled.
    When coord-route-honours-cancellation: the driver runs the "cycle-red" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes"
        ],
        "feedback": "fix it",
        "landed": false,
        "error": ""
      }
      """

  Scenario: An uncancelled approval whose candidate drifted once starts over with a fresh verification as today
    # The first commit drifts, the second does not; nothing is cancelled.
    When coord-route-honours-cancellation: the driver runs the "cycle-drifted-once" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green"
        ],
        "feedback": "",
        "landed": true,
        "error": ""
      }
      """

  Scenario: A run cancelled while Verify returns green reviews and commits nothing
    # The context is cancelled inside the first Verify, which returns green.
    When coord-route-honours-cancellation: the driver runs the "cycle-cancel-in-verify" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes"
        ],
        "feedback": "",
        "landed": false,
        "error": "context canceled"
      }
      """

  Scenario: A run cancelled while Review returns commits nothing
    # The context is cancelled inside Review, which returns an approval.
    When coord-route-honours-cancellation: the driver runs the "cycle-cancel-in-review" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green"
        ],
        "feedback": "",
        "landed": false,
        "error": "context canceled"
      }
      """

  Scenario: A commit in progress when the run is cancelled lands
    # The context is cancelled inside Commit, which returns not drifted.
    When coord-route-honours-cancellation: the driver runs the "cycle-cancel-in-commit" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green"
        ],
        "feedback": "",
        "landed": true,
        "error": ""
      }
      """

  Scenario: A run cancelled during a drifted commit starts no second verification
    # The context is cancelled inside the first Commit, which returns drifted.
    When coord-route-honours-cancellation: the driver runs the "cycle-cancel-after-drift" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green"
        ],
        "feedback": "",
        "landed": false,
        "error": "context canceled"
      }
      """

  Scenario: A cycle on an already cancelled context starts no step
    # The context is cancelled before Cycle is called.
    When coord-route-honours-cancellation: the driver runs the "cycle-cancelled-before-start" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [],
        "feedback": "",
        "landed": false,
        "error": "context canceled"
      }
      """

  Scenario: A run whose deadline passes during Verify reviews nothing and returns the deadline error
    # The context has a 100 ms deadline; the first Verify waits for it to pass, then returns green.
    When coord-route-honours-cancellation: the driver runs the "cycle-deadline-in-verify" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes"
        ],
        "feedback": "",
        "landed": false,
        "error": "context deadline exceeded"
      }
      """

  Scenario: A red verification during cancellation still returns its feedback, starting no step
    # The context is cancelled inside Verify, which returns red; no step follows a red candidate.
    When coord-route-honours-cancellation: the driver runs the "cycle-red-cancel-in-verify" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "verify builder=yes"
        ],
        "feedback": "fix it",
        "landed": false,
        "error": ""
      }
      """

  Scenario: Resuming a failed commit cancelled while Approved returns commits nothing
    # Stage commit_failed; the context is cancelled inside Approved.
    When coord-route-honours-cancellation: the driver runs the "resume-commit-failed-cancel-in-approved" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "approved"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a failed commit lets a commit in progress finish
    # Stage commit_failed; the context is cancelled inside the commit (no restart), which succeeds.
    When coord-route-honours-cancellation: the driver runs the "resume-commit-failed-cancel-in-commit" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "approved",
          "commit approved saved (no restart)"
        ],
        "error": ""
      }
      """

  Scenario: Resuming a failed commit on an already cancelled context starts no step
    # Stage commit_failed; the context is cancelled before Resume is called.
    When coord-route-honours-cancellation: the driver runs the "resume-commit-failed-cancelled-before-start" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a review-only checkpoint cancelled while Fresh returns reviews nothing
    # Stage review_only; the context is cancelled inside Fresh.
    When coord-route-honours-cancellation: the driver runs the "resume-review-only-cancel-in-fresh" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "fresh review_only"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a review-only checkpoint cancelled while Review returns commits nothing
    # Stage review_only; the context is cancelled inside Review.
    When coord-route-honours-cancellation: the driver runs the "resume-review-only-cancel-in-review" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "fresh review_only",
          "review base"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a review-only checkpoint lets a commit in progress land
    # Stage review_only; the context is cancelled inside Commit, which returns not drifted.
    When coord-route-honours-cancellation: the driver runs the "resume-review-only-cancel-in-commit" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "fresh review_only",
          "review base",
          "commit approved base"
        ],
        "error": ""
      }
      """

  Scenario: Resuming a review-only checkpoint cancelled during a drifted commit starts no verification
    # Stage review_only; the context is cancelled inside Commit, which returns drifted.
    When coord-route-honours-cancellation: the driver runs the "resume-review-only-cancel-after-drift" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "fresh review_only",
          "review base",
          "commit approved base"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a review-only checkpoint on an already cancelled context starts no step
    # Stage review_only; the context is cancelled before Resume is called.
    When coord-route-honours-cancellation: the driver runs the "resume-review-only-cancelled-before-start" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a continuing review cancelled while Continue returns commits nothing
    # Stage review with a reviewer that can continue; the context is cancelled inside Continue.
    When coord-route-honours-cancellation: the driver runs the "resume-continuing-cancel-in-continue" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "continue"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a continuing review lets a commit in progress land
    # Stage review; the context is cancelled inside Commit, which returns not drifted.
    When coord-route-honours-cancellation: the driver runs the "resume-continuing-cancel-in-commit" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "continue",
          "commit approved saved"
        ],
        "error": ""
      }
      """

  Scenario: Resuming a continuing review cancelled during a drifted commit starts no verification
    # Stage review; the context is cancelled inside Commit, which returns drifted.
    When coord-route-honours-cancellation: the driver runs the "resume-continuing-cancel-after-drift" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [
          "continue",
          "commit approved saved"
        ],
        "error": "context canceled"
      }
      """

  Scenario: Resuming a continuing review on an already cancelled context starts no step
    # Stage review; the context is cancelled before Resume is called.
    When coord-route-honours-cancellation: the driver runs the "resume-continuing-cancelled-before-start" case
    Then coord-route-honours-cancellation: the outcome is
      """
      {
        "trace": [],
        "error": "context canceled"
      }
      """
