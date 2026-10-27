//go:build !darwin && !windows

package input

// StartKeyboard is a no-op: the app listens on macOS and Windows alone for
// now.
func StartKeyboard(fn func(Key)) {}

// StartMouse is a no-op.
func StartMouse(fn func(down bool)) {}

// AccessibilityTrusted reports false where the app cannot listen.
func AccessibilityTrusted() bool { return false }

// OpenAccessibilitySettings is a no-op.
func OpenAccessibilitySettings() {}
