Feature: Build lock owner identity does not depend on the ps program

  Scenario: Acquire the Build lock in a fresh repository with no ps on PATH
    Then coord-owner-birth-without-ps: case "acquire-without-ps" reports:
      """
      {"acquire":"ok","stderr":"","lock":{"pid":"self","token":"lock","held":true},"owner":{"error":"","pid":"self","token":"lock","birth":"ps"}}
      """

  Scenario: A birth recorded in the ps format is held while its process runs and stale after it exits
    Then coord-owner-birth-without-ps: case "ps-format" reports:
      """
      {"self":"held","owner":"held","running":"held","exited":"stale"}
      """
    And coord-owner-birth-without-ps: the git and project packages vet for "darwin/arm64"
    And coord-owner-birth-without-ps: the git and project packages vet for "freebsd/amd64"

  Scenario Outline: A legacy lock of a running same-user owner is held without ps
    Then coord-owner-birth-without-ps: case "legacy" with a "<format>" legacy lock reports:
      """
      {"running":{"held":true,"owner_held":true,"status":"Held","pid":"owner","error":""},"exited":{"held":false,"owner_held":false,"status":"RemovedStale","pid":"owner","error":""}}
      """
    Examples:
      | format    |
      | file      |
      | directory |

  Scenario Outline: Owners with the same pid but different births are told apart
    Then coord-owner-birth-without-ps: case "pid-reuse" with a "<format>" legacy lock reports:
      """
      {"current":"held","earlier":"stale","legacy":{"held":false,"owner_held":false,"status":"RemovedStale","pid":"owner","error":""}}
      """
    Examples:
      | format    |
      | file      |
      | directory |

  Scenario: A ps fallback that does not finish is stopped at its bound
    Then coord-owner-birth-without-ps: case "timeout" returns no birth within "7s" and a one-line error naming:
      | process 99999999 start time could not be read |
      | /proc/99999999/stat                           |
      | ps -p 99999999                                |
      | timed out after 5s                            |

  Scenario: When neither source supplies a birth the error names both attempts
    Then coord-owner-birth-without-ps: case "both-fail" returns no birth within "7s" and a one-line error naming:
      | process 99999999 start time could not be read |
      | /proc/99999999/stat                           |
      | ps -p 99999999                                |
