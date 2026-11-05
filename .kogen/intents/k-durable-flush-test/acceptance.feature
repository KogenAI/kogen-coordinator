Feature: A check fails when the provenance write stops flushing or non-test code switches syncing off

  Every scenario works in its own copy of the repository (every file except .git) and runs a go
  command there. The provenance write is project.PublishSource, which flushes the receipt's temp
  file and the archive of the previous receipt with durable.Sync. Go test files may still call
  durable.SkipSyncInTests; a call from any other Go file makes a check fail and names the file.

  Scenario: Removing the flush from the provenance write makes the project tests fail and name the write
    Given k-durable-flush-test: a copy of the repository
    When k-durable-flush-test: "go test -count=1 ./project/" runs in the copy
    Then k-durable-flush-test: the command succeeds
    Given k-durable-flush-test: in the copy, every durable.Sync call of "project/provenance.go" is replaced by a call that does not flush
    When k-durable-flush-test: "go test -count=1 ./project/" runs in the copy
    Then k-durable-flush-test: the command fails and its output contains "provenance write was not flushed with durable.Sync"

  Scenario: A call of SkipSyncInTests in a non-test file of another package makes the durable tests fail and name the file
    # The function is never called, so only the scan of the repository's files can find it.
    Given k-durable-flush-test: a copy of the repository
    When k-durable-flush-test: "go test -count=1 ./durable/" runs in the copy
    Then k-durable-flush-test: the command succeeds
    Given k-durable-flush-test: the copy has the file "route/kogen_skip_sync.go" holding
      """
      package route

      import "github.com/KogenAI/kogen-coordinator/durable"

      func kogenSkipSync() { durable.SkipSyncInTests() }
      """
    When k-durable-flush-test: "go test -count=1 ./durable/" runs in the copy
    Then k-durable-flush-test: the command fails and its output contains "durable.SkipSyncInTests called from non-test file route/kogen_skip_sync.go"

  Scenario: An unqualified call of SkipSyncInTests in a non-test file of package durable makes the durable tests fail and name the file
    Given k-durable-flush-test: a copy of the repository
    Given k-durable-flush-test: the copy has the file "durable/kogen_skip_sync.go" holding
      """
      package durable

      func kogenSkipSync() { SkipSyncInTests() }
      """
    When k-durable-flush-test: "go test -count=1 ./durable/" runs in the copy
    Then k-durable-flush-test: the command fails and its output contains "durable.SkipSyncInTests called from non-test file durable/kogen_skip_sync.go"

  Scenario: A program whose non-test file calls SkipSyncInTests panics naming the file and keeps flushing
    # attempt calls skip, recovers its panic and prints it, then prints whether durable.Sync of a
    # closed file fails (it fails while syncing is on and returns nil once it is switched off).
    Given k-durable-flush-test: a copy of the repository
    Given k-durable-flush-test: the copy has the file "kogenskipdriver/helper.go" holding
      """
      package main

      import (
          "fmt"
          "os"
          "path/filepath"

          "github.com/KogenAI/kogen-coordinator/durable"
      )

      func attempt(skip func()) string {
          var r any
          func() {
              defer func() { r = recover() }()
              skip()
          }()
          dir, err := os.MkdirTemp("", "kogen-skip-")
          if err != nil {
              return "setup: " + err.Error() + "\n"
          }
          defer os.RemoveAll(dir)
          f, err := os.Create(filepath.Join(dir, "closed"))
          if err != nil {
              return "setup: " + err.Error() + "\n"
          }
          f.Close()
          return fmt.Sprintf("recovered: %v\nflush of a closed file fails: %v\n", r, durable.Sync(f) != nil)
      }

      func skipInNonTestFile() { durable.SkipSyncInTests() }
      """
    Given k-durable-flush-test: the copy has the file "kogenskipdriver/main.go" holding
      """
      package main

      import (
          "fmt"

          "github.com/KogenAI/kogen-coordinator/durable"
      )

      func main() { fmt.Print(attempt(func() { durable.SkipSyncInTests() })) }
      """
    When k-durable-flush-test: "go run ./kogenskipdriver" runs in the copy
    Then k-durable-flush-test: the command succeeds and prints
      """
      recovered: durable.SkipSyncInTests called from non-test file <copy>/kogenskipdriver/main.go
      flush of a closed file fails: true
      """

  Scenario: In a test binary a test file switches syncing off, a non-test helper file is refused by name
    Given k-durable-flush-test: a copy of the repository
    Given k-durable-flush-test: the copy has the file "kogenskipdriver/helper.go" holding
      """
      package main

      import (
          "fmt"
          "os"
          "path/filepath"

          "github.com/KogenAI/kogen-coordinator/durable"
      )

      func attempt(skip func()) string {
          var r any
          func() {
              defer func() { r = recover() }()
              skip()
          }()
          dir, err := os.MkdirTemp("", "kogen-skip-")
          if err != nil {
              return "setup: " + err.Error() + "\n"
          }
          defer os.RemoveAll(dir)
          f, err := os.Create(filepath.Join(dir, "closed"))
          if err != nil {
              return "setup: " + err.Error() + "\n"
          }
          f.Close()
          return fmt.Sprintf("recovered: %v\nflush of a closed file fails: %v\n", r, durable.Sync(f) != nil)
      }

      func skipInNonTestFile() { durable.SkipSyncInTests() }
      """
    Given k-durable-flush-test: the copy has the file "kogenskipdriver/main.go" holding
      """
      package main

      func main() {}
      """
    Given k-durable-flush-test: the copy has the file "kogenskipdriver/skip_test.go" holding
      """
      package main

      import (
          "os"
          "testing"

          "github.com/KogenAI/kogen-coordinator/durable"
      )

      func TestSkipSyncInTestsCallers(t *testing.T) {
          out := "non-test helper:\n" + attempt(skipInNonTestFile) + "test file:\n" + attempt(func() { durable.SkipSyncInTests() })
          if err := os.WriteFile(os.Getenv("KOGEN_SKIP_OUT"), []byte(out), 0o644); err != nil {
              t.Fatal(err)
          }
      }
      """
    When k-durable-flush-test: "go test -count=1 ./kogenskipdriver/" runs in the copy
    Then k-durable-flush-test: the command succeeds and the test wrote
      """
      non-test helper:
      recovered: durable.SkipSyncInTests called from non-test file <copy>/kogenskipdriver/helper.go
      flush of a closed file fails: true
      test file:
      recovered: <nil>
      flush of a closed file fails: false
      """
