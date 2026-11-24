Feature: Strict custody of the Coordinator Build lock
  This feature gives the downstream caller a refusal it can distinguish without repairing an existing lock.

  Scenario: A strict winner excludes both contenders until release
    Then coord-strict-transient-build-lock: a strict owner at BuildLockPath has a valid token, promptly excludes normal and strict contenders, and releases the same lock

  Scenario: The normal owner stays in custody
    Then coord-strict-transient-build-lock: strict acquisition promptly refuses the normally held lock and preserves its owner, inode and bytes

  Scenario Outline: An occupied path is not altered
    Then coord-strict-transient-build-lock: strict acquisition refuses the <artifact> without changing its path identity or contents

    Examples:
      | artifact         |
      | regular file     |
      | live directory   |
      | dangling symlink |

  Scenario: Strict refusal leaves stale file repair to ordinary acquisition
    Then coord-strict-transient-build-lock: the stale pid file is preserved by strict refusal and still allows ordinary stale takeover and release

  Scenario: Strict refusal leaves stale directory repair to ordinary acquisition
    Then coord-strict-transient-build-lock: the stale directory is preserved by strict refusal and still allows ordinary stale takeover and release

  Scenario: The earlier absence observation is not authority
    Then coord-strict-transient-build-lock: strict acquisition refuses and preserves the file created after the caller observed absence

  Scenario: Strict release cannot remove a replacement
    Then coord-strict-transient-build-lock: the strict owner releases its own lock without removing the replacement symlink at BuildLockPath

  Scenario: An unusable parent is not custody
    Then coord-strict-transient-build-lock: strict acquisition reports the parent obstruction without classifying it as an occupied Build lock
