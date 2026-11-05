package route

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"
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
	cancelIn   string // the trace prefix of the step call that cancels the run ("" for none)
	cancel     context.CancelFunc
}

// note traces a step call, cancelling the run inside the call chosen by cancelIn.
func (f *fake) note(line string) {
	f.trace = append(f.trace, line)
	if f.cancel != nil && strings.HasPrefix(line, f.cancelIn) {
		f.cancel()
	}
}

func (f *fake) Verify(_ context.Context, builderPass bool) (string, bool, string, error) {
	f.note("verify builder=" + map[bool]string{true: "yes", false: "no"}[builderPass])
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
	f.note("review " + evidence)
	return "approved " + evidence, f.reviewErr
}

func (f *fake) Continue(context.Context) (string, error) {
	f.note("continue")
	return "approved saved", f.reviewErr
}

func (f *fake) Continuable() bool { return f.continuing }

func (f *fake) Fresh(_ context.Context, stage string) (string, error) {
	f.note("fresh " + stage)
	return "base", nil
}

func (f *fake) Approved(context.Context) (string, error) {
	f.note("approved")
	return "approved saved", nil
}

func (f *fake) Commit(_ context.Context, approval string, restart bool) (bool, error) {
	f.note("commit " + approval + map[bool]string{true: "", false: " (no restart)"}[restart])
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

// cancelling is a fake that cancels its run inside the first step call whose trace starts with in.
func cancelling(f *fake, in string) (*fake, context.Context) {
	ctx, cancel := context.WithCancel(context.Background())
	f.cancelIn, f.cancel = in, cancel
	return f, ctx
}

func TestCycleStopsBetweenStepsWhenCancelled(t *testing.T) {
	for _, c := range []struct {
		name string
		in   string
		want []string
	}{
		{"in a green verify", "verify", []string{"verify builder=yes"}},
		{"in review", "review", []string{"verify builder=yes", "review green"}},
		{"in a drifted commit", "commit", []string{"verify builder=yes", "review green", "commit approved green"}},
	} {
		f, ctx := cancelling(&fake{passes: []bool{true, true}, drifts: []bool{true}}, c.in)
		feedback, landed, err := Cycle(ctx, f, true)
		if err != context.Canceled || landed || feedback != "" {
			t.Fatalf("%s: %q %v %v", c.name, feedback, landed, err)
		}
		check(t, f, c.want...)
	}
}

func TestCycleOnACancelledContextStartsNoStep(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	f := &fake{passes: []bool{true}}
	if _, landed, err := Cycle(ctx, f, true); err != context.Canceled || landed {
		t.Fatalf("%v %v", landed, err)
	}
	check(t, f)
}

func TestCycleReturnsThePassedDeadline(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	f := &fake{passes: []bool{true}}
	f.cancel, f.cancelIn = func() { <-ctx.Done() }, "verify"
	if _, landed, err := Cycle(ctx, f, true); err != context.DeadlineExceeded || landed {
		t.Fatalf("%v %v", landed, err)
	}
	check(t, f, "verify builder=yes")
}

func TestCycleLetsACommitInProgressLandAndAnswersARedCandidate(t *testing.T) {
	f, ctx := cancelling(&fake{passes: []bool{true}}, "commit")
	feedback, landed, err := Cycle(ctx, f, true)
	if err != nil || !landed || feedback != "" {
		t.Fatalf("%q %v %v", feedback, landed, err)
	}
	check(t, f, "verify builder=yes", "review green", "commit approved green")
	f, ctx = cancelling(&fake{passes: []bool{false}}, "verify")
	feedback, landed, err = Cycle(ctx, f, true)
	if err != nil || landed || feedback != "fix it" {
		t.Fatalf("%q %v %v", feedback, landed, err)
	}
	check(t, f, "verify builder=yes")
}

func TestCycleStepErrorsTakePrecedenceOverCancellation(t *testing.T) {
	stop := errors.New("candidate/review_blocked")
	f, ctx := cancelling(&fake{passes: []bool{true}, reviewErr: stop}, "review")
	if _, _, err := Cycle(ctx, f, true); err != stop {
		t.Fatal(err)
	}
}

func TestResumeStopsBetweenStepsWhenCancelled(t *testing.T) {
	for _, c := range []struct {
		name       string
		stage      string
		continuing bool
		in         string
		want       []string
	}{
		{"in approved", StageCommitFailed, false, "approved", []string{"approved"}},
		{"in fresh", StageReviewOnly, true, "fresh", []string{"fresh review_only"}},
		{"in review", StageReviewOnly, true, "review", []string{"fresh review_only", "review base"}},
		{"in a drifted review-only commit", StageReviewOnly, true, "commit", []string{"fresh review_only", "review base", "commit approved base"}},
		{"in continue", StageReview, true, "continue", []string{"continue"}},
		{"in a drifted continuing commit", StageReview, true, "commit", []string{"continue", "commit approved saved"}},
		{"in fresh of a reviewer that cannot continue", StageReview, false, "fresh", []string{"fresh review"}},
	} {
		f, ctx := cancelling(&fake{continuing: c.continuing, passes: []bool{true}, drifts: []bool{true}}, c.in)
		if err := Resume(ctx, f, c.stage); err != context.Canceled {
			t.Fatalf("%s: %v", c.name, err)
		}
		check(t, f, c.want...)
	}
}

func TestResumeLetsACommitInProgressLand(t *testing.T) {
	for _, c := range []struct {
		stage string
		want  []string
	}{
		{StageCommitFailed, []string{"approved", "commit approved saved (no restart)"}},
		{StageReviewOnly, []string{"fresh review_only", "review base", "commit approved base"}},
		{StageReview, []string{"continue", "commit approved saved"}},
	} {
		f, ctx := cancelling(&fake{continuing: true}, "commit")
		if err := Resume(ctx, f, c.stage); err != nil {
			t.Fatalf("%s: %v", c.stage, err)
		}
		check(t, f, c.want...)
	}
}

func TestResumeOnACancelledContextStartsNoStep(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, stage := range []string{StageCommitFailed, StageReviewOnly, StageReview} {
		f := &fake{continuing: true}
		if err := Resume(ctx, f, stage); err != context.Canceled {
			t.Fatalf("%s: %v", stage, err)
		}
		check(t, f)
	}
}
