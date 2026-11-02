Feature: Git diagnostics do not describe repository changes
  Scenario: Observe clean and changed trees before, during and after a real warning
    When I observe coordinator Git with a fixture attributes warning
    Then the Git observations are:
      """
      {
        "clean": {"statuses":["","",""],"paths":[[],[],[]],"warnings":[false,true,false]},
        "changed": {"statuses":[" M notes.txt\n?? untracked.txt\n"," M notes.txt\n?? untracked.txt\n"," M notes.txt\n?? untracked.txt\n"],"paths":[["notes.txt","untracked.txt"],["notes.txt","untracked.txt"],["notes.txt","untracked.txt"]],"warnings":[false,true,false]},
        "failure":{"runFailed":true,"diagnostic":true,"okFailed":true,"pathsFailed":true}
      }
      """
