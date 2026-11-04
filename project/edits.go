package project

import "strings"

// ownedFolder is the folder of the Intent's promoted model, relative to the repository root.
func ownedFolder(slug string) string { return ".kogen/models/" + slug + "/" }

// OwnedByIntent reports whether the repository-relative, slash-separated path is one of the
// Intent slug's own files: under `.kogen/intents/<slug>/` or `.kogen/models/<slug>/`. The prefix
// match is byte-exact, including the final `/`, so another slug sharing leading characters is
// not owned. It touches neither the filesystem nor Git.
func OwnedByIntent(slug, path string) bool {
	return strings.HasPrefix(path, IntentDir(slug)+"/") || strings.HasPrefix(path, ownedFolder(slug))
}

// BuildEdits is a Build's edit list: the paths of changed (the list git.Repo.Changed returns
// between the Build's start tree and its candidate tree) that are not the Intent's own, in their
// order. An interrupted Build discards these paths, so the approved Intent's files and its
// promoted model stay out of it.
func BuildEdits(slug string, changed []string) []string {
	edits := make([]string, 0, len(changed))
	for _, p := range changed {
		if !OwnedByIntent(slug, p) {
			edits = append(edits, p)
		}
	}
	return edits
}
