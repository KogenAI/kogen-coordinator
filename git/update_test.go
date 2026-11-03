package git

import "flag"

// update is registered here only so that `go test ./... -update` is accepted in every package
// with tests. This package has no golden files, so it has no effect here.
var update = flag.Bool("update", false, "rewrite drifted golden files (no effect in this package)")
