package git

import (
	"fmt"
	"syscall"
	"unsafe"
)

// The sysctl MIB of one process and the fields of its kinfo_proc (sys/sysctl.h, sys/proc.h;
// the layout is the same on amd64 and arm64).
const (
	ctlKern     = 1
	kernProc    = 14
	kernProcPID = 1

	kinfoProcSize = 648
	offStartSec   = 0   // kp_proc.p_starttime.tv_sec (int64)
	offPID        = 40  // kp_proc.p_pid (int32)
	offComm       = 243 // kp_proc.p_comm (char[17])
	commSize      = 17
	offUID        = 420 // kp_eproc.e_ucred.cr_uid (uint32)
)

// kinfoProc reads the kinfo_proc of pid; a zero-length answer means no such process.
func kinfoProc(pid int) ([]byte, error) {
	fail := func(cause error) error { return fmt.Errorf("sysctl kern.proc.pid.%d: %w", pid, cause) }
	mib := [4]int32{ctlKern, kernProc, kernProcPID, int32(pid)}
	buf := make([]byte, 2*kinfoProcSize)
	size := uintptr(len(buf))
	_, _, errno := syscall.Syscall6(syscall.SYS___SYSCTL,
		uintptr(unsafe.Pointer(&mib[0])), uintptr(len(mib)),
		uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), 0, 0)
	if errno != 0 {
		return nil, fail(errno)
	}
	if size == 0 {
		return nil, fail(fmt.Errorf("no such process"))
	}
	if size != kinfoProcSize {
		return nil, fail(fmt.Errorf("answer of %d bytes, want %d", size, kinfoProcSize))
	}
	if got := *(*int32)(unsafe.Pointer(&buf[offPID])); got != int32(pid) {
		return nil, fail(fmt.Errorf("answer names pid %d", got))
	}
	return buf[:size], nil
}

func osStartTime(pid int) (int64, error) {
	o, err := osProcess(pid)
	return o.start, err
}

// osProcess reads the uid, name and start of pid from its kinfo_proc.
func osProcess(pid int) (procObservation, error) {
	buf, err := kinfoProc(pid)
	if err != nil {
		return procObservation{}, err
	}
	start := *(*int64)(unsafe.Pointer(&buf[offStartSec]))
	if start <= 0 {
		return procObservation{}, fmt.Errorf("sysctl kern.proc.pid.%d: no start time", pid)
	}
	comm := buf[offComm : offComm+commSize]
	n := 0
	for n < len(comm) && comm[n] != 0 {
		n++
	}
	return procObservation{
		uid:   int(*(*uint32)(unsafe.Pointer(&buf[offUID]))),
		name:  string(comm[:n]),
		start: start,
	}, nil
}
