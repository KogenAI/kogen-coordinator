// Package route is the outer routing of a Build's candidate through its phases: verification,
// independent review (with the reviewer's own repairs), the repair of a red candidate by its
// implementer, and commit, and the resume of a Build stopped at one of those steps.
//
// The phases are reached only through Steps, their narrow interfaces as the routing drives them.
// Route keeps no phase state: the implementer keeps its loop and its feedback policy, the
// reviewer its conversation and retries, the commit its guards. What route decides is the order
// of the steps, where a candidate goes after each, and where a stopped Build continues.
package route

import (
	"context"
	"fmt"
)

// The checkpoint stages of the routed steps, as a Build's checkpoint records them (the bytes of
// persisted state: never renamed).
const (
	// StageReview is a review conversation in progress; StageReviewVerify a submitted verdict
	// being judged (its repairs verified); StageReviewRetry the explicit resume of a blocked
	// review, continuing after fresh verification.
	StageReview       = "review"
	StageReviewVerify = "review_verify"
	StageReviewRetry  = "review_retry_verify"
	// StageReviewOnly is a green candidate whose reviews ended without a valid verdict: an
	// explicit resume starts a fresh review of that exact tree.
	StageReviewOnly = "review_only"
	// StageCommit is the commit boundary (not resumable); StageCommitFailed a commit that
	// definitely failed with the approved candidate intact; StageLanded a landed Build.
	StageCommit       = "commit"
	StageCommitFailed = "commit_failed"
	StageLanded       = "landed"
)

// Steps are the phases of one Build as the routing drives them. E is the verification evidence
// of a candidate (a pass); A is an approval: the evidence a review approved and its record.
type Steps[E, A any] interface {
	// Verify verifies the current candidate. A red candidate is not reviewed: feedback is what
	// goes back to its implementer for repair. builderPass: the pass follows an implementer
	// round (not a restart after an approval whose candidate drifted).
	Verify(ctx context.Context, builderPass bool) (evidence E, green bool, feedback string, err error)
	// Review is a fresh independent review of green evidence, with the review phase's own
	// handling of a review that ends without a valid verdict.
	Review(ctx context.Context, evidence E) (A, error)
	// Continue continues the review a checkpoint stopped in.
	Continue(ctx context.Context) (A, error)
	// Continuable reports whether the reviewer can continue its saved session; one that cannot
	// (resume capability none) is replaced by a fresh review of the green evidence its session
	// started from.
	Continuable() bool
	// Fresh prepares the fresh review of a stopped review's saved green evidence (a review-only
	// checkpoint, or the review stage of a reviewer that cannot continue) and returns that
	// evidence.
	Fresh(ctx context.Context, stage string) (E, error)
	// Approved is the saved approval of a commit_failed checkpoint.
	Approved(ctx context.Context) (A, error)
	// Commit commits an approval. Drifted: the candidate is no longer the approved tree, and
	// nothing was committed. With restart false a drifted candidate is the phase's refusal (an
	// error), never a new cycle.
	Commit(ctx context.Context, approval A, restart bool) (drifted bool, err error)
}

// Cycle routes the current candidate: verify it; a red candidate goes back to its implementer
// with the feedback for its repair (landed false); a green one is reviewed and what the review
// approves is committed (landed true). An approval whose candidate drifted before its commit
// starts the cycle over with a fresh verification. The context is checked between steps: before
// each Verify, Review and Commit a cancelled context ends the cycle with its error (unwrapped) and
// no further step starts; a step already running is never interrupted.
func Cycle[E, A any](ctx context.Context, s Steps[E, A], builderPass bool) (feedback string, landed bool, err error) {
	for {
		if err := ctx.Err(); err != nil {
			return "", false, err
		}
		evidence, green, feedback, err := s.Verify(ctx, builderPass)
		if err != nil {
			return "", false, err
		}
		if !green {
			return feedback, false, nil
		}
		if err := ctx.Err(); err != nil {
			return "", false, err
		}
		approval, err := s.Review(ctx, evidence)
		if err != nil {
			return "", false, err
		}
		if err := ctx.Err(); err != nil {
			return "", false, err
		}
		drifted, err := s.Commit(ctx, approval, true)
		if err != nil {
			return "", false, err
		}
		if !drifted {
			return "", true, nil
		}
		builderPass = false
	}
}

// Resume continues a Build whose checkpoint stopped at a routed step: stage is commit_failed,
// review_only or a review stage (the implementer's own stages are its own). A failed commit is
// finished alone, with no review and no rerun of its checks; a review-only checkpoint, and the
// review of a reviewer that cannot continue its session, get a fresh review of their saved green
// evidence; any other review continues. What the review approves is committed, and a resumed
// Build must land: a red candidate after a drifted approval is an error. As in Cycle, the context
// is checked between steps, before each Approved, Fresh, Review, Continue and Commit: a cancelled
// context returns its error (unwrapped) and starts no further step; a step already running, a
// commit included, is never interrupted.
func Resume[E, A any](ctx context.Context, s Steps[E, A], stage string) error {
	var approval A
	var err error
	switch {
	case stage == StageCommitFailed:
		if err = ctx.Err(); err != nil {
			return err
		}
		if approval, err = s.Approved(ctx); err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		_, err = s.Commit(ctx, approval, false)
		return err
	case stage == StageReviewOnly || !s.Continuable():
		var evidence E
		if err = ctx.Err(); err != nil {
			return err
		}
		if evidence, err = s.Fresh(ctx, stage); err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		approval, err = s.Review(ctx, evidence)
	default:
		if err = ctx.Err(); err != nil {
			return err
		}
		approval, err = s.Continue(ctx)
	}
	if err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	drifted, err := s.Commit(ctx, approval, true)
	if err != nil || !drifted {
		return err
	}
	feedback, landed, err := Cycle(ctx, s, false)
	if err != nil {
		return err
	}
	if !landed {
		return fmt.Errorf("candidate changed after review in a resumed commit: %s", feedback)
	}
	return nil
}
