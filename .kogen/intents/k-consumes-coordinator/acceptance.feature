Feature: Coordinator states its producer reliance
  Scenario: A dedicated producer suite exists and passes
    Then k-consumes-coordinator: the producer suite has Go tests
    And k-consumes-coordinator: the inventory exists
    And k-consumes-coordinator: command "go test -race -count=1 -trimpath ./consumes/kogen-loop" succeeds

  Scenario: Normal testing includes consumer and provider contracts
    Then k-consumes-coordinator: command "go test ./..." succeeds
