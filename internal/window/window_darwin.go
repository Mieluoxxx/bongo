//go:build darwin

package window

import (
	"log"

	"github.com/ebitengine/purego/objc"
	"github.com/egoist/mygo"
)

// platformOptions leaves the window mygo makes alone: the style mask that
// Setup sets takes the title bar off a titled window, which is what keeps
// a transparent WKWebView from darkening on macOS 27.
func platformOptions(o *mygo.WindowOptions) {}

// Setup hides the title bar and the window buttons, and covers the work
// area again, which the style mask changed.
func Setup(win *mygo.Window, area mygo.Rectangle, icon []byte) {
	w := objc.ID(win.NativeHandle())
	log.Println("hide title bar:", hideTitleBar(w))
	log.Println("activate on click:", activateOnClick(w))
	acceptFirstClick()
	log.Println("watch double click:", watchDoubleClick())
	win.SetBounds(area)
	win.Show()
}

// IgnoreMouse returns a function that makes the window let the mouse
// through to whatever is under it, or take it again, or nil when there is
// no window. Both must run on the main thread.
func IgnoreMouse(win *mygo.Window) func(ignore bool) {
	return ignoreMouse(objc.ID(win.NativeHandle()))
}

// Show shows the pet's window again after Hide.
func Show(win *mygo.Window) { win.Show() }

// WatchPinch calls fn with each step of a trackpad pinch that starts over
// the pet, at the pointer, and keeps the pinch from going anywhere else.
// over reports whether the pointer is over the pet.
func WatchPinch(over func() bool, fn func(mag float64, at mygo.Point)) bool {
	return watchPinch(func(mag float64) {
		fn(mag, mygo.Screen.CursorScreenPoint())
	}, over)
}
