Feature: Fetch confines reads to the project root

  This feature drives project.Fetch through a generated Go driver. The driver creates a fresh temporary
  directory holding a project root and, beside it, an outside folder with the file secret.txt whose
  content is outside-secret. The project holds a/b/c.txt with the content disk-content. The driver calls
  project.Fetch for a list of probes and observes, for each probe, whether an error was returned and
  the content returned.

  Scenario: Parent traversal and absolute paths are rejected
    # Probes: ../outside/secret.txt, a/../../outside/secret.txt and the absolute path of the outside secret.txt.
    When project-fetch-root-confinement: the driver runs the "traversal" case
    Then project-fetch-root-confinement: the observation is
      """
      {
        "parent": {"error_returned": true, "content": ""},
        "nested_parent": {"error_returned": true, "content": ""},
        "absolute": {"error_returned": true, "content": ""}
      }
      """

  Scenario: A symlink that resolves outside the project is rejected
    # The project holds escape-dir (a symlink to the outside folder) and escape-file (a symlink to the outside secret.txt).
    When project-fetch-root-confinement: the driver runs the "symlink" case
    Then project-fetch-root-confinement: the observation is
      """
      {
        "symlink_dir": {"error_returned": true, "content": ""},
        "symlink_file": {"error_returned": true, "content": ""}
      }
      """

  Scenario: Valid project files and overlay precedence are preserved
    # inside-link is a symlink to a inside the project. The overlay probes pass an overlay map to Fetch.
    When project-fetch-root-confinement: the driver runs the "valid-and-overlay" case
    Then project-fetch-root-confinement: the observation is
      """
      {
        "nested_disk": {"error_returned": false, "content": "disk-content"},
        "inside_symlink": {"error_returned": false, "content": "disk-content"},
        "overlay_over_disk": {"error_returned": false, "content": "overlay-content"},
        "overlay_only": {"error_returned": false, "content": "overlay-only-content"},
        "overlay_traversal_key": {"error_returned": true, "content": ""},
        "traversal_still_rejected": {"error_returned": true, "content": ""}
      }
      """
