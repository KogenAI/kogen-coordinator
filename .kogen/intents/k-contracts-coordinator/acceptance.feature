Feature: kogen-coordinator pins what its consumers use in its own contract suite
  kogen-coordinator's contract/ package is a Go test suite that pins the exported API its consumers
  (kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build) call, the behaviours they
  rely on and the file and wire formats they read or write, with cases copied and adapted from the
  consumers' own tests and synthetic fixtures only. It runs in the ordinary `go test ./...`, offline
  and fast, without the consumer repositories, so an interface change fails in kogen-coordinator first.

  Scenario: The contract suite passes offline and fast in the ordinary go test run
    When I run the kogen-coordinator contract suite offline
    Then the coordinator contract suite run observations are:
      """
      {"exit":0,"build_failed":false,"packages_not_passed":[],"tests_failed":[],"tests_skipped":[],"ran_tests":true,"packages_over_30_seconds":[],"not_in_go_list_all":[],"build_constraints":[]}
      """

  Scenario: The contract suite uses and lists every kogen-coordinator member a consumer uses
    Given the kogen-coordinator members its consumers use are:
      | member | consumers |
      | durable.SkipSyncInTests | kogen, kogen-shaping, kogen-build |
      | durable.Sync | kogen-shaping, kogen-build |
      | git.AcquireBuild | kogen-shaping, kogen-build |
      | git.Acquired | kogen-build |
      | git.BuildLockPath | kogen-shaping, kogen-build |
      | git.CommandError | kogen-shaping |
      | git.CommandError.Args | kogen-shaping |
      | git.CommandError.Output | kogen-shaping |
      | git.CommandError.Status | kogen-shaping |
      | git.CommitSpec | kogen-build |
      | git.CommitSpec.MessageFile | kogen-build |
      | git.CommitSpec.Slug | kogen-build |
      | git.CommitSpec.Start | kogen-build |
      | git.CommitSpec.Title | kogen-build |
      | git.CommitSpec.Tree | kogen-build |
      | git.Lock.Acquire | kogen, kogen-shaping, kogen-build |
      | git.Lock.Held | kogen-shaping |
      | git.Lock.Release | kogen, kogen-shaping, kogen-build |
      | git.Lock.Token | kogen |
      | git.LockOwner | kogen, kogen-build |
      | git.LockResult.Status | kogen-build |
      | git.Materialized | kogen-verification |
      | git.Materialized.Mutations | kogen-verification |
      | git.New | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | git.NewLock | kogen, kogen-shaping, kogen-build |
      | git.Open | kogen-shaping, kogen-build |
      | git.OpenReadOnly | kogen |
      | git.Pin | kogen-shaping |
      | git.Pin.Changes | kogen-shaping |
      | git.Repo | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | git.Repo.At | kogen-verification, kogen-shaping |
      | git.Repo.CanCommit | kogen, kogen-build |
      | git.Repo.Changed | kogen-verification, kogen-shaping, kogen-build |
      | git.Repo.ChangedPaths | kogen-shaping, kogen-build |
      | git.Repo.CheckCommitMsg | kogen-build |
      | git.Repo.Commit | kogen-build |
      | git.Repo.CommitPaths | kogen-shaping |
      | git.Repo.Diff | kogen-build |
      | git.Repo.Dir | kogen, kogen-shaping, kogen-build |
      | git.Repo.GitDir | kogen-shaping |
      | git.Repo.Head | kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | git.Repo.Identity | kogen-shaping |
      | git.Repo.IndexPath | kogen-shaping, kogen-build |
      | git.Repo.Materialize | kogen-verification |
      | git.Repo.OK | kogen-shaping, kogen-build |
      | git.Repo.OKEnv | kogen-shaping |
      | git.Repo.ObjectFormat | kogen-build |
      | git.Repo.Observing | kogen-shaping |
      | git.Repo.OperationInProgress | kogen-shaping, kogen-build |
      | git.Repo.RequireIdentity | kogen-shaping |
      | git.Repo.Resolve | kogen-build |
      | git.Repo.RestoreIndex | kogen-build |
      | git.Repo.RestoreTree | kogen-build |
      | git.Repo.Run | kogen-executor, kogen-verification, kogen-shaping |
      | git.Repo.RunEnv | kogen-shaping |
      | git.Repo.SaveIndex | kogen-build |
      | git.Repo.Show | kogen-shaping, kogen-build |
      | git.Repo.TakePin | kogen-shaping |
      | git.Repo.Tree | kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | git.Repo.TreeEntries | kogen-build |
      | git.Restored.Change | kogen-build |
      | git.Restored.Path | kogen-build |
      | git.Result.Status | kogen-executor, kogen-shaping |
      | git.Result.Stderr | kogen-executor, kogen-shaping |
      | git.Result.Stdout | kogen-executor, kogen-verification, kogen-shaping |
      | git.StagedEquivalent | kogen-build |
      | git.TreeEntry | kogen-build |
      | git.TreeEntry.Mode | kogen-build |
      | git.TreeEntry.Object | kogen-build |
      | git.TreeEntry.Path | kogen-build |
      | git.UnsetPrefix | kogen-shaping |
      | project.Acceptance | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Acceptance.Run | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Acceptance.StepsDir | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.AcceptanceCommand | kogen-verification, kogen-shaping |
      | project.Approval | kogen, kogen-shaping, kogen-build |
      | project.Approval.ApprovedAt | kogen, kogen-shaping, kogen-build |
      | project.Approval.Approver | kogen, kogen-shaping, kogen-build |
      | project.Approval.Base | kogen, kogen-shaping, kogen-build |
      | project.Approval.SHA256 | kogen, kogen-shaping, kogen-build |
      | project.Approval.Slug | kogen, kogen-shaping, kogen-build |
      | project.Approval.SourceProvenance | kogen-shaping, kogen-build |
      | project.ApprovalPath | kogen, kogen-shaping, kogen-build |
      | project.Audit.Enabled | kogen-shaping |
      | project.Baseline | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.BindSource | kogen-shaping |
      | project.CaptureOrigin | kogen-shaping |
      | project.CaptureSource | kogen-shaping |
      | project.Check | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Check.Name | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Check.Run | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.CheckIntent | kogen-verification, kogen-shaping |
      | project.Checkout | kogen-shaping, kogen-build |
      | project.CheckoutFacts | kogen-shaping, kogen-build |
      | project.CheckoutFacts.GitDir | kogen-shaping |
      | project.CheckoutFacts.ID | kogen-shaping, kogen-build |
      | project.CheckoutFacts.Root | kogen-shaping |
      | project.Config | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Config.Acceptance | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Config.AcceptanceConfigured | kogen-shaping |
      | project.Config.Checks | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Config.Fix | kogen-verification, kogen-shaping, kogen-build |
      | project.Config.Models | kogen, kogen-shaping, kogen-build |
      | project.Config.NamedCommands | kogen-verification |
      | project.Config.Protect | kogen-shaping, kogen-build |
      | project.Config.ReviewMaterial | kogen-build |
      | project.Config.Setup | kogen-verification, kogen-shaping, kogen-build |
      | project.Config.ShapeAudit | kogen-shaping |
      | project.Config.ShapeDecisionCheck | kogen-shaping |
      | project.Config.ShapeWorkers | kogen, kogen-shaping, kogen-build |
      | project.ConfigPath | kogen, kogen-shaping, kogen-build |
      | project.DecisionCheck | kogen-shaping |
      | project.DecisionCheck.Enabled | kogen-shaping |
      | project.DefaultExternalRounds | kogen-shaping, kogen-build |
      | project.DefaultModels | kogen-shaping, kogen-build |
      | project.Detect | kogen-shaping |
      | project.Detected | kogen-shaping |
      | project.Detected.Checks | kogen-shaping |
      | project.Detected.Fix | kogen-shaping |
      | project.Detected.Protect | kogen-shaping |
      | project.Detected.Runner | kogen-shaping |
      | project.Detected.Setup | kogen-shaping |
      | project.EncodeApproval | kogen-shaping |
      | project.EncodeJSON | kogen-verification, kogen-shaping, kogen-build |
      | project.ExecutorClaudeCode | kogen |
      | project.FeaturePath | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Hash | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Intent | kogen-verification, kogen-shaping, kogen-build |
      | project.Intent.Acceptance | kogen-verification, kogen-shaping, kogen-build |
      | project.Intent.Decisions | kogen-shaping |
      | project.Intent.Feasibility | kogen-verification, kogen-shaping |
      | project.Intent.Model | kogen-verification, kogen-shaping, kogen-build |
      | project.Intent.ModelLine | kogen-shaping, kogen-build |
      | project.Intent.Root | kogen-verification, kogen-shaping |
      | project.Intent.Slug | kogen-verification, kogen-shaping, kogen-build |
      | project.Intent.SlugLine | kogen-shaping |
      | project.Intent.StepFiles | kogen-verification, kogen-shaping |
      | project.Intent.Tests | kogen-shaping |
      | project.Intent.Text | kogen-shaping, kogen-build |
      | project.Intent.Title | kogen-verification, kogen-shaping, kogen-build |
      | project.IntentDir | kogen-shaping, kogen-build |
      | project.IntentExists | kogen-shaping |
      | project.IntentMDPath | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.KogenRunner | kogen-verification, kogen-shaping |
      | project.LoadConfig | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.LoadIntent | kogen-shaping, kogen-build |
      | project.ModelPath | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelRoles | kogen |
      | project.ModelSpec | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.Invariants | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.None | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.Path | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.Samples | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.Seed | kogen-verification, kogen-shaping, kogen-build |
      | project.ModelSpec.Steps | kogen-verification, kogen-shaping, kogen-build |
      | project.NamedCommand.Run | kogen-verification |
      | project.NewSourceRequest | kogen-shaping |
      | project.Outline.Examples | kogen-verification |
      | project.Outline.Line | kogen-verification |
      | project.Outline.Name | kogen-verification, kogen-shaping |
      | project.ParseConfig | kogen, kogen-shaping, kogen-build |
      | project.ParseGherkin | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.ParseStages | kogen-shaping, kogen-build |
      | project.ProjectRunner | kogen-verification, kogen-shaping |
      | project.Protected | kogen-shaping |
      | project.PublishSource | kogen-shaping |
      | project.ReadApproval | kogen-shaping, kogen-build |
      | project.ReadIntent | kogen-shaping, kogen-build |
      | project.ReadableConfig | kogen |
      | project.RefineSource | kogen-shaping |
      | project.RefreshSource | kogen-shaping |
      | project.RenderConfig | kogen, kogen-shaping, kogen-build |
      | project.RequireIntentDir | kogen-shaping, kogen-build |
      | project.ResolveApproval | kogen-shaping |
      | project.RestoreSource | kogen-shaping |
      | project.ReviewMaterial | kogen-build |
      | project.ReviewMaterial.Mode | kogen-build |
      | project.Role | kogen, kogen-shaping, kogen-build |
      | project.Role.BaseURL | kogen-shaping, kogen-build |
      | project.Role.Effort | kogen, kogen-shaping, kogen-build |
      | project.Role.Executor | kogen, kogen-shaping, kogen-build |
      | project.Role.External | kogen, kogen-shaping, kogen-build |
      | project.Role.MaxRounds | kogen-shaping, kogen-build |
      | project.Role.Model | kogen, kogen-shaping, kogen-build |
      | project.Role.Provider | kogen, kogen-shaping, kogen-build |
      | project.Runner | kogen-verification |
      | project.Scenario | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Scenario.Line | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Scenario.Name | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Scenario.Outline | kogen-verification, kogen-shaping |
      | project.Scenario.Steps | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Scenario.Tags | kogen-verification |
      | project.ShapeSource | kogen-shaping |
      | project.ShapeSource.Origin | kogen-shaping |
      | project.ShapeSource.Request | kogen-shaping |
      | project.ShapeSource.Rounds | kogen-shaping |
      | project.ShapeSource.SourcePath | kogen-shaping |
      | project.SourceCard | kogen-shaping |
      | project.SourceComparison | kogen-shaping |
      | project.SourceMessage | kogen-shaping, kogen-build |
      | project.SourceOrigin | kogen-shaping |
      | project.SourceOrigin.Configuration | kogen-shaping |
      | project.SourceOrigin.Head | kogen-shaping |
      | project.SourceOrigin.Tree | kogen-shaping |
      | project.SourcePath | kogen-shaping |
      | project.SourceRef | kogen-shaping, kogen-build |
      | project.SourceRef.Archived | kogen-shaping |
      | project.SourceRef.ContractSHA256 | kogen-shaping, kogen-build |
      | project.SourceRef.Equal | kogen-shaping |
      | project.SourceRef.Map | kogen-shaping |
      | project.SourceRef.Path | kogen-shaping, kogen-build |
      | project.SourceRef.SHA256 | kogen-build |
      | project.SourceRefFromMap | kogen-build |
      | project.SourceRequest | kogen-shaping |
      | project.Stage | kogen-build |
      | project.Stage.Checks | kogen-shaping, kogen-build |
      | project.Stage.Goal | kogen-shaping, kogen-build |
      | project.Stage.ID | kogen-shaping, kogen-build |
      | project.Stage.Title | kogen-shaping, kogen-build |
      | project.Step | kogen-shaping |
      | project.Step.Keyword | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Step.Line | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Step.Text | kogen, kogen-verification, kogen-shaping, kogen-build |
      | project.Template | kogen-shaping, kogen-build |
      | project.ValidateSource | kogen-shaping, kogen-build |
      | project.Workers | kogen-build |
      | project.Workers.Enabled | kogen, kogen-shaping, kogen-build |
      | project.Workers.Roles | kogen, kogen-shaping, kogen-build |
      | project.WriteApproval | kogen, kogen-build |
      | project.WritePackageFacts | kogen-verification, kogen-shaping, kogen-build |
    When I compare the coordinator contract suite and contract/README.md with that inventory
    Then the coordinator contract inventory observations are:
      """
      {"unused":[],"missing_rows":[],"extra_rows":[],"duplicate_rows":[],"wrong_consumers":[],"bad_sources":[],"unknown_tests":[]}
      """

  Scenario: The contract suite depends on nothing but kogen-coordinator, kogen-loop/sys and the standard library
    When I observe what the coordinator contract suite depends on
    Then the coordinator contract dependency observations are:
      """
      {"go_mod":"module github.com/KogenAI/kogen-coordinator\n\ngo 1.27.2\n\nrequire kogen-loop v0.0.0\n\nreplace kogen-loop => github.com/KogenAI/kogen-loop v0.0.0-20261102055344-c6e2360290d4\n","go_sum":"github.com/KogenAI/kogen-loop v0.0.0-20261102055344-c6e2360290d4 h1:+VMCzH+0FYgr79FjWCAokdMbhAffOo9ua/Aw1U4H05k=\ngithub.com/KogenAI/kogen-loop v0.0.0-20261102055344-c6e2360290d4/go.mod h1:xuHxDT/F3nJeem9k/bSAtkJBPpQVnHpM4T3Sm/rCzRg=\n","foreign_imports":[],"parent_paths":[]}
      """

  Scenario: A change to a behaviour a consumer relies on fails the contract suite first
    Given these consumer-relied kogen-coordinator behaviour changes:
      """
      [
        {"id":"config-path","file":"project/config.go","from":"const ConfigPath = \".kogen/project.yaml\"","to":"const ConfigPath = \".kogen/config.yaml\"","count":1},
        {"id":"config-invalid-lines","file":"project/config.go","from":"fmt.Sprintf(\"line %d: %s\", p.line, p.msg)","to":"fmt.Sprintf(\"line %d - %s\", p.line, p.msg)","count":1},
        {"id":"config-not-initialized","file":"project/config.go","from":"\"environment\", \"not_initialized\"","to":"\"environment\", \"not_set_up\"","count":1},
        {"id":"named-commands","file":"project/config.go","from":"fmt.Sprintf(\"setup-%d\", i+1)","to":"fmt.Sprintf(\"setup%d\", i+1)","count":1},
        {"id":"external-rounds","file":"project/config.go","from":"const DefaultExternalRounds = 6","to":"const DefaultExternalRounds = 8","count":1},
        {"id":"executor-claude-code","file":"project/config.go","from":"ExecutorClaudeCode = \"claude-code\"","to":"ExecutorClaudeCode = \"claude\"","count":1},
        {"id":"approval-path","file":"project/baseline.go","from":"\".kogen/local/approvals/\"","to":"\".kogen/local/approval/\"","count":1},
        {"id":"approval-json","file":"project/baseline.go","from":"`json:\"approved_at\"`","to":"`json:\"approvedAt\"`","count":1},
        {"id":"hash-line","file":"project/baseline.go","from":"buf.WriteString(p + \"\\x00\" + digest + \"\\n\")","to":"buf.WriteString(p + \"\\t\" + digest + \"\\n\")","count":1},
        {"id":"baseline-order","file":"project/baseline.go","from":"return uniqStrings(append(all, protected...)), nil","to":"return uniqStrings(append(protected, all...)), nil","count":1},
        {"id":"protect-glob","file":"project/baseline.go","from":"b.WriteString(\"(?:.*/)?\")","to":"b.WriteString(\".*/\")","count":1},
        {"id":"intent-paths","file":"project/intent.go","from":"return \".kogen/intents/\" + slug","to":"return \".kogen/intent/\" + slug","count":1},
        {"id":"model-line","file":"project/intent.go","from":" seed=(\\d+) samples=(\\d+) steps=(\\d+)$","to":" seed=(\\d+) steps=(\\d+) samples=(\\d+)$","count":1},
        {"id":"model-none","file":"project/intent.go","from":"strings.CutPrefix(line, \"not applicable\")","to":"strings.CutPrefix(line, \"not-applicable\")","count":1},
        {"id":"intent-lint","file":"project/intent.go","from":"sys.Fail(\"intent\", \"lint\", \"the Intent needs changes\", 1)","to":"sys.Fail(\"intent\", \"lint\", \"the Intent has problems\", 1)","count":1},
        {"id":"intent-title-limit","file":"project/intent.go","from":"graphemeLen(i.Title) > 50","to":"graphemeLen(i.Title) > 72","count":1},
        {"id":"tests-layers","file":"project/intent.go","from":"(unit|integration|scenario|regression|existing)","to":"(unit|integration|scenario|regression)","count":1},
        {"id":"stages-invalid","file":"project/stages.go","from":"\"stages: expected one JSON fence","to":"\"stages: expected a JSON fence","count":1},
        {"id":"gherkin-outline-line","file":"project/gherkin.go","from":"Line:    row.line,","to":"Line:    s.line,","count":1},
        {"id":"gherkin-background","file":"project/gherkin.go","from":"Steps: slices.Concat(s.bg, s.steps)}}","to":"Steps: s.steps}}","count":1},
        {"id":"encode-json-order","file":"project/facts.go","from":"slices.Sort(keys)","to":"slices.Sort(keys)\n\t\tslices.Reverse(keys)","count":1},
        {"id":"package-facts","file":"project/facts.go","from":"`json:\"package_state\"`","to":"`json:\"state\"`","count":1},
        {"id":"source-path","file":"project/provenance.go","from":"\".kogen/local/provenance/\"","to":"\".kogen/local/receipts/\"","count":1},
        {"id":"source-message","file":"project/provenance.go","from":"\"Source provenance: unavailable (legacy)\"","to":"\"Source provenance: none (legacy)\"","count":1},
        {"id":"source-refused","file":"project/provenance.go","from":"\"candidate\", \"source_provenance_changed\"","to":"\"candidate\", \"source_changed\"","count":1},
        {"id":"source-ref-map","file":"project/provenance.go","from":"m[\"contract_sha256\"] = r.ContractSHA256","to":"m[\"contract\"] = r.ContractSHA256","count":1},
        {"id":"source-receipt-version","file":"project/provenance.go","from":"\"version\":         json.Number(\"1\"),","to":"\"version\":         json.Number(\"2\"),","count":1},
        {"id":"commit-message","file":"git/commit.go","from":"\"\\n\\nKogen-Intent: \"","to":"\"\\n\\nKogen-Slug: \"","count":1},
        {"id":"commit-rejected","file":"git/commit.go","from":"Reason: \"commit_rejected\"","to":"Reason: \"commit_refused\"","count":1},
        {"id":"lock-path","file":"git/lock.go","from":"\".kogen/local/build.lock\"","to":"\".kogen/local/build-lock\"","count":1},
        {"id":"build-running","file":"git/lock.go","from":"\"build_running\"","to":"\"build_busy\"","count":1},
        {"id":"lock-diagnostics","file":"git/lock.go","from":"\"%s\\npid %d\\ntoken %s\\n\"","to":"\"%s\\nowner %d\\ntoken %s\\n\"","count":1},
        {"id":"changed-paths-rename","file":"git/git.go","from":"paths = append(paths, path, tokens[i+1])","to":"paths = append(paths, path)","count":1},
        {"id":"unset-prefix","file":"git/git.go","from":"return \"unset \" + strings.Join(names, \" \") + \"; \"","to":"return \"unset \" + strings.Join(names, \" \") + \" && \"","count":1},
        {"id":"not-a-git-repo","file":"git/git.go","from":"\"environment\", \"not_a_git_repo\"","to":"\"environment\", \"no_git_repo\"","count":1},
        {"id":"identity-missing","file":"git/git.go","from":"\"git_identity_missing\"","to":"\"git_identity_unset\"","count":1},
        {"id":"durable-skip","file":"durable/durable.go","from":"if skip.Load() {","to":"if skip.Load() && false {","count":1}
      ]
      """
    When I run the coordinator contract suite on the unchanged tree and after each change
    Then the coordinator contract suite outcomes are:
      """
      {
        "unchanged": "contract passed",
        "config-path": "contract failed",
        "config-invalid-lines": "contract failed",
        "config-not-initialized": "contract failed",
        "named-commands": "contract failed",
        "external-rounds": "contract failed",
        "executor-claude-code": "contract failed",
        "approval-path": "contract failed",
        "approval-json": "contract failed",
        "hash-line": "contract failed",
        "baseline-order": "contract failed",
        "protect-glob": "contract failed",
        "intent-paths": "contract failed",
        "model-line": "contract failed",
        "model-none": "contract failed",
        "intent-lint": "contract failed",
        "intent-title-limit": "contract failed",
        "tests-layers": "contract failed",
        "stages-invalid": "contract failed",
        "gherkin-outline-line": "contract failed",
        "gherkin-background": "contract failed",
        "encode-json-order": "contract failed",
        "package-facts": "contract failed",
        "source-path": "contract failed",
        "source-message": "contract failed",
        "source-refused": "contract failed",
        "source-ref-map": "contract failed",
        "source-receipt-version": "contract failed",
        "commit-message": "contract failed",
        "commit-rejected": "contract failed",
        "lock-path": "contract failed",
        "build-running": "contract failed",
        "lock-diagnostics": "contract failed",
        "changed-paths-rename": "contract failed",
        "unset-prefix": "contract failed",
        "not-a-git-repo": "contract failed",
        "identity-missing": "contract failed",
        "durable-skip": "contract failed"
      }
      """

  Scenario: The README points at the contract and states how it changes
    When I read the coordinator contract documentation
    Then the coordinator contract documentation observations are:
      """
      {"readme_packages_entry":true,"readme_links_contract":true,"contract_readme_change_rule":true}
      """
