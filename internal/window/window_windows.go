//go:build windows

package window

import (
	"log"
	"syscall"

	"github.com/egoist/mygo"
)

// platformOptions gives the pet a frameless window to draw in. The
// material is asked for only to have mygo make a window without a
// redirection bitmap: Setup takes it away again, and what the page leaves
// transparent then shows the desktop.
func platformOptions(o *mygo.WindowOptions) {
	o.Frameless = true
	o.Hidden = true
	o.SkipTaskbar = true
	o.Vibrancy = mygo.VibrancyAcrylic
}

// Setup takes the material away, covers the work area, and keeps the window
// out of the way of the app the user is in.
func Setup(win *mygo.Window, area mygo.Rectangle, icon []byte) {
	win.SetVibrancy("")
	// A window at 0,0 is centered by mygo: put it back over the work area.
	win.SetBounds(area)
	if len(icon) > 0 {
		if err := win.SetIcon(icon); err != nil {
			log.Println("set icon:", err)
		}
	}
	setOverlayStyle(win.NativeHandle())
	win.ShowInactive()
}

// IgnoreMouse returns a function that makes the window let the mouse
// through to whatever is under it, or take it again.
func IgnoreMouse(win *mygo.Window) func(ignore bool) {
	return win.SetIgnoreMouseEvents
}

// Show shows the pet's window again after Hide, without taking the keyboard
// from the app the user is in.
func Show(win *mygo.Window) { win.ShowInactive() }

// WatchPinch reports that there are no pinches to watch: Windows delivers
// wheel notches to the page, and trackpad pinches are touch gestures.
func WatchPinch(over func() bool, fn func(mag float64, at mygo.Point)) bool { return false }

const (
	gwlExStyle     = uintptr(0xFFFFFFEC) // -20, as a 32-bit index
	wsExToolWindow = 0x00000080
	wsExNoActivate = 0x08000000

	swpNoSize       = 0x0001
	swpNoMove       = 0x0002
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	swpFrameChanged = 0x0020
)

var (
	user32                = syscall.NewLazyDLL("user32.dll")
	procGetWindowLongPtrW = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW = user32.NewProc("SetWindowLongPtrW")
	procSetWindowPosW     = user32.NewProc("SetWindowPos")
)

// setOverlayStyle keeps a click on the pet from taking the keyboard away
// from the app the user is in, and keeps the window out of Alt+Tab.
func setOverlayStyle(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	ex, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	ex |= wsExToolWindow | wsExNoActivate
	procSetWindowLongPtrW.Call(hwnd, gwlExStyle, ex)
	procSetWindowPosW.Call(hwnd, 0, 0, 0, 0, 0,
		swpNoMove|swpNoSize|swpNoZOrder|swpNoActivate|swpFrameChanged)
}
