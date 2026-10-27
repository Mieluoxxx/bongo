//go:build darwin

// The ObjC the pet's window needs and mygo's options leave out: a window
// that keeps the titled style its web view renders in, with no title bar,
// no window buttons, and the page under all of it.

package window

import "github.com/ebitengine/purego/objc"

func sel(name string) objc.SEL { return objc.RegisterName(name) }

const (
	titleHidden                  = 1
	styleMaskFullSizeContentView = 1 << 15
)

// hideTitleBar hides the title bar and the window buttons of w, and lets
// its page fill the whole window. The window keeps its titled style: a
// frameless window darkens a WKWebView on macOS 27.
func hideTitleBar(w objc.ID) bool {
	if w == 0 {
		return false
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

// clickMonitor keeps the monitor of activateOnClick alive.
var clickMonitor objc.ID

// activateOnClick makes a click on w activate the app and give the window
// the keyboard first. macOS drags only a key window, so the drag the page
// starts on that same click would move nothing.
func activateOnClick(w objc.ID) bool {
	if w == 0 {
		return false
	}
	app := objc.ID(objc.GetClass("NSApplication")).Send(sel("sharedApplication"))
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

// acceptFirstClick makes the web view deliver the click that would activate
// the app to the page too, so a drag that starts on it moves the window
// straight away instead of on the second click.
func acceptFirstClick() {
	for _, name := range []string{"MyGoWebView", "WKContentView"} {
		class := objc.GetClass(name)
		if class == 0 {
			continue
		}
		imp := objc.NewIMP(func(objc.ID, objc.SEL, objc.ID) bool { return true })
		class.AddMethod(sel("acceptsFirstMouse:"), imp, "c@:@")
	}
}

// ignoreMouse returns a function that makes w let the mouse through to
// whatever is under it, or take it again, or nil when there is no window.
// Both must run on the main thread.
func ignoreMouse(w objc.ID) func(ignore bool) {
	if w == 0 {
		return nil
	}
	return func(ignore bool) { w.Send(sel("setIgnoresMouseEvents:"), ignore) }
}
