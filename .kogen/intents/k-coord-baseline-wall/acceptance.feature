Feature: The check baseline records its wall time and names itself when a run stops during it

  project.RunCheckBaseline(ctx, checks, run) in project/baseline.go runs every configured check
  once, in order, through the caller's runner (the seam) and returns a project.CheckBaseline
  record: what the baseline decides for each check (name, command, status, output), the
  baseline's own start and end instants and wall time, and the start, end and wall time of each
  check. When the run's context has ended once a check's run returns, the baseline stops with a
  *project.BaselineStop that names the baseline and that check instead of the bare context error.
  A generated Go driver runs real `sh -c` commands, each in its own process group that is killed
  when the context ends. Timing values vary from run to run, so the observation states them as
  properties: instants are RFC 3339 UTC ("Z"), each wall_ms matches its instants within 2 ms, the
  check intervals lie inside the baseline's in order, each check's wall time covers the sleep of
  its command, and the check wall times (plus the stopped check's) add up to the baseline's within
  200 ms. A stop's wall time in the error text is shown as <n>.

  Scenario: A completed baseline records its start, end and the wall time of each check
    # Decisions: D1, D2, D3, D5, D8
    # A check that exits 3 is recorded and the next check still runs.
    When k-coord-baseline-wall: the driver runs the "complete" case
    Then k-coord-baseline-wall: the observation is
      """
      {
        "error": "",
        "deadline_exceeded": false,
        "plain_deadline_error": false,
        "stop": null,
        "ran": ["lint", "unit", "fast"],
        "record_keys": ["checks", "ended_at", "started_at", "timings", "wall_ms"],
        "checks": [
          {"name": "lint", "command": "sleep 0.4; echo lint ok", "status": 0, "output": "lint ok\n"},
          {"name": "unit", "command": "sleep 0.3; echo unit failed >&2; exit 3", "status": 3, "output": "unit failed\n"},
          {"name": "fast", "command": "true", "status": 0, "output": ""}
        ],
        "baseline": {"instants_utc": true, "wall_ms_matches_instants": true},
        "timings": [
          {"name": "lint", "keys": ["ended_at", "name", "started_at", "wall_ms"], "instants_utc": true, "wall_ms_matches_instants": true, "within_baseline": true, "after_previous_check": true, "wall_ms_covers_sleep": true},
          {"name": "unit", "keys": ["ended_at", "name", "started_at", "wall_ms"], "instants_utc": true, "wall_ms_matches_instants": true, "within_baseline": true, "after_previous_check": true, "wall_ms_covers_sleep": true},
          {"name": "fast", "keys": ["ended_at", "name", "started_at", "wall_ms"], "instants_utc": true, "wall_ms_matches_instants": true, "within_baseline": true, "after_previous_check": true, "wall_ms_covers_sleep": true}
        ],
        "check_walls_add_up_to_baseline_wall": true
      }
      """

  Scenario: A deadline that expires during a slow baseline check stops the run naming the baseline and that check
    # Decisions: D1, D2, D4, D5, D8
    # The run's context has a 500 ms deadline; the check slow runs `sleep 5` and is killed at the
    # deadline; the check after it is never run.
    When k-coord-baseline-wall: the driver runs the "deadline" case
    Then k-coord-baseline-wall: the observation is
      """
      {
        "error": "stopped during the check baseline: check slow (sleep 5) ran <n> ms: context deadline exceeded",
        "deadline_exceeded": true,
        "plain_deadline_error": false,
        "stop": {"check": "slow", "command": "sleep 5", "instants_utc": true, "wall_ms_matches_instants": true, "within_baseline": true, "after_previous_check": true, "ran_until_the_deadline": true},
        "ran": ["fast", "slow"],
        "record_keys": ["checks", "ended_at", "started_at", "timings", "wall_ms"],
        "checks": [
          {"name": "fast", "command": "true", "status": 0, "output": ""}
        ],
        "baseline": {"instants_utc": true, "wall_ms_matches_instants": true},
        "timings": [
          {"name": "fast", "keys": ["ended_at", "name", "started_at", "wall_ms"], "instants_utc": true, "wall_ms_matches_instants": true, "within_baseline": true, "after_previous_check": true, "wall_ms_covers_sleep": true}
        ],
        "check_walls_add_up_to_baseline_wall": true
      }
      """

  Scenario: The approval baseline and its hash stay byte-identical for the existing fixture
    # Decisions: D6, D7, D8
    # The fixture of contract/baseline_test.go's "acceptance" case plus the team lineup file;
    # the list and hash are the ones today's project.Baseline and project.Hash give.
    When k-coord-baseline-wall: the driver runs the "approval" case
    Then k-coord-baseline-wall: the observation is
      """
      {
        "baseline": [
          ".kogen/intents/fixture/intent.md",
          ".kogen/intents/fixture/acceptance.feature",
          "features/steps/z.js",
          "features/steps/a.js",
          ".kogen/intents/fixture/notes.md",
          ".kogen/project.yaml",
          ".kogen/models.yaml"
        ],
        "hash": "99315376c144923504469cbce0ff863676fcb1a1fe541506d48f22904a2aa33d"
      }
      """
