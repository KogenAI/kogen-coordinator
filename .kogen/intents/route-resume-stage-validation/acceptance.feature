Feature: Refuse unrecognized checkpoint stages in route.Resume
  This feature replaces the fallthrough that treats an unknown checkpoint as a review.

  Scenario: Refuse an unknown stage with a continuable reviewer
    When route-resume-stage-validation: Resume receives "unknown-checkpoint-stage" with reviewer continuable "true"
    Then route-resume-stage-validation: Resume returns an error naming the stage without calling any step

  Scenario: Refuse an unknown stage with a non-continuable reviewer
    When route-resume-stage-validation: Resume receives "unknown-checkpoint-stage" with reviewer continuable "false"
    Then route-resume-stage-validation: Resume returns an error naming the stage without calling any step

  Scenario: Keep the existing review and failed commit resume paths
    When route-resume-stage-validation: Resume receives these recognized stages in separate calls
      | stage               | continuable | phases                                                        |
      | review              | true        | ["continue","commit approved saved"]                          |
      | review_verify       | true        | ["continue","commit approved saved"]                          |
      | review_retry_verify | true        | ["continue","commit approved saved"]                          |
      | review              | false       | ["fresh review","review base","commit approved base"]         |
      | review_verify       | false       | ["fresh review_verify","review base","commit approved base"]  |
      | review_retry_verify | false       | ["fresh review_retry_verify","review base","commit approved base"] |
      | review_only         | true        | ["fresh review_only","review base","commit approved base"]    |
      | review_only         | false       | ["fresh review_only","review base","commit approved base"]    |
      | commit_failed       | true        | ["approved","commit approved saved (no restart)"]             |
    Then route-resume-stage-validation: each call succeeds with exactly its listed phase calls in order
