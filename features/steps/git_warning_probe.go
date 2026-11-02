package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	git "github.com/KogenAI/kogen-coordinator/git"
)

func main() {
	root, err := os.MkdirTemp("", "git-warning-")
	must(err)
	defer os.RemoveAll(root)
	repo := filepath.Join(root, "repo")
	must(os.Mkdir(repo, 0700))
	env := []string{}
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(kv, "GIT_") && !strings.HasPrefix(kv, "HOME=") && !strings.HasPrefix(kv, "XDG_CONFIG_HOME=") {
			env = append(env, kv)
		}
	}
	env = append(env, "HOME="+root, "XDG_CONFIG_HOME="+root, "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "LC_ALL=C")
	raw := func(args ...string) {
		c := exec.Command("git", args...)
		c.Dir = repo
		c.Env = env
		b, e := c.CombinedOutput()
		if e != nil {
			panic(fmt.Sprintf("git %v: %v %s", args, e, b))
		}
	}
	raw("init", "-q")
	raw("config", "user.name", "Fixture")
	raw("config", "user.email", "fixture@example.invalid")
	raw("config", "commit.gpgsign", "false")
	raw("config", "core.hooksPath", root)
	must(os.WriteFile(filepath.Join(repo, "notes.txt"), []byte("seed\n"), 0600))
	raw("add", "notes.txt")
	raw("commit", "-qm", "seed")
	attrs := filepath.Join(root, "attributes")
	must(os.Symlink("attributes", attrs))
	r := git.New(repo, env).Observing()
	result := map[string]interface{}{}
	for _, state := range []string{"clean", "changed"} {
		if state == "changed" {
			must(os.WriteFile(filepath.Join(repo, "notes.txt"), []byte("edit\n"), 0600))
			must(os.WriteFile(filepath.Join(repo, "untracked.txt"), []byte("new\n"), 0600))
		}
		// Same-size contents and an old mtime force Git to consult attributes,
		// instead of taking a size/stat-cache shortcut. Observing avoids refresh.
		must(os.Chtimes(filepath.Join(repo, "notes.txt"), time.Unix(1, 0), time.Unix(1, 0)))
		statuses := []string{}
		lists := [][]string{}
		warnings := []bool{}
		for _, warning := range []bool{false, true, false} {
			path := "/dev/null"
			if warning {
				path = attrs
			}
			raw("config", "core.attributesFile", path)
			res, e := r.Run("status", "--porcelain=v1", "--untracked-files=all")
			must(e)
			if res.Status != 0 {
				panic(res.Stderr)
			}
			warnings = append(warnings, strings.Contains(res.Stderr, "warning: unable to access '") && strings.Contains(res.Stderr, "attributes"))
			out, e := r.OK("status", "--porcelain=v1", "--untracked-files=all")
			must(e)
			statuses = append(statuses, out)
			paths, e := r.ChangedPaths()
			must(e)
			if paths == nil {
				paths = []string{}
			}
			lists = append(lists, paths)
		}
		result[state] = map[string]interface{}{"statuses": statuses, "paths": lists, "warnings": warnings}
	}
	outside := filepath.Join(root, "outside")
	must(os.Mkdir(outside, 0700))
	bad := git.New(outside, append(env, "GIT_CEILING_DIRECTORIES="+root))
	res, e := bad.Run("status", "--porcelain=v1")
	must(e)
	_, okErr := bad.OK("status", "--porcelain=v1")
	_, pathsErr := bad.ChangedPaths()
	result["failure"] = map[string]bool{"runFailed": res.Status != 0, "diagnostic": res.Stderr != "", "okFailed": okErr != nil, "pathsFailed": pathsErr != nil}
	must(json.NewEncoder(os.Stdout).Encode(result))
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
