//go:build darwin

package macos

import (
	"unsafe"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

// pinchMonitor keeps the pinch monitor alive.
var pinchMonitor objc.ID

// msgMagnification reads a CGFloat, which objc.ID.Send cannot.
var msgMagnification func(id objc.ID, sel objc.SEL) float64

var (
	cgEventTapCreate              func(tap, place, options uint32, mask uint64, callback, info uintptr) uintptr
	cgEventTapEnable              func(port uintptr, enable bool)
	cfMachPortCreateRunLoopSource func(alloc, port uintptr, order int) uintptr
	cfRunLoopGetMain              func() uintptr
	cfRunLoopAddSource            func(loop, source, mode uintptr)
	cfRunLoopCommonModes          uintptr
)

func init() {
	lib, err := purego.Dlopen("/usr/lib/libobjc.A.dylib", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return
	}
	addr, err := purego.Dlsym(lib, "objc_msgSend")
	if err != nil {
		return
	}
	purego.RegisterFunc(&msgMagnification, addr)

	cg, err := purego.Dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return
	}
	cf, err := purego.Dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return
	}
	modes, err := purego.Dlsym(cf, "kCFRunLoopCommonModes")
	if err != nil {
		return
	}
	cfRunLoopCommonModes = **(**uintptr)(unsafe.Pointer(&modes))
	purego.RegisterLibFunc(&cgEventTapCreate, cg, "CGEventTapCreate")
	purego.RegisterLibFunc(&cgEventTapEnable, cg, "CGEventTapEnable")
	purego.RegisterLibFunc(&cfMachPortCreateRunLoopSource, cf, "CFMachPortCreateRunLoopSource")
	purego.RegisterLibFunc(&cfRunLoopGetMain, cf, "CFRunLoopGetMain")
	purego.RegisterLibFunc(&cfRunLoopAddSource, cf, "CFRunLoopAddSource")
}

const (
	eventTypeGesture = 29
	eventTypeMagnify = 30

	tapDisabledByTimeout   = 0xFFFFFFFE
	tapDisabledByUserInput = 0xFFFFFFFF

	phaseBegan = 1 << 0
)

// pinchTap keeps the event tap of WatchPinch alive.
var pinchTap uintptr

// WatchPinch calls fn with each step of a trackpad pinch over the pet, as
// the factor the fingers ask for, and keeps the event from going anywhere
// else: the page gets no gesture events of its own in a web view. over
// reports whether the pointer is over the pet.
//
// macOS hands gestures to the active app alone, and the pet is rarely the
// active app, so the pinch is caught on its way there, which takes the
// Accessibility permission. Without it, the pet hears pinches only while it
// is active.
func WatchPinch(fn func(mag float64), over func() bool) bool {
	if msgMagnification == nil {
		return false
	}
	if cgEventTapCreate != nil && watchPinchTap(fn, over) {
		return true
	}
	handler := objc.NewBlock(func(_ objc.Block, e objc.ID) objc.ID {
		mag := msgMagnification(e, sel("magnification"))
		if mag != 0 {
			fn(mag)
		}
		return 0
	})
	// NSEventMaskMagnify.
	pinchMonitor = objc.ID(objc.GetClass("NSEvent")).Send(
		sel("addLocalMonitorForEventsMatchingMask:handler:"), uintptr(1<<eventTypeMagnify), handler)
	return pinchMonitor != 0
}

func watchPinchTap(fn func(mag float64), over func() bool) bool {
	// A pinch belongs to the pet when it starts over it, as gestures belong
	// to the view under the pointer when they begin.
	mine := false
	callback := purego.NewCallback(func(_, typ, event, _ uintptr) uintptr {
		switch uint32(typ) {
		case tapDisabledByTimeout, tapDisabledByUserInput:
			cgEventTapEnable(pinchTap, true)
			return event
		}
		pool := objc.ID(objc.GetClass("NSAutoreleasePool")).Send(sel("new"))
		defer pool.Send(sel("drain"))
		e := objc.ID(objc.GetClass("NSEvent")).Send(sel("eventWithCGEvent:"), event)
		if e == 0 || e.Send(sel("type")) != eventTypeMagnify {
			return event
		}
		if phase := e.Send(sel("phase")); phase == 0 || phase&phaseBegan != 0 {
			mine = over()
		}
		if !mine {
			return event
		}
		if mag := msgMagnification(e, sel("magnification")); mag != 0 {
			fn(mag)
		}
		return 0
	})
	// kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault.
	pinchTap = cgEventTapCreate(1, 0, 0, 1<<eventTypeGesture, callback, 0)
	if pinchTap == 0 {
		return false
	}
	source := cfMachPortCreateRunLoopSource(0, pinchTap, 0)
	if source == 0 {
		return false
	}
	cfRunLoopAddSource(cfRunLoopGetMain(), source, cfRunLoopCommonModes)
	cgEventTapEnable(pinchTap, true)
	return true
}

// doubleClickMonitor keeps the monitor of WatchDoubleClick alive.
var doubleClickMonitor objc.ID

// WatchDoubleClick keeps double clicks from the page: macOS zooms the window
// on a double click in the drag region, which a pet has no use for, and
// undoing the zoom moves the window.
func WatchDoubleClick() bool {
	handler := objc.NewBlock(func(_ objc.Block, e objc.ID) objc.ID {
		if e.Send(sel("clickCount")) > 1 {
			return 0
		}
		return e
	})
	// NSEventMaskLeftMouseDown.
	doubleClickMonitor = objc.ID(objc.GetClass("NSEvent")).Send(
		sel("addLocalMonitorForEventsMatchingMask:handler:"), uintptr(1<<1), handler)
	return doubleClickMonitor != 0
}
