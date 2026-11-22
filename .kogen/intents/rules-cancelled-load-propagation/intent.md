# Return the context error from cancelled rules

Slug: rules-cancelled-load-propagation
Model: not applicable — the change adds one early return of the context error to a single request path; it introduces no state, retry or interacting rule
Acceptance:
- .kogen/intents/rules-cancelled-load-propagation/acceptance.feature
- features/steps/rules-cancelled-load-propagation__driver.js

`rules.Load(ctx, root, opts)` (`rules/rules.go`) asks Studio for the scoped rules. Today `fetch` treats every `client.Do` error as the outage reason `unreachable`, so a request whose context was cancelled or whose deadline expired is answered like an outage: from the verified cache, or with a `rules/hold` or `rules/unavailable` failure by `on_unavailable`.

After this change, when the request context is cancelled or its deadline has expired, `Load` returns that context error itself, unwrapped (`context.Canceled` with the text `context canceled`, `context.DeadlineExceeded` with the text `context deadline exceeded`), and no snapshot. It does not read or use the outage cache, and it does not convert the cancellation into a rules failure class (the returned error is not a `*rules.Error`). This holds when the context is already done before `Load` asks Studio (then no HTTP request is made) and when it ends while the request or the response body read is in flight, even when a valid same-scope cache exists.

Ordinary network outages keep their current behavior: a transport error while the context is still live is `unreachable`, which returns the verified same-scope cache as origin `cached` with that reason, or else the `hold` or `unavailable` failure. Out of scope and unchanged: the cache format, HTTP status handling, configuration, and consumer packages. Only `rules/rules.go` and `rules/rules_test.go` change; the README needs no change because the outage rules it states are unchanged.

Acceptance builds (`go build -o`) and runs a Go driver that the step file generates in a temporary dot-prefixed folder of the module (removed when the acceptance process exits). The driver starts a local `httptest` Studio, writes the team configuration, loads once live so a valid cache exists, and then runs one case: `cancelled-before-load`, `deadline-expired` (the handler blocks until the request context ends and the load has a short deadline), `cancelled-during-request` (the handler blocks and the context is cancelled once it entered) or `network-outage` (an ordinary network failure, produced by closing the Studio server).

## Decisions
- When the request context is cancelled or its deadline has expired, Load returns that context error and no snapshot (decision: D1, round 1) (evidence: rules/rules.go; README.md) (source: request)
- The context error is returned unwrapped, as ctx.Err(), so its text is `context canceled` or `context deadline exceeded` and it is not a *rules.Error (decision: D2, round 1) (evidence: rules/rules.go)  rather than a wrapped error) (assumption: the caller accepts the bare ctx.Err() (source: request)
- Load does not use the outage cache and does not convert cancellation into a rules failure class, even when a valid cache exists (decision: D3, round 1) (evidence: rules/rules.go; README.md) (source: request)
- A context that is already done makes no HTTP request, and a context that ends during the request or the body read also yields the context error (decision: D4, round 1) (evidence: rules/rules.go) (assumption: cancellation during an in-flight request follows the same rule as before the request) (source: request)
- Ordinary network failures with a live context keep their current fallback: the verified cache with reason unreachable, else the configured failure class (decision: D5, round 1) (evidence: rules/rules.go; rules/rules_test.go) (source: request)
- Cache format, HTTP status handling, configuration and consumer packages stay unchanged; only rules/rules.go and rules/rules_test.go change (decision: D6, round 1) (evidence: rules/rules.go; rules/rules_test.go) (source: request)

## Source comparison
- Request acceptance 1 (valid cache, context cancelled before Load, returns context.Canceled, no snapshot, no HTTP request): scenario "A load with an already cancelled context returns context.Canceled and asks Studio for nothing" (`cancelled-before-load`, requests 0).
- Request acceptance 2 (handler blocks until the request context ends, deadline-expired Load returns context.DeadlineExceeded and no snapshot, even with a valid cache): scenario "A load whose deadline expires while Studio holds the request returns context.DeadlineExceeded".
- Request acceptance 3 (ordinary network failure with a valid cache still returns the cached snapshot with the outage reason): scenario "An ordinary network failure still returns the cached snapshot with the outage reason" (origin `cached`, fallback_reason `unreachable`).
- Request "Expected" (cancelled or deadline-expired context returns that error, does not use the cache or a failure class): all four scenarios; the cancel-while-in-flight case is the same rule applied to a request already sent (scenario "A load cancelled while Studio holds the request returns context.Canceled").
- Request scope and out-of-scope list: prose and D6.

## Tests
- Context already cancelled: Load returns context.Canceled, no snapshot and no HTTP request despite a valid cache: new test in `rules/rules_test.go` (integration)
- Deadline expired while the handler blocks: Load returns context.DeadlineExceeded and no snapshot despite a valid cache: new test in `rules/rules_test.go` (integration)
- Cancellation during an in-flight request returns context.Canceled and is not a `*rules.Error`: new test in `rules/rules_test.go` (integration)
- Ordinary network failure keeps the cached snapshot with the reason unreachable: `TestUnreachable` and new cache-present case in `rules/rules_test.go` (integration)
- The requested behavior through the public `rules.Load` entry point in a separate program: acceptance scenarios with the generated driver (scenario)
- Other outage, refusal and cache behavior unchanged: existing tests in `rules/rules_test.go` (existing)

## Feasibility
- Scratch clone of HEAD outside the checkout (external-session observations, not Kogen probe records): on today's code every context case returns the cached snapshot with reason unreachable, as readiness also observed; with the correct overlay of controls.json the driver observes exactly the expected outcomes and `go test ./rules` passes unchanged. The recorded good and bad observations of the step file come from those two runs, and each of the five wrong overlays was observed to get its scenario wrong.
- evidence: {"id":"load-driver-observer","kind":"observer","inputs":[".kogen/intents/rules-cancelled-load-propagation/acceptance.feature"],"observers":["features/steps/rules-cancelled-load-propagation__driver.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/rules-cancelled-load-propagation__driver.js good","exit":0,"output":"accepted cancelled-before-load\naccepted deadline-expired\naccepted cancelled-during-request\naccepted network-outage\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/rules-cancelled-load-propagation__driver.js bad","exit":1,"output":"rejected cancelled-before-load\nrejected deadline-expired\nrejected cancelled-during-request\naccepted network-outage\n"}]}
