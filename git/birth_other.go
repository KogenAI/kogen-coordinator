//go:build !linux && !darwin

package git

import (
	"fmt"
	"runtime"
)

func osStartTime(int) (int64, error) {
	return 0, fmt.Errorf("no process table source on %s", runtime.GOOS)
}

func osProcess(int) (procObservation, error) {
	return procObservation{}, fmt.Errorf("no process table source on %s", runtime.GOOS)
}
