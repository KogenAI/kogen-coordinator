package contract

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/KogenAI/kogen-coordinator/route"
)

// routeSteps is route.Steps as kogen-build implements it (build/route.go), reduced to a trace:
// evidence is a pass number, an approval the pass it approves.
type routeSteps struct {
	trace     []string
	green     []bool // each Verify's outcome, in order
	drift     []bool // each restartable Commit's drift, in order
	continues bool
}

func (s *routeSteps) Verify(_ context.Context, builderPass bool) (int, bool, string, error) {
	s.trace = append(s.trace, map[bool]string{true: "verify after builder", false: "verify again"}[builderPass])
	g := s.green[0]
	s.green = s.green[1:]
	return 1, g, map[bool]string{true: "", false: "repair"}[g], nil
}
func (s *routeSteps) Review(context.Context, int) (int, error) {
	s.trace = append(s.trace, "review")
	return 1, nil
}
func (s *routeSteps) Continue(context.Context) (int, error) {
	s.trace = append(s.trace, "continue")
	return 1, nil
}
func (s *routeSteps) Continuable() bool { return s.continues }
func (s *routeSteps) Fresh(_ context.Context, stage string) (int, error) {
	s.trace = append(s.trace, "fresh "+stage)
	return 1, nil
}
func (s *routeSteps) Approved(context.Context) (int, error) {
	s.trace = append(s.trace, "saved approval")
	return 1, nil
}
func (s *routeSteps) Commit(_ context.Context, _ int, restart bool) (bool, error) {
	if !restart {
		s.trace = append(s.trace, "commit once")
		return false, errors.New("refused")
	}
	s.trace = append(s.trace, "commit")
	d := s.drift[0]
	s.drift = s.drift[1:]
	return d, nil
}

// TestRouteCycleAndResume pins the outer routing kogen-build hands its phases to (items
// route-cycle, route-resume, route-stages; kogen-build build/route.go, builder.go
// verifyAndReview and resumeStage): a red pass returns the repair feedback; a green one is
// reviewed and committed; a drifted approval verifies and reviews again; a failed commit is
// finished alone and never restarts; a review-only checkpoint, and a review its reviewer cannot
// continue, get a fresh review; the stage names are the persisted ones.
func TestRouteCycleAndResume(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	s := &routeSteps{green: []bool{false}}
	feedback, landed, err := route.Cycle[int, int](ctx, s, true)
	if err != nil || landed || feedback != "repair" {
		t.Errorf("route-cycle red: %q %v %v", feedback, landed, err)
	}
	s = &routeSteps{green: []bool{true, true}, drift: []bool{true, false}}
	if _, landed, err := route.Cycle[int, int](ctx, s, true); err != nil || !landed {
		t.Errorf("route-cycle green: %v %v", landed, err)
	}
	if want := []string{"verify after builder", "review", "commit", "verify again", "review", "commit"}; !slices.Equal(s.trace, want) {
		t.Errorf("route-cycle drift: %v, want %v", s.trace, want)
	}

	for _, c := range []struct {
		stage     string
		continues bool
		want      []string
	}{
		{route.StageCommitFailed, true, []string{"saved approval", "commit once"}},
		{route.StageReviewOnly, true, []string{"fresh review_only", "review", "commit"}},
		{route.StageReview, true, []string{"continue", "commit"}},
		{route.StageReviewVerify, false, []string{"fresh review_verify", "review", "commit"}},
	} {
		s := &routeSteps{continues: c.continues, drift: []bool{false}}
		err := route.Resume[int, int](ctx, s, c.stage)
		if c.stage == route.StageCommitFailed {
			if err == nil || err.Error() != "refused" {
				t.Errorf("route-resume %s: %v", c.stage, err)
			}
		} else if err != nil {
			t.Errorf("route-resume %s: %v", c.stage, err)
		}
		if !slices.Equal(s.trace, c.want) {
			t.Errorf("route-resume %s: %v, want %v", c.stage, s.trace, c.want)
		}
	}

	stages := []string{route.StageReview, route.StageReviewVerify, route.StageReviewRetry, route.StageReviewOnly, route.StageCommit, route.StageCommitFailed, route.StageLanded}
	if want := []string{"review", "review_verify", "review_retry_verify", "review_only", "commit", "commit_failed", "landed"}; !slices.Equal(stages, want) {
		t.Errorf("route-stages: %v", stages)
	}
}
