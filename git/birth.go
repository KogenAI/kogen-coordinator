package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// psBound is the wall time of one `ps` fallback run. At the bound the whole process group is
// killed with SIGKILL.
const psBound = 5 * time.Second

// psWaitDelay is how long past the kill the wait for the output pipe may last, in case a
// process outside the group still holds it.
const psWaitDelay = time.Second

// birthLayout is the layout of `LC_ALL=C ps -o lstart=`.
const birthLayout = "Mon Jan _2 15:04:05 2006"

// procObservation is what the operating system tells about a process: its effective uid, its
// name and its start time in whole seconds since the epoch.
type procObservation struct {
	uid   int
	name  string
	start int64
}

// ProcessBirth returns the start time of process pid in the text `LC_ALL=C ps -p <pid> -o
// lstart=` prints (Go layout "Mon Jan _2 15:04:05 2006" in time.Local, whole seconds). It is
// read from the operating system (the /proc files on Linux, sysctl on macOS); `ps`, bounded to
// 5 seconds, is only the fallback.
func ProcessBirth(pid int) (string, error) {
	start, osErr := osStartTime(pid)
	if osErr == nil {
		return formatBirth(start), nil
	}
	out, psErr := runPS(pid, "lstart=")
	if psErr == nil {
		birth := strings.TrimSpace(string(out))
		if _, err := time.ParseInLocation(birthLayout, birth, time.Local); err == nil {
			return birth, nil
		}
		psErr = psFailure(pid, errors.New("unparsable output"))
	}
	return "", fmt.Errorf("process %d start time could not be read: %v; %v", pid, osErr, psErr)
}

func formatBirth(start int64) string {
	return time.Unix(start, 0).In(time.Local).Format(birthLayout)
}

func psFailure(pid int, cause error) error {
	return fmt.Errorf("ps -p %d: %w", pid, cause)
}

// runPS runs `ps -p <pid>` with the given -o columns under LC_ALL=C in its own process group,
// bounded by psBound.
func runPS(pid int, columns ...string) ([]byte, error) {
	args := []string{"-p", strconv.Itoa(pid)}
	for _, c := range columns {
		args = append(args, "-o", c)
	}
	ctx, cancel := context.WithTimeout(context.Background(), psBound)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ps", args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		killGroup(cmd.Process.Pid)
		return cmd.Process.Kill()
	}
	cmd.WaitDelay = psWaitDelay
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, fmt.Errorf("ps -p %d timed out after %s", pid, psBound)
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			err = errors.New(exit.ProcessState.String())
		}
		return nil, psFailure(pid, err)
	}
	return out.Bytes(), nil
}

// observeProcess reads the uid, name and start time of process pid from the operating system
// and, only when that fails, from `ps -p <pid> -o uid= -o comm= -o lstart=`.
func observeProcess(pid int) (procObservation, error) {
	if o, err := osProcess(pid); err == nil {
		return o, nil
	}
	out, err := runPS(pid, "uid=", "comm=", "lstart=")
	if err != nil {
		return procObservation{}, err
	}
	fields := strings.Fields(string(out))
	if len(fields) < 7 {
		return procObservation{}, psFailure(pid, errors.New("incomplete output"))
	}
	uid, err := strconv.Atoi(fields[0])
	if err != nil {
		return procObservation{}, psFailure(pid, err)
	}
	started, err := time.ParseInLocation("Mon Jan 2 15:04:05 2006", strings.Join(fields[len(fields)-5:], " "), time.Local)
	if err != nil {
		return procObservation{}, psFailure(pid, err)
	}
	return procObservation{uid: uid, name: strings.Join(fields[1:len(fields)-5], " "), start: started.Unix()}, nil
}
