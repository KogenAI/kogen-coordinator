Feature: ReadApproval rejects an approval recorded for another Intent

  This feature drives project.ReadApproval through a generated Go driver. The driver writes the
  approval file for the requested slug requested-slug in a fresh root (or none), calls
  project.ReadApproval(root, "requested-slug") and observes the result.

  Scenario: A file requested as one slug whose JSON records another slug is rejected naming both slugs
    # The file .kogen/local/approvals/requested-slug.json is a complete approval whose "slug" is "recorded-slug".
    When approval-slug-binding: the driver runs the "mismatch" case
    Then approval-slug-binding: the observation is
      """
      {
        "approval_returned": false,
        "error_returned": true,
        "error_names_requested_slug": true,
        "error_names_recorded_slug": true
      }
      """

  Scenario: A valid approval whose recorded slug matches the requested slug is still accepted
    When approval-slug-binding: the driver runs the "match" case
    Then approval-slug-binding: the observation is
      """
      {
        "approval_returned": true,
        "error_returned": false,
        "slug": "requested-slug",
        "sha256": "h1"
      }
      """

  Scenario: An absent approval file still yields no approval and no error
    When approval-slug-binding: the driver runs the "absent" case
    Then approval-slug-binding: the observation is
      """
      {
        "approval_returned": false,
        "error_returned": false
      }
      """
