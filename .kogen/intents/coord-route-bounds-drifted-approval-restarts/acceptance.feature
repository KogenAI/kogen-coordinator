Feature: The routing cycle bounds the restarts after a drifted approval

  route.Cycle counts, within one call, the approvals whose candidate drifted before the commit.
  After the third consecutive drifted approval it returns an error and starts no fourth
  verification; route.Resume counts a drifted resumed commit as the first drift. A generated Go
  driver routes a scripted fake route.Steps (the trace format of route/route_test.go) through
  route.Cycle (builderPass true) or route.Resume (a reviewer that can continue its session at the
  review stage). The outcome is the trace of step calls in order and one entry per call of
  Cycle (feedback, landed, error text, "" for none) or of Resume (error text). The fake stops a
  runaway routing by returning the error "fake: runaway" at its ninth Verify.

  Scenario: A Cycle whose approvals always drift stops after the third drifted approval
    # Commit always reports a drift; Verify is always green.
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "cycle-always-drifted" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green"
        ],
        "calls": [
          {
            "feedback": "",
            "landed": false,
            "error": "candidate changed after review 3 times before the commit; the last verification evidence is kept"
          }
        ]
      }
      """

  Scenario: A Cycle that drifts twice and then lands still lands
    # Commit drifts twice and then succeeds; only the first Verify has builderPass true.
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "cycle-lands-after-two-drifts" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green"
        ],
        "calls": [
          {
            "feedback": "",
            "landed": true,
            "error": ""
          }
        ]
      }
      """

  Scenario: The drift count belongs to one Cycle call
    # Two separate Cycle calls on the same fake each drift twice and then land.
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "cycle-drift-count-resets-per-call" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=yes",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green"
        ],
        "calls": [
          {
            "feedback": "",
            "landed": true,
            "error": ""
          },
          {
            "feedback": "",
            "landed": true,
            "error": ""
          }
        ]
      }
      """

  Scenario: A resumed commit that drifts counts as the first drifted approval
    # Resume continues a review (a reviewer that can continue); Commit always reports a drift; Verify is always green.
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "resume-always-drifted" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "continue",
          "commit approved saved",
          "verify builder=no",
          "review green",
          "commit approved green",
          "verify builder=no",
          "review green",
          "commit approved green"
        ],
        "calls": [
          {
            "error": "candidate changed after review 3 times before the commit; the last verification evidence is kept"
          }
        ]
      }
      """

  Scenario: A drifted commit during which the run is cancelled keeps the cancellation error
    # The first Commit reports a drift and cancels the context inside the call.
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "cycle-drift-then-cancel" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "verify builder=yes",
          "review green",
          "commit approved green"
        ],
        "calls": [
          {
            "feedback": "",
            "landed": false,
            "error": "context canceled"
          }
        ]
      }
      """

  Scenario: A resumed drifted commit followed by a red candidate keeps its existing error
    # Resume continues a review; Commit drifts; the next Verify is red with feedback "fix it".
    When coord-route-bounds-drifted-approval-restarts: the driver runs the "resume-drift-then-red" case
    Then coord-route-bounds-drifted-approval-restarts: the outcome is
      """
      {
        "trace": [
          "continue",
          "commit approved saved",
          "verify builder=no"
        ],
        "calls": [
          {
            "error": "candidate changed after review in a resumed commit: fix it"
          }
        ]
      }
      """
