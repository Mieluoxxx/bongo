//go:build darwin

// Package macos reaches the NSWindow mygo made, for what its options leave
// out: a window that keeps the titled style its web view renders in, with
// no title bar, no window buttons, and the page under all of it.
package macos

import (
	"unsafe"

	"github.com/ebitengine/purego/objc"
)

func sel(name string) objc.SEL { return objc.RegisterName(name) }

func utf8(id objc.ID) string {
	if id == 0 {
		return ""
	}
	p := id.Send(sel("UTF8String"))
	if p == 0 {
		return ""
	}
	var b []byte
	for {
		c := *(*byte)(unsafe.Pointer(p))
		if c == 0 {
			return string(b)
		}
		b = append(b, c)
		p++
	}
}

const (
	titleHidden                  = 1
	styleMaskFullSizeContentView = 1 << 15
)

// HideTitleBar hides the title bar and the window buttons of the window
// titled title, and lets its page fill the whole window. The window keeps
// its titled style: a frameless window darkens a WKWebView on macOS 27.
func HideTitleBar(title string) bool {
	app := objc.ID(objc.GetClass("NSApplication")).Send(sel("sharedApplication"))
	windows := app.Send(sel("windows"))
	n := int(windows.Send(sel("count")))
	for i := 0; i < n; i++ {
		w := windows.Send(sel("objectAtIndex:"), uintptr(i))
		if utf8(w.Send(sel("title"))) != title {
			continue
		}
		for b := uintptr(0); b < 3; b++ {
			if button := w.Send(sel("standardWindowButton:"), b); button != 0 {
				button.Send(sel("setHidden:"), 1)
			}
		}
		w.Send(sel("setTitleVisibility:"), titleHidden)
		w.Send(sel("setTitlebarAppearsTransparent:"), 1)
		w.Send(sel("setStyleMask:"), w.Send(sel("styleMask"))|styleMaskFullSizeContentView)
		return true
	}
	return false
}

// clickMonitor keeps the monitor of ActivateOnClick alive.
var clickMonitor objc.ID

// ActivateOnClick makes a click on the window titled title activate the app
// and give the window the keyboard first. macOS drags only a key window, so
// the drag the page starts on that same click would move nothing.
func ActivateOnClick(title string) bool {
	app := objc.ID(objc.GetClass("NSApplication")).Send(sel("sharedApplication"))
	windows := app.Send(sel("windows"))
	n := int(windows.Send(sel("count")))
	for i := 0; i < n; i++ {
		w := windows.Send(sel("objectAtIndex:"), uintptr(i))
		if utf8(w.Send(sel("title"))) != title {
			continue
		}
		handler := objc.NewBlock(func(_ objc.Block, e objc.ID) objc.ID {
			if byte(app.Send(sel("isActive"))) == 0 {
				app.Send(sel("activateIgnoringOtherApps:"), 1)
				w.Send(sel("makeKeyWindow"))
			}
			return e
		})
		// NSEventMaskLeftMouseDown.
		clickMonitor = objc.ID(objc.GetClass("NSEvent")).Send(
			sel("addLocalMonitorForEventsMatchingMask:handler:"), uintptr(1<<1), handler)
		return clickMonitor != 0
	}
	return false
}

// AcceptFirstClick makes the web view deliver the click that would activate
// the app to the page too, so a drag that starts on it moves the window
// straight away instead of on the second click.
func AcceptFirstClick() {
	for _, name := range []string{"MyGoWebView", "WKContentView"} {
		class := objc.GetClass(name)
		if class == 0 {
			continue
		}
		imp := objc.NewIMP(func(objc.ID, objc.SEL, objc.ID) bool { return true })
		class.AddMethod(sel("acceptsFirstMouse:"), imp, "c@:@")
	}
}

// IgnoreMouse returns a function that makes the window titled title let
// the mouse through to whatever is under it, or take it again, or nil when
// there is no such window. Both must run on the main thread.
func IgnoreMouse(title string) func(ignore bool) {
	app := objc.ID(objc.GetClass("NSApplication")).Send(sel("sharedApplication"))
	windows := app.Send(sel("windows"))
	n := int(windows.Send(sel("count")))
	for i := 0; i < n; i++ {
		w := windows.Send(sel("objectAtIndex:"), uintptr(i))
		if utf8(w.Send(sel("title"))) != title {
			continue
		}
		return func(ignore bool) { w.Send(sel("setIgnoresMouseEvents:"), ignore) }
	}
	return nil
}
