// Package rules loads a scoped rule snapshot from the Studio rules read, so Shape, Build and
// Review call one producer for authentication, caching and precedence. Rule text is advisory
// data: nothing in this package approves, skips checks or changes protected paths.
package rules

import (
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// ConfigPath is the committed team file that configures the Studio rules read.
const ConfigPath = ".kogen/studio-rules.yaml"

// Error classes of this package.
const (
	ClassConfigInvalid = "environment/project_config_invalid"
	ClassHold          = "rules/hold"
	ClassUnavailable   = "rules/unavailable"
	ClassRefused       = "rules/refused"
)

// ErrNotConfigured is returned when the project has no ConfigPath: standalone execution.
var ErrNotConfigured = errors.New("studio rules are not configured: no " + ConfigPath)

// Error is a classified failure. Its text never contains a token or a configuration value.
type Error struct {
	Class  string
	Reason string
}

func (e *Error) Error() string { return e.Class + ": " + e.Reason }

// Config is the content of ConfigPath.
type Config struct {
	URL           string
	WorkspaceID   string
	ProductID     string
	Repo          string
	TokenEnv      string
	OnUnavailable string
}

var configKeys = []string{"version", "url", "workspace_id", "product_id", "repo", "token_env", "on_unavailable"}

// LoadConfig reads ConfigPath under root. An absent file is ErrNotConfigured; an unknown,
// missing or invalid key is a *Error of class environment/project_config_invalid naming the file
// and the key, never the value.
func LoadConfig(root string) (Config, error) {
	path := filepath.Join(root, filepath.FromSlash(ConfigPath))
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return Config{}, ErrNotConfigured
	}
	if err != nil {
		return Config{}, invalid(path, "", "cannot be read")
	}
	text := strings.TrimPrefix(string(data), "\xef\xbb\xbf")
	values := map[string]string{}
	var order []string
	for i, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		if line[0] == ' ' || line[0] == '\t' {
			return Config{}, invalid(path, "", fmt.Sprintf("line %d: indented content is not supported", i+1))
		}
		key, value, ok := strings.Cut(line, ":")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return Config{}, invalid(path, "", fmt.Sprintf("line %d: expected key: value", i+1))
		}
		if !knownKey(key) {
			return Config{}, invalid(path, key, "unknown key")
		}
		if _, dup := values[key]; dup {
			return Config{}, invalid(path, key, "duplicate key")
		}
		v, vok := scalar(value)
		if !vok {
			return Config{}, invalid(path, key, "invalid value")
		}
		values[key] = v
		order = append(order, key)
	}
	for _, key := range configKeys {
		if values[key] == "" {
			return Config{}, invalid(path, key, "missing or empty")
		}
	}
	if order[0] != "version" {
		return Config{}, invalid(path, "version", "must be the first key")
	}
	if values["version"] != "1" {
		return Config{}, invalid(path, "version", "must be 1")
	}
	u, err := url.Parse(values["url"])
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return Config{}, invalid(path, "url", "must be an http or https base URL")
	}
	if p := values["on_unavailable"]; p != "hold" && p != "unavailable" {
		return Config{}, invalid(path, "on_unavailable", "must be hold or unavailable")
	}
	return Config{
		URL:           strings.TrimRight(values["url"], "/"),
		WorkspaceID:   values["workspace_id"],
		ProductID:     values["product_id"],
		Repo:          values["repo"],
		TokenEnv:      values["token_env"],
		OnUnavailable: values["on_unavailable"],
	}, nil
}

func knownKey(key string) bool {
	for _, k := range configKeys {
		if k == key {
			return true
		}
	}
	return false
}

// scalar reads a plain or quoted one-line scalar with an optional trailing comment.
func scalar(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", true
	}
	if s[0] == '"' || s[0] == '\'' {
		end := strings.IndexByte(s[1:], s[0])
		if end < 0 {
			return "", false
		}
		rest := strings.TrimSpace(s[end+2:])
		if rest != "" && !strings.HasPrefix(rest, "#") {
			return "", false
		}
		return s[1 : end+1], true
	}
	if i := strings.Index(s, " #"); i >= 0 {
		s = strings.TrimSpace(s[:i])
	}
	return s, true
}

func invalid(path, key, what string) error {
	reason := path
	if key != "" {
		reason += ": key " + key
	}
	return &Error{Class: ClassConfigInvalid, Reason: reason + ": " + what}
}
