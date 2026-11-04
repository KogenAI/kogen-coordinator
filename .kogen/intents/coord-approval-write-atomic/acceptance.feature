Feature: The approval file is replaced atomically, never truncated in place

  project.WriteApproval creates the approval's folder, writes the complete bytes of
  project.EncodeApproval to a unique temp file in that folder, flushes it once with durable.Sync,
  and renames it over the approval path; on every failure it removes the temp file. A generated Go
  driver writes approvals for the slug atomic-demo in a fresh root under umask 022 and observes
  every durable.Sync call through durable.ObserveSyncInTests, with the approval file's bytes and
  the flushed file's bytes at the moment of the flush.

  # Approval A: {Slug: "atomic-demo", SHA256: "h1", Approver: "Ada <ada@example.test>",
  #   ApprovedAt: "2026-11-04T00:00:00Z", SourceProvenance: {"note": "a < b & c"}}
  # Approval B: {Slug: "atomic-demo", SHA256: "h2", Base: "abc123", Approver: "Ada <ada@example.test>",
  #   ApprovedAt: "2026-11-04T01:00:00Z", SourceProvenance: nil}

  Scenario: Writing an approval in a fresh root creates its folder, flushes the temp file once and keeps today's bytes and mode
    # The root holds no .kogen folder; approval A is written.
    When coord-approval-write-atomic: the driver runs the "fresh" case
    Then coord-approval-write-atomic: the observation is
      """
      {
        "error": "",
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "target_existed_at_flush": false,
        "temp_at_flush": "{\"slug\":\"atomic-demo\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":{\"note\":\"a < b & c\"}}\n",
        "file": "{\"slug\":\"atomic-demo\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":{\"note\":\"a < b & c\"}}\n",
        "file_is_the_encoding": true,
        "mode": "0644",
        "folder": ["atomic-demo.json"]
      }
      """

  Scenario: Overwriting an approval flushes the new bytes once before the rename and leaves only the approval in the folder
    # Approval A is written, then approval B over it; only the second write is observed.
    When coord-approval-write-atomic: the driver runs the "overwrite" case
    Then coord-approval-write-atomic: the observation is
      """
      {
        "error": "",
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "target_at_flush": "{\"slug\":\"atomic-demo\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":{\"note\":\"a < b & c\"}}\n",
        "temp_at_flush": "{\"slug\":\"atomic-demo\",\"sha256\":\"h2\",\"base\":\"abc123\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T01:00:00Z\",\"source_provenance\":null}\n",
        "file": "{\"slug\":\"atomic-demo\",\"sha256\":\"h2\",\"base\":\"abc123\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T01:00:00Z\",\"source_provenance\":null}\n",
        "file_is_the_encoding": true,
        "mode": "0644",
        "folder": ["atomic-demo.json"]
      }
      """

  Scenario: A failed rename returns an error and leaves no temp file in the folder
    # The approval path atomic-demo.json is a non-empty directory holding the file keep;
    # approval A is written.
    When coord-approval-write-atomic: the driver runs the "rename-failure" case
    Then coord-approval-write-atomic: the observation is
      """
      {
        "error_returned": true,
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "folder": ["atomic-demo.json"],
        "inside_target": ["keep"],
        "kept": "keep\n"
      }
      """

  Scenario: A failed flush returns an error, keeps the old approval and leaves no temp file in the folder
    # Approval A is written; the observer then closes the temp file when durable.Sync is called
    # on it, so the flush fails while approval B is written.
    When coord-approval-write-atomic: the driver runs the "sync-failure" case
    Then coord-approval-write-atomic: the observation is
      """
      {
        "error_returned": true,
        "flushes": 1,
        "flushed_temp_in_folder": true,
        "folder": ["atomic-demo.json"],
        "file": "{\"slug\":\"atomic-demo\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":{\"note\":\"a < b & c\"}}\n"
      }
      """

  Scenario: An interrupted write of the new bytes keeps the old approval whole and leaves no temp file
    # Approval A is written; the driver then limits the process's file size to 64 bytes
    # (RLIMIT_FSIZE) and writes approval B with SourceProvenance {"pad": 4096 times "x"}, so the
    # write stops after 64 bytes. Today the approval file is left holding those 64 bytes.
    When coord-approval-write-atomic: the driver runs the "write-failure" case
    Then coord-approval-write-atomic: the observation is
      """
      {
        "error_returned": true,
        "flushes": 0,
        "folder": ["atomic-demo.json"],
        "file": "{\"slug\":\"atomic-demo\",\"sha256\":\"h1\",\"approver\":\"Ada <ada@example.test>\",\"approved_at\":\"2026-11-04T00:00:00Z\",\"source_provenance\":{\"note\":\"a < b & c\"}}\n"
      }
      """
