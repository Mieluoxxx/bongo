//go:build windows

package input

import (
	"log"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	whKeyboardLL = 13
	whMouseLL    = 14

	wmKeyDown     = 0x0100
	wmSysKeyDown  = 0x0104
	wmLButtonDown = 0x0201
	wmLButtonUp   = 0x0202

	vkControl = 0x11
	vkLWin    = 0x5B
	vkRWin    = 0x5C
	vkZ       = 0x5A
	vkE       = 0x45

	// The key codes of Z and E that macOS reports, which the page reads:
	// the same frontend serves both.
	macZ = 6
	macE = 14
)

// keyboardHook is KBDLLHOOKSTRUCT.
type keyboardHook struct {
	vkCode      uint32
	scanCode    uint32
	flags       uint32
	time        uint32
	dwExtraInfo uintptr
}

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procSetWindowsHookExW   = user32.NewProc("SetWindowsHookExW")
	procCallNextHookEx      = user32.NewProc("CallNextHookEx")
	procUnhookWindowsHookEx = user32.NewProc("UnhookWindowsHookEx")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procGetAsyncKeyState    = user32.NewProc("GetAsyncKeyState")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")

	keyboardFunc func(Key)
	mouseFunc    func(bool)

	keyboardCallback = syscall.NewCallback(keyboardProc)
	mouseCallback    = syscall.NewCallback(mouseProc)
)

// StartKeyboard calls fn with every key press, in this app and in others.
func StartKeyboard(fn func(Key)) {
	keyboardFunc = fn
	go runHook(whKeyboardLL, keyboardCallback)
}

// StartMouse calls fn as the left mouse button goes down and up, in this
// app and in others.
func StartMouse(fn func(down bool)) {
	mouseFunc = fn
	go runHook(whMouseLL, mouseCallback)
}

// runHook installs a low-level hook on a thread of its own and pumps the
// messages that deliver its callbacks.
func runHook(id int, callback uintptr) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	module, _, _ := procGetModuleHandleW.Call(0)
	hook, _, err := procSetWindowsHookExW.Call(uintptr(id), callback, module, 0)
	if hook == 0 {
		log.Println("input: SetWindowsHookEx:", err)
		return
	}
	defer procUnhookWindowsHookEx.Call(hook)
	var msg [48]byte // MSG
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg[0])), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg[0])))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg[0])))
	}
}

func keyboardProc(nCode, wParam uintptr, lParam *keyboardHook) uintptr {
	if nCode == 0 && (wParam == wmKeyDown || wParam == wmSysKeyDown) {
		if fn := keyboardFunc; fn != nil {
			k := lParam
			fn(Key{
				Code:    keyCode(k.vkCode),
				Control: down(vkControl),
				Command: down(vkLWin) || down(vkRWin),
			})
		}
	}
	r, _, _ := procCallNextHookEx.Call(0, nCode, wParam, uintptr(unsafe.Pointer(lParam)))
	return r
}

func mouseProc(nCode, wParam, lParam uintptr) uintptr {
	if nCode == 0 && (wParam == wmLButtonDown || wParam == wmLButtonUp) {
		if fn := mouseFunc; fn != nil {
			fn(wParam == wmLButtonDown)
		}
	}
	r, _, _ := procCallNextHookEx.Call(0, nCode, wParam, lParam)
	return r
}

// keyCode reports the code the page reads for a Windows virtual key.
func keyCode(vk uint32) uint16 {
	switch vk {
	case vkZ:
		return macZ
	case vkE:
		return macE
	}
	return uint16(vk)
}

// down reports whether a virtual key is held.
func down(vk int) bool {
	r, _, _ := procGetAsyncKeyState.Call(uintptr(vk))
	return uint16(r)&0x8000 != 0
}

// AccessibilityTrusted reports true: Windows needs no permission to listen.
func AccessibilityTrusted() bool { return true }

// OpenAccessibilitySettings is a no-op on Windows.
func OpenAccessibilitySettings() {}
