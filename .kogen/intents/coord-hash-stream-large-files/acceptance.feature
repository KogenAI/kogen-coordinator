Feature: Stream file bytes into the approval hash and verification input digests

  Scenario: The approval hash of a 256 MiB sparse baseline file streams its bytes
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: a sparse file "vendor/big.bin" of 268435456 bytes
    And coord-hash-stream-large-files: a file "small.txt" with 1 patterned bytes
    When coord-hash-stream-large-files: I compute the approval hash of the fixture paths
    Then coord-hash-stream-large-files: the approval hash equals the independent reference
    And coord-hash-stream-large-files: the unreadable paths are ""
    And coord-hash-stream-large-files: heap allocation during the call stays under 16 MiB

  Scenario: The verification input digest of a 256 MiB file streams its bytes
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: a sparse file "vendor/big.bin" of 268435456 bytes
    When coord-hash-stream-large-files: I materialize the fixture as a candidate tree
    Then coord-hash-stream-large-files: the recorded verification inputs equal the independent reference
    And coord-hash-stream-large-files: heap allocation during the call stays under 16 MiB

  Scenario Outline: The approval hash of a <size>-byte file equals the independent reference
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: a file "data.bin" with <size> patterned bytes
    When coord-hash-stream-large-files: I compute the approval hash of the fixture paths
    Then coord-hash-stream-large-files: the approval hash equals the independent reference
    And coord-hash-stream-large-files: the unreadable paths are ""

    Examples:
      | size    |
      | 0       |
      | 1       |
      | 32767   |
      | 32768   |
      | 32769   |
      | 65536   |
      | 1048576 |

  Scenario Outline: The verification input digest of a <size>-byte file equals the independent reference
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: a file "data.bin" with <size> patterned bytes
    When coord-hash-stream-large-files: I materialize the fixture as a candidate tree
    Then coord-hash-stream-large-files: the recorded verification inputs equal the independent reference

    Examples:
      | size    |
      | 0       |
      | 1       |
      | 32767   |
      | 32768   |
      | 32769   |
      | 65536   |
      | 1048576 |

  Scenario: Absent, directory and permission-denied baseline paths keep their classification
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: a file "file" with 5 patterned bytes
    And coord-hash-stream-large-files: an absent path "absent"
    And coord-hash-stream-large-files: a directory "dir"
    And coord-hash-stream-large-files: a permission-denied file "locked"
    And coord-hash-stream-large-files: a symlink "file-link" to "file"
    And coord-hash-stream-large-files: a symlink "dangling-link" to "absent"
    And coord-hash-stream-large-files: a symlink "dir-link" to "dir"
    When coord-hash-stream-large-files: I compute the approval hash of the fixture paths
    Then coord-hash-stream-large-files: the approval hash equals the independent reference
    And coord-hash-stream-large-files: the unreadable paths are "dir,dir-link,locked"

  Scenario: Verification inputs keep symlink and executable-bit handling
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: an executable file "run.sh" with 40000 patterned bytes
    And coord-hash-stream-large-files: a file "data.bin" with 3 patterned bytes
    And coord-hash-stream-large-files: a symlink "link" to "data.bin"
    And coord-hash-stream-large-files: a symlink "dangling" to "absent"
    When coord-hash-stream-large-files: I materialize the fixture as a candidate tree
    Then coord-hash-stream-large-files: the recorded verification inputs equal the independent reference
    And coord-hash-stream-large-files: the recorded input "run.sh" is a "file" with target "" and executable bits 73
    And coord-hash-stream-large-files: the recorded input "data.bin" is a "file" with target "" and executable bits 0
    And coord-hash-stream-large-files: the recorded input "link" is a "symlink" with target "data.bin" and executable bits 0
    And coord-hash-stream-large-files: the recorded input "dangling" is a "symlink" with target "absent" and executable bits 0

  Scenario Outline: Recorded parity fixture "<case>" keeps its approval hash
    Given coord-hash-stream-large-files: a fixture directory
    And coord-hash-stream-large-files: the recorded parity inputs of case "<case>"
    When coord-hash-stream-large-files: I compute the approval hash of the fixture paths
    Then coord-hash-stream-large-files: the approval hash is "<hash>"

    Examples:
      | case                    | hash                                                             |
      | usable-check-protection | 8a74a280ecfc9ed02fb6e60ab53a2e727e1841ae8ea69920b67977e6fc35619a |
      | bundled-zip-safety      | d7f9cf9a298a088e84696c457f04ff34752fc100ad04846b5fc360d9fb91ae41 |
      | build-continuity        | 31ba9254e421a32cab370019f9876a7c8e9b8bd413fb7ac570331ba8cec4f506 |
