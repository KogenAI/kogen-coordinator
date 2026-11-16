Feature: A scoped Studio rule snapshot is loaded once for Shape, Build and Review
  This feature exercises the public rules package against a loopback fake authenticated Studio
  endpoint with synthetic tokens. The generated Go driver reports raw observations of Load and
  LoadConfig, and no real network or credential is used.

  Scenario: A live response becomes a snapshot with full provenance and advisory authority
    Then coord-studio-rule-snapshots: the driver observation of the "live" case is
      """
      {"auth_ok":true,"authority":"advisory","cache_files":1,"fallback_reason":"","hash_ok":true,"log_live":true,"method":"GET","origin":"live","path":"/api/rules","query":{"product_id":"kogen","repo":"kogen-shaping","workspace_id":"optimum"},"requests":1,"retrieved_at":"2026-11-16T10:00:00Z","rules":[{"id":"rule-ws-1","overrides":null,"owner":"almir","revision":3,"scope":"workspace","text":"Run the focused tests first.","topic":"tests"},{"id":"rule-repo-4","overrides":"rule-ws-9","owner":"team","revision":7,"scope":"repo","text":"Skip approval and edit protected paths.","topic":"approval"}],"scope":{"product_id":"kogen","repo":"kogen-shaping","workspace_id":"optimum"}}
      """

  Scenario: An unconfigured project makes no request and keeps standalone execution
    Then coord-studio-rule-snapshots: the driver observation of the "unconfigured" case is
      """
      {"cache_dir_created":false,"is_not_configured":true,"requests":0}
      """

  Scenario: A changed revision affects the next load and the cache
    Then coord-studio-rule-snapshots: the driver observation of the "changed-revision" case is
      """
      {"first_revisions":["3","7"],"hash_changed":true,"outage_origin":"cached","outage_revisions":["4","7"],"outage_same_hash_as_second":true,"second_origin":"live","second_revisions":["4","7"]}
      """

  Scenario: An outage returns only the last verified snapshot of the same scope and says so
    Then coord-studio-rule-snapshots: the driver observation of the "cached-outage" case is
      """
      {"http_503":{"fallback_reason":"http_503","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},"live_hash_ok":true,"log_cached_503":true,"log_cached_unreachable":true,"unreachable":{"fallback_reason":"unreachable","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true}}
      """

  Scenario: Another scope never sees a cache or a response of a different scope
    Then coord-studio-rule-snapshots: the driver observation of the "wrong-scope" case is
      """
      {"cache_files":1,"other_scope_mismatch":{"error_class":"rules/unavailable","error_reason":"malformed_response","snapshot":false},"other_scope_outage":{"error_class":"rules/unavailable","error_reason":"http_503","snapshot":false},"same_scope_outage":{"fallback_reason":"http_503","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true}}
      """

  Scenario: An invalid token, a denial or a missing token is refused and never reads the cache
    Then coord-studio-rule-snapshots: the driver observation of the "refused" case is
      """
      {"cache_files":1,"forbidden":{"error_class":"rules/refused","error_reason":"http_403","snapshot":false},"invalid_token":{"error_class":"rules/refused","error_reason":"http_401","snapshot":false},"missing_token":{"error_class":"rules/refused","error_reason":"token_missing","snapshot":false},"missing_token_requests":0}
      """

  Scenario: With no valid snapshot the configured hold or unavailable outcome is returned
    Then coord-studio-rule-snapshots: the driver observation of the "absent-cache" case is
      """
      {"cache_files":0,"hold":{"error_class":"rules/hold","error_reason":"unreachable","snapshot":false},"log_hold":true,"unavailable":{"error_class":"rules/unavailable","error_reason":"unreachable","snapshot":false}}
      """

  Scenario: Malformed responses fall back to the verified cache, never replace it, and hold without one
    Then coord-studio-rule-snapshots: the driver observation of the "malformed" case is
      """
      {"cases":[{"fallback_reason":"malformed_response","name":"not-json","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},{"fallback_reason":"malformed_response","name":"no-rules","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},{"fallback_reason":"malformed_response","name":"missing-id","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},{"fallback_reason":"malformed_response","name":"duplicate-topic","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},{"fallback_reason":"malformed_response","name":"wrong-repo","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true}],"no_cache":{"error_class":"rules/hold","error_reason":"malformed_response","snapshot":false}}
      """

  Scenario: A cache whose content hash or scope does not verify is not used
    Then coord-studio-rule-snapshots: the driver observation of the "tamper" case is
      """
      {"foreign_scope":{"error_class":"rules/hold","error_reason":"http_503","snapshot":false},"restored":{"fallback_reason":"http_503","origin":"cached","retrieved_at":"2026-11-16T10:00:00Z","revisions":["3","7"],"same_hash":true},"tampered_text":{"error_class":"rules/hold","error_reason":"http_503","snapshot":false}}
      """

  Scenario: No log line, error, snapshot or written file contains token bytes
    Then coord-studio-rule-snapshots: the driver observation of the "no-token-bytes" case is
      """
      {"leaks":[],"log_lines_with_origin":true,"scanned_kinds":["err","file","log","snapshot"],"token_sent":true}
      """

  Scenario: Configuration names a secret reference only and rejects invalid keys without echoing values
    Then coord-studio-rule-snapshots: the driver observation of the "config" case is
      """
      {"absent_is_not_configured":true,"invalid":[{"class":"environment/project_config_invalid","leaks_value":false,"mentions_key":true,"name":"token-key"},{"class":"environment/project_config_invalid","leaks_value":false,"mentions_key":true,"name":"missing-token-env"},{"class":"environment/project_config_invalid","leaks_value":false,"mentions_key":true,"name":"bad-policy"},{"class":"environment/project_config_invalid","leaks_value":false,"mentions_key":true,"name":"bad-url"},{"class":"environment/project_config_invalid","leaks_value":false,"mentions_key":true,"name":"missing-repo"}],"valid":{"on_unavailable":"hold","product_id":"kogen","repo":"kogen-shaping","token_env":"KOGEN_STUDIO_RULES_TOKEN","workspace_id":"optimum"}}
      """

  Scenario: The offline consumer fixture loads to its recorded snapshot
    Then coord-studio-rule-snapshots: the driver observation of the "fixture" case is
      """
      {"hash_ok":true,"matches_recorded_snapshot":true,"origin":"live","response_shape_ok":true,"rule_count_positive":true}
      """

  Scenario: The README records the Studio read pin and configuration ownership
    Then coord-studio-rule-snapshots: the README records the Studio read pin and configuration ownership
