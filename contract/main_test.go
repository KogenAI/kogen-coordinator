package contract

import (
	"os"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/durable"
)

// TestMain isolates the process from the caller: no inherited GIT_* or KOGEN_* variable, no
// global or system Git configuration, and a HOME of its own. kogen-coordinator's project
// functions run Git with the process environment, so they need this too. The consumers' test
// mains also switch durable syncing off (kogen cli/buildprogram, kogen-shaping shape,
// kogen-build build).
func TestMain(m *testing.M) {
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") || strings.HasPrefix(k, "KOGEN_") || k == "EMAIL" {
			os.Unsetenv(k)
		}
	}
	home, err := os.MkdirTemp("", "kogen-contract-home-")
	if err != nil {
		panic(err)
	}
	os.Setenv("HOME", home)
	os.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	os.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	os.Setenv("GIT_TERMINAL_PROMPT", "0")
	durable.SkipSyncInTests()
	code := m.Run()
	os.RemoveAll(home)
	os.Exit(code)
}
