package project

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestRunCheckBaselineRecordsTimings(t *testing.T) {
	checks := []Check{{"a", "cmd a"}, {"b", "cmd b"}, {"c", "cmd c"}}
	results := map[string]struct {
		status int
		out    string
	}{"a": {0, "A\n"}, "b": {3, "B\n"}, "c": {0, ""}}
	var ran []string
	run := func(ctx context.Context, c Check) (int, string, error) {
		ran = append(ran, c.Name)
		time.Sleep(20 * time.Millisecond)
		r := results[c.Name]
		return r.status, r.out, nil
	}
	rec, err := RunCheckBaseline(context.Background(), checks, run)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(ran, ",") != "a,b,c" || len(rec.Checks) != 3 || len(rec.Timings) != 3 {
		t.Fatalf("ran %v, record %+v", ran, rec)
	}
	var sum int64
	prevEnd := rec.StartedAt
	for i, c := range checks {
		r, tm := rec.Checks[i], rec.Timings[i]
		want := results[c.Name]
		if r != (CheckResult{Name: c.Name, Command: c.Run, Status: want.status, Output: want.out}) || tm.Name != c.Name {
			t.Fatalf("check %d: %+v %+v", i, r, tm)
		}
		if tm.WallMS < 20 || tm.WallMS != tm.EndedAt.Sub(tm.StartedAt).Milliseconds() {
			t.Fatalf("wall of %s: %+v", c.Name, tm)
		}
		if tm.StartedAt.Before(prevEnd) || tm.EndedAt.After(rec.EndedAt) || tm.StartedAt.Location() != time.UTC {
			t.Fatalf("interval of %s: %+v in %+v", c.Name, tm, rec)
		}
		prevEnd = tm.EndedAt
		sum += tm.WallMS
	}
	if rec.StartedAt.Location() != time.UTC || rec.EndedAt.Location() != time.UTC {
		t.Fatalf("instants are not UTC: %+v", rec)
	}
	if d := rec.WallMS - sum; d < 0 || d > 20 {
		t.Fatalf("baseline wall %d, checks %d", rec.WallMS, sum)
	}
	b, _ := json.Marshal(rec)
	if !strings.Contains(string(b), `"started_at":"`) || !strings.Contains(string(b), `Z"`) {
		t.Fatalf("json: %s", b)
	}
}

func TestRunCheckBaselineEmpty(t *testing.T) {
	rec, err := RunCheckBaseline(context.Background(), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(rec)
	if !strings.Contains(string(b), `"checks":[]`) || !strings.Contains(string(b), `"timings":[]`) {
		t.Fatalf("json: %s", b)
	}
}

func TestRunCheckBaselineStopsWhenContextEnds(t *testing.T) {
	for _, tc := range []struct {
		name string
		ctx  func() (context.Context, context.CancelFunc)
		want error
		text string
	}{
		{"deadline", func() (context.Context, context.CancelFunc) {
			return context.WithTimeout(context.Background(), 50*time.Millisecond)
		}, context.DeadlineExceeded, "context deadline exceeded"},
		{"cancel", func() (context.Context, context.CancelFunc) {
			ctx, cancel := context.WithCancel(context.Background())
			time.AfterFunc(50*time.Millisecond, cancel)
			return ctx, cancel
		}, context.Canceled, "context canceled"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := tc.ctx()
			defer cancel()
			var ran []string
			run := func(ctx context.Context, c Check) (int, string, error) {
				ran = append(ran, c.Name)
				if c.Name == "slow" {
					<-ctx.Done()
					return 0, "", ctx.Err() // whatever run returns
				}
				return 0, "ok", nil
			}
			rec, err := RunCheckBaseline(ctx, []Check{{"fast", "true"}, {"slow", "sleep 5"}, {"never", "true"}}, run)
			var stop *BaselineStop
			if !errors.As(err, &stop) || err == tc.want || !errors.Is(err, tc.want) {
				t.Fatalf("err %#v", err)
			}
			if strings.Join(ran, ",") != "fast,slow" {
				t.Fatalf("ran %v", ran)
			}
			if stop.Check != "slow" || stop.Command != "sleep 5" || stop.WallMS < 40 || stop.WallMS != stop.StoppedAt.Sub(stop.StartedAt).Milliseconds() {
				t.Fatalf("stop %+v", stop)
			}
			if want := "stopped during the check baseline: check slow (sleep 5) ran " + itoa(stop.WallMS) + " ms: " + tc.text; err.Error() != want {
				t.Fatalf("text %q, want %q", err.Error(), want)
			}
			if len(rec.Checks) != 1 || rec.Checks[0].Name != "fast" || len(rec.Timings) != 1 || !rec.EndedAt.Equal(stop.StoppedAt) {
				t.Fatalf("record %+v", rec)
			}
		})
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }

func TestRunCheckBaselineRunnerErrorWhileLive(t *testing.T) {
	boom := errors.New("cannot start")
	run := func(ctx context.Context, c Check) (int, string, error) {
		if c.Name == "b" {
			return 0, "", boom
		}
		return 0, "ok", nil
	}
	rec, err := RunCheckBaseline(context.Background(), []Check{{"a", "a"}, {"b", "b"}, {"c", "c"}}, run)
	if err != boom {
		t.Fatalf("err %v", err)
	}
	if len(rec.Checks) != 1 || len(rec.Timings) != 1 || rec.EndedAt.Before(rec.Timings[0].EndedAt) {
		t.Fatalf("record %+v", rec)
	}
}
