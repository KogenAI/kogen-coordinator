package git

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// clockTicks is the kernel's USER_HZ, the unit of field 22 of /proc/<pid>/stat.
const clockTicks = 100

// osStartTime is the start of pid: btime of /proc/stat plus the starttime of /proc/<pid>/stat.
func osStartTime(pid int) (int64, error) {
	stat, err := readProcStat(pid)
	if err != nil {
		return 0, err
	}
	return startFromStat(pid, stat)
}

// osProcess reads the uid, name and start of pid from /proc.
func osProcess(pid int) (procObservation, error) {
	stat, err := readProcStat(pid)
	if err != nil {
		return procObservation{}, err
	}
	start, err := startFromStat(pid, stat)
	if err != nil {
		return procObservation{}, err
	}
	open, closing := strings.IndexByte(stat, '('), strings.LastIndexByte(stat, ')')
	if open < 0 || closing < open {
		return procObservation{}, fmt.Errorf("parse /proc/%d/stat: no command name", pid)
	}
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return procObservation{}, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		rest, ok := strings.CutPrefix(line, "Uid:")
		if !ok {
			continue
		}
		fields := strings.Fields(rest)
		if len(fields) < 2 {
			break
		}
		uid, err := strconv.Atoi(fields[1])
		if err != nil {
			return procObservation{}, fmt.Errorf("parse /proc/%d/status: %w", pid, err)
		}
		return procObservation{uid: uid, name: stat[open+1 : closing], start: start}, nil
	}
	return procObservation{}, fmt.Errorf("parse /proc/%d/status: no Uid line", pid)
}

func readProcStat(pid int) (string, error) {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	return string(b), err
}

func startFromStat(pid int, stat string) (int64, error) {
	closing := strings.LastIndexByte(stat, ')')
	if closing < 0 {
		return 0, fmt.Errorf("parse /proc/%d/stat: no command name", pid)
	}
	// The fields after the name start at field 3 (state); starttime is field 22.
	fields := strings.Fields(stat[closing+1:])
	if len(fields) < 20 {
		return 0, fmt.Errorf("parse /proc/%d/stat: %d fields after the command name", pid, len(fields))
	}
	ticks, err := strconv.ParseInt(fields[19], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse /proc/%d/stat: starttime: %w", pid, err)
	}
	b, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(line, "btime "); ok {
			btime, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
			if err != nil {
				return 0, fmt.Errorf("parse /proc/stat: btime: %w", err)
			}
			return btime + ticks/clockTicks, nil
		}
	}
	return 0, fmt.Errorf("parse /proc/stat: no btime line")
}
