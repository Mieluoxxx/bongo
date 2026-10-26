//go:build !darwin

// Package macos reaches the NSWindow mygo made. Off macOS there is no
// NSWindow: every call reports that it changed nothing.
package macos

// HideTitleBar reports that there is no title bar to hide.
func HideTitleBar(title string) bool { return false }

// ActivateOnClick reports that there is no window to activate.
func ActivateOnClick(title string) bool { return false }

// AcceptFirstClick does nothing.
func AcceptFirstClick() {}

// WatchDoubleClick reports that there is no double click to watch.
func WatchDoubleClick() bool { return false }

// IgnoreMouse reports that there is no window to let the mouse through.
func IgnoreMouse(title string) func(ignore bool) { return nil }

// WatchPinch reports that there are no pinches to watch.
func WatchPinch(fn func(mag float64), over func() bool) bool { return false }
