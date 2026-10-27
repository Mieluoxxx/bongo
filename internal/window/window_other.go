//go:build !darwin && !windows

package window

import "github.com/egoist/mygo"

func platformOptions(o *mygo.WindowOptions) {}

// Setup shows the window over the work area it was made for.
func Setup(win *mygo.Window, area mygo.Rectangle, icon []byte) {
	win.Show()
}

// IgnoreMouse returns a function that makes the window let the mouse
// through to whatever is under it, or take it again.
func IgnoreMouse(win *mygo.Window) func(ignore bool) {
	return win.SetIgnoreMouseEvents
}

// Show shows the pet's window again after Hide.
func Show(win *mygo.Window) { win.Show() }

// WatchPinch reports that there are no pinches to watch.
func WatchPinch(over func() bool, fn func(mag float64, at mygo.Point)) bool { return false }
