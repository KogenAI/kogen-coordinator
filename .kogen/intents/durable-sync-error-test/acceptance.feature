Feature: Sync's flush error is pinned by the durable tests

  This feature runs the durable package tests in a temporary copy of the module against the
  unmodified durable.go and against two wrong Sync implementations. The first swallows the
  flush failure and returns nil. The second returns the flush error while syncing is skipped.

  Scenario: The durable tests fail when Sync swallows the flush error
    When durable-sync-error-test: the durable package tests run against the unmodified source, a source whose Sync swallows the flush error and a source whose Sync reports the flush error while syncing is skipped
    Then durable-sync-error-test: the tests fail on the source that swallows the flush error

  Scenario: The durable tests keep the skipped closed-file case returning nil
    When durable-sync-error-test: the durable package tests run against the unmodified source, a source whose Sync swallows the flush error and a source whose Sync reports the flush error while syncing is skipped
    Then durable-sync-error-test: the tests pass on the unmodified source
    And durable-sync-error-test: the tests fail on the source that reports the flush error while syncing is skipped
