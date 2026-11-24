Feature: Direct Read regression coverage for record validation
  This feature adds tests, not reader behavior. The Go tests in durable/run_store_test.go
  must call Read directly on valid JSON files and distinguish the requested invalid
  records from a valid version 1 record. Mutations run only in disposable copies.

  Scenario: Protect Read schema and identity validation
    When run-record-schema-rejection-tests: the file tests run on the original reader and three wrong readers
    Then run-record-schema-rejection-tests: the tests pass on the original reader
    Then run-record-schema-rejection-tests: the tests catch rejecting version 1 with matching ID
    Then run-record-schema-rejection-tests: the tests catch accepting version 2 with matching ID
    Then run-record-schema-rejection-tests: the tests catch accepting version 1 with a mismatched ID
