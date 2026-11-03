Feature: Canonical loop module dependency
  Scenario: Pin real main without a replacement or workspace
    Then k-coordinator-loop-module-path: command succeeds
      """
      go mod edit -json | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const m=JSON.parse(s);process.exit((m.Require||[]).some(r=>r.Path==="github.com/KogenAI/kogen-loop"&&r.Version==="v0.0.0-20261103215300-3e292bb34b90")&&!(m.Require||[]).some(r=>r.Path==="kogen-loop")&&!(m.Replace||[]).some(r=>/^(kogen-loop|github.com\/KogenAI\/kogen-loop)$/.test(r.Old.Path))?0:1)})'
      """
    Then k-coordinator-loop-module-path: command succeeds
      """
      test ! -e go.work && grep -q '^github.com/KogenAI/kogen-loop v0.0.0-20261103215300-3e292bb34b90 h1:' go.sum && grep -q '^github.com/KogenAI/kogen-loop v0.0.0-20261103215300-3e292bb34b90/go.mod h1:' go.sum
      """

  Scenario: Remove bare imports everywhere they are compiled
    Then k-coordinator-loop-module-path: command succeeds
      """
      if grep -rn '"kogen-loop/' --include='*.go' --include='*.go.txt' --include='*.js' .; then exit 1; else test "$?" -eq 1; fi
      """

  Scenario: Preserve existing behavior
    Then k-coordinator-loop-module-path: command succeeds
      """
      go build ./... && go vet ./... && go test ./...
      """
