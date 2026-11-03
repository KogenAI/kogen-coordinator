Feature: One test-only way to regenerate the golden files

  The goldens are project/testdata/golden.json, project/testdata/facts-golden.json and
  project/testdata/parity.json. `go test ./... -update` rewrites drifted recorded outputs from
  the current code; without the flag every golden test compares as before.

  Scenario: An update on a tree whose goldens match writes nothing and the flag stays in tests
    Given a scratch copy of this checkout
    When I run "go test -count=1 ./... -update" in the copy
    Then the command exits 0
    And the run changed no file in the copy
    And no package of the module imports "flag" outside its tests
    And README.md documents "go test ./... -update"

  Scenario: Drifted goldens fail without the flag, are rewritten with it, and then pass
    Given a scratch copy of this checkout
    And these recorded outputs in the copy are stale:
      | file                               | path                          | value                                                              |
      | project/testdata/golden.json       | ["acceptance","project"]      | "stale project command"                                            |
      | project/testdata/golden.json       | ["render",1,"text"]           | "stale render"                                                     |
      | project/testdata/golden.json       | ["yaml",0,"result"]           | {"ok":["seq",1,[]]}                                                |
      | project/testdata/facts-golden.json | ["config_digests",0,"digest"] | "0000000000000000000000000000000000000000000000000000000000000000" |
      | project/testdata/facts-golden.json | ["json",0,"output"]           | "{}"                                                               |
      | project/testdata/facts-golden.json | ["comparison",0,"result"]     | {"ok":"stale"}                                                     |
      | project/testdata/facts-golden.json | ["repo","captured"]           | "stale receipt"                                                    |
      | project/testdata/parity.json       | ["cases",0,"hash"]            | "0000000000000000000000000000000000000000000000000000000000000000" |
    When I run "go test -count=1 ./project" in the copy
    Then the command exits 1
    And exactly these top-level tests failed:
      | TestCaptureSourceMatchesElixirFileForFile |
      | TestConfigDigestMatchesElixirTermToBinary |
      | TestDetectMatchesElixir                   |
      | TestEncodeJSONMatchesElixirJSONEncode     |
      | TestIntentHashMatchesElixir               |
      | TestRenderMatchesElixir                   |
      | TestSourceComparisonMatchesElixir         |
      | TestYAMLMatchesElixir                     |
    And the run changed no file in the copy
    When I run "go test -count=1 ./project -update" in the copy
    Then the command exits 0
    And these goldens in the copy equal the checkout's as JSON:
      | project/testdata/golden.json       |
      | project/testdata/facts-golden.json |
      | project/testdata/parity.json       |
    When I run "go test -count=1 ./project" in the copy
    Then the command exits 0
    And the run changed no file in the copy
