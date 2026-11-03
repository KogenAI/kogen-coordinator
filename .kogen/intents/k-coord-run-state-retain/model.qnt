module run_state {
 var retained: int
 var omitted: int
 var total: int
 var finished: bool
 val Bounded = retained >= 0 and retained <= 32
 val Accounting = total == retained + omitted
 action init = all { retained' = 0, omitted' = 0, total' = 0, finished' = false }
 action addEvent = all {
   retained' = if (retained < 32) retained + 1 else 32,
   omitted' = if (retained < 32) omitted else omitted + 1,
   total' = total + 1,
   finished' = finished
 }
 action finish = all { finished' = true, retained' = retained, omitted' = omitted, total' = total }
 action rejected = all { finished' = finished, retained' = retained, omitted' = omitted, total' = total }
 action step = any { addEvent, finish, rejected }
}
