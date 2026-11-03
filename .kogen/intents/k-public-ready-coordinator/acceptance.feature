Feature: Public coordinator documentation
  Scenario: A public reader can start with the README
    Then the public README contains "https://github.com/KogenAI/kogen"
    And the public README contains "https://github.com/KogenAI/kogen-coordinator"
    And the public README contains "go build ./..."
    And the public README contains "go vet ./..."
    And the public README contains "go test -race -count=1 ./..."
    And the public README contains "go test ./... -update"
    And the public README contains "git diff -- project/testdata"
    And the public README contains "go test ./..."
    And the public README mentions the Go version from go.mod
    And the public README states the inquiry address "contact@kogen.dev" once

  Scenario: Obsolete private instructions and internal paths are removed
    Then the public README excludes pattern "GOPRIVATE|insteadOf|private KogenAI|work.noindex|during delivery"
    And the coordinator contract Intent excludes home path examples
    And the public tree has no policy file named "SECURITY.md"
    And the public tree has no policy file named "CONTRIBUTING.md"
    And the public tree has no policy file named "BRANDING.md"

  Scenario: The owner receives a history and current exception report
    Then the public audit report contains "History"
    And the public audit report contains "project/testdata/parity.json"
    And the public audit report contains "project/testdata/facts-golden.json"
    And the public audit report contains "commit"
    And the public audit report contains "unchanged"
