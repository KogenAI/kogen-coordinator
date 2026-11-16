Feature: The Build lock holder judgment reports only real pids and its ps bound is testable
  This feature holds the Build lock on a second open file description and observes what a
  contender reports, and runs the ps fallback with a short overridden bound.

  Scenario: An empty held lock file is refused as a pid not recorded
    Given coord-build-lock-holder-judgment: the Build lock file holds "" and another open file description holds its flock
    When coord-build-lock-holder-judgment: AcquireBuild, Acquire and LockOwner contend for the lock
    Then coord-build-lock-holder-judgment: AcquireBuild is refused with "environment/build_running: a Build is running in this repository (pid not recorded)" and exit 3
    And coord-build-lock-holder-judgment: Acquire reports Held with pid "" and the file still holds ""

  Scenario: Headerless text in a held lock file is not printed as a pid
    Given coord-build-lock-holder-judgment: the Build lock file holds "not-a-pid" and another open file description holds its flock
    When coord-build-lock-holder-judgment: AcquireBuild, Acquire and LockOwner contend for the lock
    Then coord-build-lock-holder-judgment: AcquireBuild is refused with "environment/build_running: a Build is running in this repository (pid not recorded)" and exit 3

  Scenario: A recorded pid is printed as before
    Given coord-build-lock-holder-judgment: the Build lock file holds "kogen-build-lock 1\npid 4242\ntoken abc\n" and another open file description holds its flock
    When coord-build-lock-holder-judgment: AcquireBuild, Acquire and LockOwner contend for the lock
    Then coord-build-lock-holder-judgment: AcquireBuild is refused with "environment/build_running: a Build is running in this repository (pid 4242)" and exit 3
    And coord-build-lock-holder-judgment: Acquire reports Held with pid "4242" and the file still holds "kogen-build-lock 1\npid 4242\ntoken abc\n"

  Scenario: LockOwner returns no pid for headerless text
    Given coord-build-lock-holder-judgment: the Build lock file holds "not-a-pid" and another open file description holds its flock
    When coord-build-lock-holder-judgment: AcquireBuild, Acquire and LockOwner contend for the lock
    Then coord-build-lock-holder-judgment: LockOwner returns pid "", token "" and held true

  Scenario: The ps bound of ProcessBirth follows the override
    Given coord-build-lock-holder-judgment: a ps that sleeps 30 seconds is first on PATH and the ps bound is overridden to 200 milliseconds
    When coord-build-lock-holder-judgment: ProcessBirth is asked for pid 99999999
    Then coord-build-lock-holder-judgment: it returns an empty birth and an error ending with "; ps -p 99999999 timed out after 200ms" in less than 2.2 seconds

  Scenario: The ps bound of the legacy lock judgment follows the override
    Given coord-build-lock-holder-judgment: a ps that sleeps 30 seconds is first on PATH and the ps bound is overridden to 200 milliseconds
    When coord-build-lock-holder-judgment: Held judges a legacy lock of pid 424242 whose process counts as alive
    Then coord-build-lock-holder-judgment: it returns false with no error in less than 2.2 seconds

  Scenario: Each ps bound restore puts back the previous bound
    When coord-build-lock-holder-judgment: the ps bound is overridden to 200 milliseconds and then to 300 milliseconds
    Then coord-build-lock-holder-judgment: after the inner restore the ps timeout is "200ms" and after the outer restore it is "5s"
