// Bongo is a desktop companion: the Live2D model in live2d/ sits on the
// screen, follows the pointer and reacts to every key pressed.
//
//	go run .
package main

import (
	"embed"
	"io/fs"
	"log"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"

	"bongo/internal/input"
	"bongo/internal/window"
)

//go:embed all:web all:live2d
var assets embed.FS

// icon is the picture the taskbar and Alt+Tab show the pet by.
var icon, _ = fs.ReadFile(assets, "live2d/vtube/icon.png")

// appFS serves the frontend at the root and the model under /live2d.
type appFS struct{}

func (appFS) Open(name string) (fs.File, error) {
	name = strings.TrimPrefix(name, "/")
	switch {
	case name == "" || name == ".":
		return assets.Open("web")
	case strings.HasPrefix(name, "live2d/"):
		return assets.Open(name)
	default:
		return assets.Open("web/" + name)
	}
}

type KeyEvent struct {
	Code    int  `json:"code"`
	Control bool `json:"control"`
	Command bool `json:"command"`
}

// MouseEvent is the left mouse button going down or up, anywhere.
type MouseEvent struct {
	Down bool `json:"down"`
}

// PointerEvent is where the pointer is, in page points.
type PointerEvent struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type StatusEvent struct {
	Accessibility bool `json:"accessibility"`
}

var (
	keyEvents     = mygo.NewEvent[KeyEvent]("bongo:key")
	mouseEvents   = mygo.NewEvent[MouseEvent]("bongo:mouse")
	pointerEvents = mygo.NewEvent[PointerEvent]("bongo:pointer")
	statusEvents  = mygo.NewEvent[StatusEvent]("bongo:status")
)

// bongo is callable from the page.
type bongo struct {
	win *mygo.Window
	overlay
}

func (b *bongo) Quit() { mygo.App.Quit() }

func (b *bongo) Hide() {
	if b.win != nil {
		b.win.Hide()
	}
}

func (b *bongo) OpenAccessibility() { input.OpenAccessibilitySettings() }

func main() {
	mygo.SetFrontend(appFS{})
	app := &bongo{}
	mygo.BindAs("Bongo", app)

	mygo.App.WhenReady(func() {
		dir, err := mygo.App.Path(mygo.PathUserData)
		if err != nil {
			log.Println("user data:", err)
		} else {
			app.file = filepath.Join(dir, "pet.json")
		}
		pet, area := startPet(dir)
		app.pet, app.area = pet, area
		win := window.New(mygo.WindowOptions{
			Title:         "Bongo",
			Width:         area.Width,
			Height:        area.Height,
			X:             area.X,
			Y:             area.Y,
			Transparent:   true,
			AlwaysOnTop:   true,
			DisableResize: true,
			DisableShadow: true,
			URL:           "/",
		})
		app.win = win
		// A pet keeps the user company on every desktop.
		win.SetVisibleOnAllWorkspaces(true)

		// A double click zooms a titled window, which a pet has no use for:
		// undo it.
		win.OnMaximize(func() { win.Unmaximize() })

		mygo.GlobalShortcut.Register("CmdOrCtrl+Shift+B", func() {
			if win.IsVisible() {
				win.Hide()
			} else {
				window.Show(win)
			}
		})

		window.Setup(win, area, icon)
		if ignore := window.IgnoreMouse(win); ignore != nil {
			go app.watch(ignore)
		} else {
			log.Println("no window to let the mouse through")
		}
		log.Println("watch pinch:", window.WatchPinch(
			func() bool { return win.IsVisible() && app.over(mygo.Screen.CursorScreenPoint(), false) },
			func(mag float64, at mygo.Point) {
				app.mu.Lock()
				a := app.area
				app.mu.Unlock()
				pinchEvents.Emit(win, PinchEvent{Mag: mag, X: float64(at.X - a.X), Y: float64(at.Y - a.Y)})
			}))
		trusted := input.AccessibilityTrusted()
		log.Println("accessibility trusted:", trusted)
		statusEvents.Emit(win, StatusEvent{Accessibility: trusted})
		input.StartKeyboard(func(k input.Key) {
			keyEvents.Emit(win, KeyEvent{Code: int(k.Code), Control: k.Control, Command: k.Command})
		})
		input.StartMouse(func(down bool) {
			mouseEvents.Emit(win, MouseEvent{Down: down})
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
