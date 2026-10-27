// Package window is the pet's window: a frameless, always-on-top frame
// over the work area of a display, drawn in by the page and tuned the way
// each platform needs.
package window

import "github.com/egoist/mygo"

// New makes the pet's window from options written for every platform,
// tuned as this one needs.
func New(o mygo.WindowOptions) *mygo.Window {
	platformOptions(&o)
	return mygo.NewWindow(o)
}
