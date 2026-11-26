package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/KogenAI/kogen-coordinator/route"
)

// steps records every method invocation, including the capability query.
type steps struct {
	calls       []string
	continuable bool
}

func (s *steps) Verify(context.Context, bool) (string, bool, string, error) {
	s.calls = append(s.calls, "verify")
	return "verified", true, "", nil
}

func (s *steps) Review(_ context.Context, evidence string) (string, error) {
	s.calls = append(s.calls, "review "+evidence)
	return "approved " + evidence, nil
}

func (s *steps) Continue(context.Context) (string, error) {
	s.calls = append(s.calls, "continue")
	return "approved saved", nil
}

func (s *steps) Continuable() bool {
	s.calls = append(s.calls, "continuable")
	return s.continuable
}

func (s *steps) Fresh(_ context.Context, stage string) (string, error) {
	s.calls = append(s.calls, "fresh "+stage)
	return "base", nil
}

func (s *steps) Approved(context.Context) (string, error) {
	s.calls = append(s.calls, "approved")
	return "approved saved", nil
}

func (s *steps) Commit(_ context.Context, approval string, restart bool) (bool, error) {
	call := "commit " + approval
	if !restart {
		call += " (no restart)"
	}
	s.calls = append(s.calls, call)
	return false, nil
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: resume-driver STAGE CONTINUABLE")
		os.Exit(2)
	}
	continuable, err := strconv.ParseBool(os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	s := &steps{calls: []string{}, continuable: continuable}
	var message *string
	if err := route.Resume(context.Background(), s, os.Args[1]); err != nil {
		text := err.Error()
		message = &text
	}
	if err := json.NewEncoder(os.Stdout).Encode(struct {
		Error *string  `json:"error"`
		Calls []string `json:"calls"`
	}{message, s.calls}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
}
