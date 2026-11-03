Feature: Ownership-qualified legacy Build locks
  Scenario Outline: Classify legacy owners without signaling them
    Then coord-legacy-lock-pid-ownership: "<case>" in "<format>" yields "<status>" and held "<held>" with pid "<pid>" and notice "<notice>"
    Examples:
      | case      | format    | status       | held  | pid       | notice |
      | after     | file      | RemovedStale | false | 424242    |        |
      | after     | directory | RemovedStale | false | 424242    |        |
      | same-name | file      | Held         | true  | 424242    |        |
      | same-name | directory | Held         | true  | 424242    |        |
      | before    | file      | Held         | true  | 424242    |        |
      | before    | directory | Held         | true  | 424242    |        |
      | equal     | file      | Held         | true  | 424242    |        |
      | equal     | directory | Held         | true  | 424242    |        |
      | self      | file      | Held         | true  | self      |        |
      | self      | directory | Held         | true  | self      |        |
      | foreign   | file      | RemovedStale | false | 424242    |        |
      | foreign   | directory | RemovedStale | false | 424242    |        |
      | dead      | file      | RemovedStale | false | 424242    |        |
      | dead      | directory | RemovedStale | false | 424242    |        |
      | empty     | file      | RemovedStale | false |           |        |
      | empty     | directory | RemovedStale | false |           |        |
      | text      | file      | RemovedStale | false | not-a-pid |        |
      | text      | directory | RemovedStale | false | not-a-pid |        |
      | zero      | file      | RemovedStale | false | 0         |        |
      | zero      | directory | RemovedStale | false | 0         |        |
      | notice    | file      | RemovedStale | false | 424242    | stale  |

  Scenario: Never terminate a recorded owner
    Then coord-legacy-lock-pid-ownership: lock source uses only signal zero
