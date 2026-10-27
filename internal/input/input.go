// Package input listens to the keyboard and the left mouse button
// system-wide: through the macOS Accessibility permission, through the
// low-level Windows hooks, and nowhere else.
package input

// Key is one key press: its key code, and whether Control or Command was
// held.
type Key struct {
	Code    uint16
	Control bool
	Command bool
}
