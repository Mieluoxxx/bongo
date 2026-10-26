//go:build !darwin

package input

// Key is one key press: its key code, and whether Control or Command was
// held.
type Key struct {
	Code    uint16
	Control bool
	Command bool
}

// StartKeyboard is a no-op: the app listens on macOS alone for now.
func StartKeyboard(fn func(Key)) {}

// StartMouse is a no-op.
func StartMouse(fn func(down bool)) {}

// AccessibilityTrusted reports false where the app cannot listen.
func AccessibilityTrusted() bool { return false }

// OpenAccessibilitySettings is a no-op.
func OpenAccessibilitySettings() {}
