Feature: Local records and index restores are written durably and without a shared temp name

  project.WriteJSONAtomic, which writes every `.kogen/local` record, writes a temp file with a
  unique name in the record's folder, flushes it with durable.Sync before renaming it over the
  record and removes it on every failure. git.Repo.RestoreIndex flushes its temp file with
  durable.Sync before renaming it over the user's index. A generated Go driver observes every
  durable.Sync call through durable.ObserveSyncInTests, with the target's bytes and the flushed
  file's bytes at the moment of the flush.

  Scenario: One record write flushes its temp file before the rename and keeps today's bytes and mode
    # The record already holds {"n":1}; it is rewritten from
    # {"z": "é<>&", "a": [1.50 (json.Number), true, nil], "m": {"b": "2", "a": "1"}} under umask 022.
    When coord-local-record-write-durable: the driver runs the "record-flush" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "error": "",
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "target_at_flush": "{\"n\":1}\n",
        "temp_at_flush": "{\"a\":[1.50,true,null],\"m\":{\"a\":\"1\",\"b\":\"2\"},\"z\":\"é<>&\"}\n",
        "final": "{\"a\":[1.50,true,null],\"m\":{\"a\":\"1\",\"b\":\"2\"},\"z\":\"é<>&\"}\n",
        "mode": "0644",
        "folder": ["facts.json"]
      }
      """

  Scenario: A failed rename returns an error and leaves no temp file in the folder
    # The target facts.json is a non-empty directory holding the file keep.
    When coord-local-record-write-durable: the driver runs the "rename-failure" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "error_returned": true,
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "folder": ["facts.json"],
        "inside_target": ["keep"],
        "kept": "keep\n"
      }
      """

  Scenario: A failed write of the temp file returns an error and leaves no temp file in the folder
    # The record already holds {"n":1}; the driver limits the process's file size to 64 bytes
    # (RLIMIT_FSIZE) and writes {"pad": 4096 times "x"}, so writing the temp file fails.
    When coord-local-record-write-durable: the driver runs the "write-failure" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "error_returned": true,
        "flushes": 0,
        "folder": ["facts.json"],
        "record": "{\"n\":1}\n"
      }
      """

  Scenario: A failed flush returns an error, keeps the old record and leaves no temp file in the folder
    # The record already holds {"n":1}; the observer closes the temp file when durable.Sync is
    # called on it, so the flush fails while {"n":2} is written.
    When coord-local-record-write-durable: the driver runs the "sync-failure" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "error_returned": true,
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "folder": ["facts.json"],
        "record": "{\"n\":1}\n"
      }
      """

  Scenario: Two concurrent writes of one record leave one complete input and no temp file
    # In each of 200 fresh folders, two goroutines write facts.json at once, one with
    # {"writer": "a", "pad": 4096 times "a"} and one with {"writer": "b"}.
    When coord-local-record-write-durable: the driver runs the "concurrent" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "rounds": 200,
        "errors": 0,
        "first_error": "",
        "finals_equal_to_an_input": 200,
        "rounds_with_leftovers": 0,
        "rounds_without_two_flushes": 0,
        "rounds_sharing_a_temp": 0,
        "rounds_flushing_outside": 0
      }
      """

  Scenario: An index restore flushes its temp file before the rename and keeps the index's mode
    # The saved index stages a.txt; the replaced index also stages b.txt and has mode 0600.
    When coord-local-record-write-durable: the driver runs the "index-restore" case
    Then coord-local-record-write-durable: the observation is
      """
      {
        "error": "",
        "flushes": 1,
        "flushed_temp_in_git_dir": true,
        "index_at_flush_is_the_replaced_index": true,
        "temp_at_flush_is_the_saved_index": true,
        "index_is_the_saved_index": true,
        "saved_differs_from_replaced": true,
        "mode": "0600",
        "git_dir_entries_unchanged": true
      }
      """
