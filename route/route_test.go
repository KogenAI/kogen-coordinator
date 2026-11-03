package route

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
)

// fake is Steps over a scripted Build: evidence is the candidate's tree, an approval the tree it
// approves. Every call is traced in order.
type fake struct {
	trace      []string
	passes     []bool // the green of each Verify, in order
	drifts     []bool // the drift of each Commit with restart, in order
	reviewErr  error  // the error of every Review and Continue
	verifyErr  error  // the error of every Verify
	continuing bool   // Continuable
	refuse     bool   // a drift with restart false
	pass       int    // Verify calls so far
}

func (f *fake) Verify(_ context.Context, builderPass bool) (string, bool, string, error) {
	f.trace = append(f.trace, "verify builder="+map[bool]string{true: "yes", false: "no"}[builderPass])
	if f.verifyErr != nil {
		return "", false, "", f.verifyErr
	}
	green := f.passes[f.pass]
	f.pass++
	if !green {
		return "red", false, "fix it", nil
	}
	return "green", true, "", nil
}

func (f *fake) Review(_ context.Context, evidence string) (string, error) {
	f.trace = append(f.trace, "review "+evidence)
	return "approved " + evidence, f.reviewErr
}

func (f *fake) Continue(context.Context) (string, error) {
	f.trace = append(f.trace, "continue")
	return "approved saved", f.reviewErr
}

func (f *fake) Continuable() bool { return f.continuing }

func (f *fake) Fresh(_ context.Context, stage string) (string, error) {
	f.trace = append(f.trace, "fresh "+stage)
	return "base", nil
}

func (f *fake) Approved(context.Context) (string, error) {
	f.trace = append(f.trace, "approved")
	return "approved saved", nil
}

func (f *fake) Commit(_ context.Context, approval string, restart bool) (bool, error) {
	f.trace = append(f.trace, "commit "+approval+map[bool]string{true: "", false: " (no restart)"}[restart])
	if !restart {
		if f.refuse {
			return false, errors.New("refused")
		}
		return false, nil
	}
	drift := len(f.drifts) > 0 && f.drifts[0]
	if len(f.drifts) > 0 {
		f.drifts = f.drifts[1:]
	}
	return drift, nil
}

func check(t *testing.T, f *fake, want ...string) {
	t.Helper()
	if !slices.Equal(f.trace, want) {
		t.Fatalf("steps\n got: %s\nwant: %s", strings.Join(f.trace, " | "), strings.Join(want, " | "))
	}
}

func TestCycleReturnsARedCandidateToItsImplementer(t *testing.T) {
	f := &fake{passes: []bool{false}}
	feedback, landed, err := Cycle(context.Background(), f, true)
	if err != nil || landed || feedback != "fix it" {
		t.Fatalf("%q %v %v", feedback, landed, err)
	}
	check(t, f, "verify builder=yes")
}

func TestCycleReviewsAndCommitsAGreenCandidate(t *testing.T) {
	f := &fake{passes: []bool{true}}
	feedback, landed, err := Cycle(context.Background(), f, true)
	if err != nil || !landed || feedback != "" {
		t.Fatalf("%q %v %v", feedback, landed, err)
	}
	check(t, f, "verify builder=yes", "review green", "commit approved green")
}

func TestCycleStartsOverWhenTheApprovedCandidateDrifted(t *testing.T) {
	f := &fake{passes: []bool{true, true, false}, drifts: []bool{true, true}}
	feedback, landed, err := Cycle(context.Background(), f, true)
	if err != nil || landed || feedback != "fix it" {
		t.Fatalf("%q %v %v", feedback, landed, err)
	}
	check(t, f, "verify builder=yes", "review green", "commit approved green",
		"verify builder=no", "review green", "commit approved green", "verify builder=no")
}

func TestCycleStopsAtAStep(t *testing.T) {
	stop := errors.New("candidate/review_blocked")
	f := &fake{passes: []bool{true}, reviewErr: stop}
	if _, landed, err := Cycle(context.Background(), f, true); err != stop || landed {
		t.Fatalf("%v %v", landed, err)
	}
	check(t, f, "verify builder=yes", "review green")
	f = &fake{verifyErr: stop}
	if _, _, err := Cycle(context.Background(), f, false); err != stop {
		t.Fatal(err)
	}
	check(t, f, "verify builder=no")
}

func TestResumeFinishesAFailedCommitAlone(t *testing.T) {
	f := &fake{}
	if err := Resume(context.Background(), f, StageCommitFailed); err != nil {
		t.Fatal(err)
	}
	check(t, f, "approved", "commit approved saved (no restart)")
	f = &fake{refuse: true}
	if err := Resume(context.Background(), f, StageCommitFailed); err == nil || err.Error() != "refused" {
		t.Fatal(err)
	}
}

func TestResumeOfAReviewOnlyCheckpointIsAFreshReview(t *testing.T) {
	f := &fake{continuing: true}
	if err := Resume(context.Background(), f, StageReviewOnly); err != nil {
		t.Fatal(err)
	}
	check(t, f, "fresh review_only", "review base", "commit approved base")
}

func TestResumeContinuesAReviewItsReviewerCanContinue(t *testing.T) {
	for _, stage := range []string{StageReview, StageReviewVerify, StageReviewRetry} {
		f := &fake{continuing: true}
		if err := Resume(context.Background(), f, stage); err != nil {
			t.Fatal(err)
		}
		check(t, f, "continue", "commit approved saved")
	}
}

func TestResumeReplacesAReviewItsReviewerCannotContinue(t *testing.T) {
	f := &fake{}
	if err := Resume(context.Background(), f, StageReviewVerify); err != nil {
		t.Fatal(err)
	}
	check(t, f, "fresh review_verify", "review base", "commit approved base")
}

func TestResumedApprovalWhoseCandidateDriftedMustLand(t *testing.T) {
	f := &fake{continuing: true, passes: []bool{true}, drifts: []bool{true, false}}
	if err := Resume(context.Background(), f, StageReview); err != nil {
		t.Fatal(err)
	}
	check(t, f, "continue", "commit approved saved", "verify builder=no", "review green", "commit approved green")
	f = &fake{continuing: true, passes: []bool{false}, drifts: []bool{true}}
	err := Resume(context.Background(), f, StageReview)
	if err == nil || err.Error() != "candidate changed after review in a resumed commit: fix it" {
		t.Fatal(err)
	}
}

func TestStagesAreThePersistedNames(t *testing.T) {
	got := []string{StageReview, StageReviewVerify, StageReviewRetry, StageReviewOnly, StageCommit, StageCommitFailed, StageLanded}
	want := []string{"review", "review_verify", "review_retry_verify", "review_only", "commit", "commit_failed", "landed"}
	if !slices.Equal(got, want) {
		t.Fatalf("%v", got)
	}
}
