const { Then } = require('@cucumber/cucumber');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

function observe(actual, expected) { assert.deepEqual(actual, expected); }
const good = { status: 'RemovedStale', held: false, pid: '424242', notice: 'kogen: removed the lock of a Build that is no longer running\n' };
if (require.main === module) {
  const actual = { ...good };
  if (process.argv[2] === 'bad') actual.held = true;
  try { observe(actual, good); console.log('accepted'); process.exit(0); }
  catch (_) { console.log('rejected'); process.exit(1); }
}

const source = String.raw`package git
import (
 "bytes"
 "encoding/json"
 "fmt"
 "os"
 "path/filepath"
 "strconv"
 "testing"
 "time"
 "kogen-loop/sys"
)
func TestOwnershipObservation(t *testing.T) {
 mode := os.Getenv("OWNERSHIP_CASE")
 root := t.TempDir()
 p := BuildLockPath(root)
 if err := os.MkdirAll(filepath.Dir(p),0755); err != nil { t.Fatal(err) }
 pid := "424242"
 body := pid+"\n"
 stamp := time.Date(2020,1,2,3,4,5,0,time.Local)
 uid := os.Geteuid()
 name := "unrelated"
 started := stamp.Add(time.Second)
 alive := true
 switch mode {
 case "same-name":
  exe,_ := os.Executable(); name=filepath.Base(exe)
 case "before": started=stamp.Add(-time.Second)
 case "equal": started=stamp
 case "foreign": uid++ ; started=stamp.Add(-time.Second)
 case "dead": alive=false
 case "empty": body="";pid=""
 case "text": body="not-a-pid\n";pid="not-a-pid"
 case "zero": body="0\n";pid="0"
 case "self": pid=strconv.Itoa(os.Getpid());body=pid+"\n"
 }
 owner:=p
 if os.Getenv("OWNERSHIP_FORMAT")=="directory" {
  if err:=os.Mkdir(p,0755);err!=nil {t.Fatal(err)}
  owner=filepath.Join(p,"owner")
 }
 if err:=os.WriteFile(owner,[]byte(body),0644);err!=nil {t.Fatal(err)}
 if mode=="self" { stamp=time.Now().Add(time.Minute) }
 if err:=os.Chtimes(owner,stamp,stamp);err!=nil {t.Fatal(err)}
 bin:=filepath.Join(root,"bin");os.Mkdir(bin,0755)
 script:=fmt.Sprintf("#!/bin/sh\nprintf '%%s\\n' '%d %s %s'\n",uid,name,started.Format("Mon Jan _2 15:04:05 2006"))
 if mode!="self" {
  if err:=os.WriteFile(filepath.Join(bin,"ps"),[]byte(script),0755);err!=nil {t.Fatal(err)}
  t.Setenv("PATH",bin+string(os.PathListSeparator)+os.Getenv("PATH"))
 }
 l:=NewLock(p)
 if mode!="self" { l.alive=func(int)bool{return alive} }
 held,err:=l.Held();if err!=nil {t.Fatal(err)}
 res,err:=l.Acquire();if err!=nil {t.Fatal(err)}
 defer l.Release()
 status:=map[LockStatus]string{Acquired:"Acquired",RemovedStale:"RemovedStale",Held:"Held"}[res.Status]
 notice:=""
 if mode=="notice" {
  l.Release()
  os.WriteFile(p,[]byte("987654321\n"),0644)
  var out bytes.Buffer
  s:=sys.NewWith(nil,root);s.Stderr=&out
  owned,e:=AcquireBuild(root,s);if e!=nil {t.Fatal(e)};defer owned.Release()
  notice=out.String()
 }
 got:=map[string]any{"status":status,"held":held,"pid":res.PID,"notice":notice}
 if mode=="self" {got["pid"]="self"}
 b,_:=json.Marshal(got);fmt.Println("OWNERSHIP_RESULT="+string(b))
}
`;

Then('coord-legacy-lock-pid-ownership: {string} in {string} yields {string} and held {string} with pid {string} and notice {string}', function (mode, format, status, held, pid, notice) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.ownership-'));
  try {
    fs.copyFileSync('git/lock.go', path.join(dir, 'lock.go'));
    fs.writeFileSync(path.join(dir, 'observation_test.go'), source);
    const result = cp.spawnSync('go', ['test', '-count=1', '-v', './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 120000,
      env: { ...process.env, OWNERSHIP_CASE: mode, OWNERSHIP_FORMAT: format, LC_ALL: 'C' }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.status, 0, 'go test TestOwnershipObservation failed: ' + output);
    const rows = output.split('\n').filter(s => s.startsWith('OWNERSHIP_RESULT='));
    assert.equal(rows.length, 1, 'go test TestOwnershipObservation must emit exactly one result (absent, skipped or zero executions): ' + output);
    observe(JSON.parse(rows[0].slice('OWNERSHIP_RESULT='.length)), {
      status, held: held === 'true', pid, notice: notice === 'stale' ? good.notice : ''
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

Then('coord-legacy-lock-pid-ownership: lock source uses only signal zero', function () {
  const source = fs.readFileSync('git/lock.go', 'utf8');
  const calls = [...source.matchAll(/\b(?:syscall\.)?Kill\s*\(([^)]*)\)/g)];
  for (const call of calls) assert.match(call[1], /,\s*0\s*$/, 'nonzero or unverified signal: ' + call[0]);
  assert.doesNotMatch(source, /\.Signal\s*\(/, 'lock file must not signal a recorded process');
});
