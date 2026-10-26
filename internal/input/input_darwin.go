//go:build darwin

// Package input listens to the keyboard and the mouse buttons system-wide,
// the keyboard through the Accessibility permission, and reports whether
// the app has it.
package input

import (
	"os/exec"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

const (
	// NSEventMaskKeyDown.
	keyDownMask = uint64(1 << 10)
	// NSEventMaskLeftMouseDown and NSEventMaskLeftMouseUp.
	leftMouseMask = uint64(1<<1 | 1<<2)

	eventTypeLeftMouseDown = 1

	// NSEventModifierFlagControl, NSEventModifierFlagCommand.
	flagControl = 1 << 18
	flagCommand = 1 << 20
)

// Key is one key press: its key code, and whether Control or Command was
// held.
type Key struct {
	Code    uint16
	Control bool
	Command bool
}

type watcher struct {
	monitors []objc.ID
	blocks   []objc.Block
}

// kept lets the monitors and their blocks outlive StartKeyboard and
// StartMouse.
var kept []*watcher

// StartKeyboard calls fn with every key press, in this app and in others.
// It must run on the main thread. Without the Accessibility permission
// macOS delivers no events, and the app hears only its own keys.
func StartKeyboard(fn func(Key)) {
	watch(keyDownMask, func(e objc.ID) {
		flags := uint(e.Send(objc.RegisterName("modifierFlags")))
		fn(Key{
			Code:    uint16(e.Send(objc.RegisterName("keyCode"))),
			Control: flags&flagControl != 0,
			Command: flags&flagCommand != 0,
		})
	})
}

// StartMouse calls fn as the left mouse button goes down and up, in this
// app and in others. It must run on the main thread.
func StartMouse(fn func(down bool)) {
	watch(leftMouseMask, func(e objc.ID) {
		fn(e.Send(objc.RegisterName("type")) == eventTypeLeftMouseDown)
	})
}

// watch calls fn with every event of mask, meant for this app or another.
func watch(mask uint64, fn func(e objc.ID)) {
	event := objc.ID(objc.GetClass("NSEvent"))
	global := objc.NewBlock(func(_ objc.Block, e objc.ID) { fn(e) })
	local := objc.NewBlock(func(_ objc.Block, e objc.ID) objc.ID {
		fn(e)
		return e
	})
	k := &watcher{blocks: []objc.Block{global, local}}
	for _, add := range []struct {
		selector string
		block    objc.Block
	}{
		{"addGlobalMonitorForEventsMatchingMask:handler:", global},
		{"addLocalMonitorForEventsMatchingMask:handler:", local},
	} {
		if monitor := event.Send(objc.RegisterName(add.selector), mask, add.block); monitor != 0 {
			k.monitors = append(k.monitors, monitor.Send(objc.RegisterName("retain")))
		}
	}
	kept = append(kept, k)
}

// AccessibilityTrusted reports whether the app may hear keys pressed in
// other apps.
func AccessibilityTrusted() bool {
	handle, err := purego.Dlopen("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices",
		purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return false
	}
	var trusted func() bool
	purego.RegisterLibFunc(&trusted, handle, "AXIsProcessTrusted")
	return trusted()
}

// OpenAccessibilitySettings shows the pane where the user allows the app.
func OpenAccessibilitySettings() {
	exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility").Run()
}
