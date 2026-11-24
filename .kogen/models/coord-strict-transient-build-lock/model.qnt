module strict_build_lock {
  // Slot labels distinguish directory entries, not just where a descriptor resolves.
  type State = { slot: str, strict: str, sawAbsent: bool, refusedFrom: str, refusedTo: str }
  var s: State

  action init = s' = { slot: "absent", strict: "none", sawAbsent: false, refusedFrom: "none", refusedTo: "none" }
  action observe = all { s.slot == "absent", s' = { ...s, sawAbsent: true } }
  action populate = all { s.slot == "absent", s' = { ...s, slot: "foreign" } }
  action create = all {
    s.slot == "absent", s.strict == "none",
    s' = { ...s, slot: "created", strict: "pending" }
  }
  action refuse = all {
    s.slot != "absent",
    s' = { ...s, refusedFrom: s.slot, refusedTo: s.slot }
  }
  // A normal contender can win the flock in the interval after exclusive creation.
  action normalTake = all {
    Set("absent", "created", "foreign").contains(s.slot),
    s' = { ...s, slot: "normal" }
  }
  action normalRelease = all { s.slot == "normal", s' = { ...s, slot: "absent" } }
  action finish = all {
    s.strict == "pending", s.slot == "created",
    s' = { ...s, slot: "strict", strict: "owner" }
  }
  action abort = all {
    s.strict == "pending",
    s' = { ...s, slot: if (s.slot == "created") "foreign" else s.slot, strict: "none" }
  }
  action replace = all {
    Set("created", "strict").contains(s.slot),
    s' = { ...s, slot: "foreign" }
  }
  action release = all {
    s.strict == "owner",
    s' = { ...s, slot: if (s.slot == "strict") "absent" else s.slot, strict: "none" }
  }
  action step = any { observe, populate, create, refuse, normalTake, normalRelease, finish, abort, replace, release }

  val RefusalPreserves = s.refusedFrom == s.refusedTo and s.refusedFrom != "absent"
  val OwnerHasCustody = (s.slot == "created" implies s.strict == "pending") and
    (s.slot == "strict" implies s.strict == "owner")
}
