Feature: An interrupted Build's edit list leaves out the approved Intent's own files

  project.BuildEdits(slug, changed) is a Build's edit list: the paths of changed (a tree diff from
  git.Repo.Changed between the Build's start tree and its candidate tree), in their order, without
  the paths project.OwnedByIntent(slug, path) reports as the approved Intent's own: those under
  .kogen/intents/<slug>/ and .kogen/models/<slug>/. A generated Go driver replays the live run of
  4 Nov in a fresh Git repository and calls both functions.

  Scenario: The interrupted Build of 4 Nov lists only its own edits and a second Build reads the model
    # A repository commits README.md and lib/task.js. The approved Intent complete-task is in the
    # working tree (intent.md with "Model: .kogen/intents/complete-task/model.qnt invariants=Safe
    # seed=1 samples=2 steps=3", acceptance.feature and model.qnt). The Build's start tree is
    # taken; its first verification writes .kogen/models/complete-task/model.qnt and model.json as
    # kogen-build's promoteModel does, and the builder edits README.md and lib/task.js and adds
    # test/task.test.js. The Build is interrupted: "changed" is the tree diff, "edited" the edit
    # list. Every edited path is discarded (put back from the start tree, or removed). A second
    # Build then starts: the uncommitted paths that are not the Intent's own, the model files in
    # its start tree, and the model it reads from .kogen/models/complete-task/model.json.
    When k-interrupt-edits-exclude-approved: the driver runs the "interrupted-build" case
    Then k-interrupt-edits-exclude-approved: the observation is
      """
      {
        "changed": [
          ".kogen/models/complete-task/model.json",
          ".kogen/models/complete-task/model.qnt",
          "README.md",
          "lib/task.js",
          "test/task.test.js"
        ],
        "edited": ["README.md", "lib/task.js", "test/task.test.js"],
        "second_build": {
          "changes_not_owned": [],
          "models_in_start_tree": [
            ".kogen/models/complete-task/model.json",
            ".kogen/models/complete-task/model.qnt"
          ],
          "model_json_error": "",
          "model_path": ".kogen/models/complete-task/model.qnt",
          "model_qnt_is_the_intent_model": true
        }
      }
      """

  Scenario: Only the folders of the Intent's own slug are left out, in the given order
    # The Intent is complete-task. complete-task-archive is another Intent whose name starts with
    # the same letters; lib/complete-task/ is project code.
    When k-interrupt-edits-exclude-approved: the driver runs the "filter" case
    Then k-interrupt-edits-exclude-approved: the observation is
      """
      {
        "edited": [
          ".kogen/intents/complete-task-archive/intent.md",
          ".kogen/models/complete-task-archive/model.json",
          "README.md",
          "lib/complete-task/model.json"
        ],
        "edited_of_nothing": [],
        "owned": {
          ".kogen/intents/complete-task/intent.md": true,
          ".kogen/intents/complete-task-archive/intent.md": false,
          ".kogen/models/complete-task-archive/model.json": false,
          ".kogen/models/complete-task/model.json": true,
          ".kogen/models/complete-task/model.qnt": true,
          "README.md": false,
          "lib/complete-task/model.json": false
        }
      }
      """
