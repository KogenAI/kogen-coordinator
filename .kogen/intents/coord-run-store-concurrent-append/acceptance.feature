Feature: Two writers appending to one run record do not lose events
  durable.RunStore serializes the read, change and replace of one run record per run ID across
  goroutines and processes with an exclusive flock on <root>/<id>.lock, waiting at most
  durable.RunLockWait (10s) before it returns an error naming the run ID and the wait.
  The driver keeps the run event bound of 32: when more events were appended, the record holds the
  newest 32 and Omitted counts the rest.

  Scenario: Eight goroutines appending 25 events each to one run lose no event
    When coord-run-store-concurrent-append: the driver runs the "goroutines" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"distinct":true,"errors":0,"events":32,"events_plus_omitted":200,"first_error":"","known_stages":true,"newest_tail_per_writer":true,"omitted":168}
      """

  Scenario: Two helper processes appending 50 events each to one run lose no event
    When coord-run-store-concurrent-append: the driver runs the "processes" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"distinct":true,"events":32,"events_plus_omitted":100,"helpers":[{"errors":0,"first_error":""},{"errors":0,"first_error":""}],"known_stages":true,"newest_tail_per_writer":true,"omitted":68}
      """

  Scenario: Finish racing with 20 Appends keeps its summary and every appended event
    When coord-run-store-concurrent-append: the driver runs the "finish-race" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"append_errors":0,"evidence":["attempts/fin"],"finish_error":"","first_error":"","omitted":0,"outcome":"done","reason":"raced","sorted_stages":["e-0","e-1","e-10","e-11","e-12","e-13","e-14","e-15","e-16","e-17","e-18","e-19","e-2","e-3","e-4","e-5","e-6","e-7","e-8","e-9"]}
      """

  Scenario: A live lock holder makes Append and Finish fail after the wait, and a dead one blocks nothing
    When coord-run-store-concurrent-append: the driver runs the "held-then-dead" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"after_dead_error":"","after_dead_under_1s":true,"append_error":"run record \"held\": lock still held after 300ms","append_waited_the_wait":true,"default_wait":"10s","finish_error":"run record \"held\": lock still held after 300ms","finish_waited_the_wait":true,"folder":["held.json","held.lock"],"list":["held"],"outcome":"","record_written_while_held":false,"stages":["after-dead"]}
      """

  Scenario: Appends to run B finish while an Append to run A waits for A's lock
    When coord-run-store-concurrent-append: the driver runs the "independent" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"a_error":"","a_stages":["a-0"],"a_still_waiting_when_b_finished":true,"b_errors":0,"b_first_error":"","b_stages":["b-0","b-1","b-2","b-3","b-4","b-5","b-6","b-7","b-8","b-9"]}
      """

  Scenario: Every error path releases the lock and keeps its error text, and the lock file sits next to the record
    When coord-run-store-concurrent-append: the driver runs the "error-paths" case
    Then coord-run-store-concurrent-append: the observation is
      """
      {"errors":["run event exceeds record size limit","","run summary exceeds record size limit","","invalid character 'b' looking for beginning of value","invalid character 'b' looking for beginning of value","","invalid run ID \"../escape\"","invalid run ID \"x.y\""],"folder":["e.json","e.lock"],"list":["e"],"outside":["records"],"record":"{\"version\":1,\"id\":\"e\",\"events\":[{\"stage\":\"fourth\",\"at\":\"2026-01-02T03:04:05Z\",\"attempt\":\"a\"}],\"omitted\":0,\"outcome\":\"\",\"reason\":\"\",\"evidence\":[]}"}
      """
