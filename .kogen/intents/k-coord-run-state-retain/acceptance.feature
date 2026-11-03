Feature: Retained coordinator run state
  Scenario: Discover a bounded run history after pruning its workspace
    When I exercise the durable run store across workspace pruning
    Then the retained run observations are:
      """
      {"empty":[],"ids":["run-a","run-b"],"stages":["build-3","build-4","build-5","build-6","build-7","build-8","build-9","build-10","build-11","build-12","build-13","build-14","build-15","build-16","build-17","build-18","build-19","build-20","build-21","build-22","build-23","build-24","build-25","build-26","build-27","build-28","build-29","build-30","build-31","approval","review","commit"],"omitted":5,"outcome":"success","reason":"committed","evidence":["attempts/approval-2","attempts/review"],"attempt":"attempts/build-3","utc":true,"workspaceGone":true,"otherOutcome":"stopped","otherEvents":0,"absent":true,"oversizeUnchanged":true,"invalidUnchanged":true,"byteBound":true}
      """
