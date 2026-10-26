package main

// The window covers the work area of the display the pet is on, and keeps
// that frame while the pet moves and zooms: the page moves and scales the
// model itself, all in one frame. A window resized every frame instead
// shows its web view a frame late, the old picture at the new place.
// Everywhere but over the pet, the window lets the mouse through.

import (
	"encoding/json"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

const (
	// The pet's box at scale 1, which the page scales.
	petWidth  = 500
	petHeight = 466

	minScale = 0.4
	maxScale = 2.0
)

// Rect is an area of the page, in page points.
type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Pet is where the pet's centre is, how big it is, the styles it wears,
// and whether it is locked in place.
type Pet struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	Scale  float64  `json:"scale"`
	Styles []string `json:"styles,omitempty"`
	Locked bool     `json:"locked,omitempty"`
}

// OriginEvent tells the page the window moved by (DX, DY) the other way,
// so what stays put on screen moves by that much in the page.
type OriginEvent struct {
	DX float64 `json:"dx"`
	DY float64 `json:"dy"`
}

// PinchEvent is one step of a trackpad pinch over the pet, at a point of
// the page.
type PinchEvent struct {
	Mag float64 `json:"mag"`
	X   float64 `json:"x"`
	Y   float64 `json:"y"`
}

var (
	originEvents = mygo.NewEvent[OriginEvent]("bongo:origin")
	pinchEvents  = mygo.NewEvent[PinchEvent]("bongo:pinch")
)

// overlay is the state of bongo's window and of the pet in it.
type overlay struct {
	mu   sync.Mutex
	area mygo.Rectangle // the window, the work area it covers
	hit  []Rect         // where the page takes the mouse
	hold bool           // the page takes the mouse everywhere: a drag, a menu
	pet  Pet            // on screen
	file string         // where pet is kept
}

// SetHit tells where the page takes the mouse; the rest of the screen gets
// it through the window.
func (b *bongo) SetHit(rects []Rect, hold bool) {
	b.mu.Lock()
	b.hit, b.hold = rects, hold
	b.mu.Unlock()
}

// Initial returns the pet as it was left, in page points.
func (b *bongo) Initial() Pet {
	b.mu.Lock()
	defer b.mu.Unlock()
	pet := b.pet
	pet.X -= float64(b.area.X)
	pet.Y -= float64(b.area.Y)
	return pet
}

// Moved tells where the pet's centre went, in page points, and takes the
// window to the display it went to.
func (b *bongo) Moved(x, y float64) {
	b.mu.Lock()
	p := mygo.Point{X: b.area.X + int(x), Y: b.area.Y + int(y)}
	area := b.area
	b.mu.Unlock()
	if next := mygo.Screen.DisplayNearestPoint(p).WorkArea; next != area {
		b.place(next)
	}
}

// Save keeps the pet's centre, in page points, and its scale for the next
// start.
func (b *bongo) Save(x, y, scale float64) {
	b.mu.Lock()
	b.pet.X, b.pet.Y = float64(b.area.X)+x, float64(b.area.Y)+y
	b.pet.Scale = clamp(scale, minScale, maxScale)
	b.mu.Unlock()
	b.write()
}

// SetStyles keeps the styles the pet wears, by name, for the next start.
func (b *bongo) SetStyles(names []string) {
	b.mu.Lock()
	b.pet.Styles = names
	b.mu.Unlock()
	b.write()
}

// SetLocked keeps whether the pet is locked in place, so dragging and
// zooming leave it be.
func (b *bongo) SetLocked(locked bool) {
	b.mu.Lock()
	b.pet.Locked = locked
	b.mu.Unlock()
	b.write()
}

func (b *bongo) write() {
	b.mu.Lock()
	pet, file := b.pet, b.file
	b.mu.Unlock()
	if file == "" {
		return
	}
	data, _ := json.Marshal(pet)
	if err := os.WriteFile(file, data, 0o644); err != nil {
		log.Println("save pet:", err)
	}
}

// place moves the window over area.
func (b *bongo) place(area mygo.Rectangle) {
	b.mu.Lock()
	old := b.area
	b.area = area
	b.mu.Unlock()
	b.win.SetBounds(area)
	originEvents.Emit(b.win, OriginEvent{DX: float64(old.X - area.X), DY: float64(old.Y - area.Y)})
}

// over reports whether the page takes the mouse at p, on screen.
func (b *bongo) over(p mygo.Point, hold bool) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if hold && b.hold {
		return true
	}
	x, y := float64(p.X-b.area.X), float64(p.Y-b.area.Y)
	for _, r := range b.hit {
		if x >= r.X && x < r.X+r.W && y >= r.Y && y < r.Y+r.H {
			return true
		}
	}
	return false
}

// watch lets the mouse through the window wherever the pet is not, and
// sends the page where the pointer is, in page points.
func (b *bongo) watch(ignore func(bool)) {
	ticker := time.NewTicker(16 * time.Millisecond)
	defer ticker.Stop()
	ignoring := true
	mygo.RunOnMain(func() { ignore(true) })
	var last mygo.Point
	for tick := 1; ; tick++ {
		<-ticker.C
		if b.win.IsDestroyed() {
			return
		}
		p := mygo.Screen.CursorScreenPoint()
		if over := b.over(p, true); over == ignoring {
			ignoring = !over
			v := ignoring
			mygo.RunOnMain(func() { ignore(v) })
		}
		b.mu.Lock()
		area := b.area
		b.mu.Unlock()
		if p != last {
			last = p
			pointerEvents.Emit(b.win, PointerEvent{X: float64(p.X - area.X), Y: float64(p.Y - area.Y)})
		}
		// The Dock, or a display coming and going, changes the work area.
		if tick%60 == 0 {
			c := mygo.Point{X: area.X + area.Width/2, Y: area.Y + area.Height/2}
			if next := mygo.Screen.DisplayNearestPoint(c).WorkArea; next != area {
				b.place(next)
			}
		}
	}
}

// loadPet returns the pet as the last run left it, or as a build that
// sized the window to the pet left that window.
func loadPet(dir string) (Pet, bool) {
	var pet Pet
	if data, err := os.ReadFile(filepath.Join(dir, "pet.json")); err == nil &&
		json.Unmarshal(data, &pet) == nil && pet.Scale > 0 {
		return pet, true
	}
	var states map[string]struct {
		X, Y, Width, Height float64
	}
	if data, err := os.ReadFile(filepath.Join(dir, "window-state.json")); err == nil &&
		json.Unmarshal(data, &states) == nil {
		if s, ok := states["bongo"]; ok && s.Height > 0 {
			return Pet{X: s.X + s.Width/2, Y: s.Y + s.Height/2, Scale: s.Height / petHeight}, true
		}
	}
	return pet, false
}

// startPet is where the pet starts: where it was left, on a display still
// there, or else in the corner of the main display.
func startPet(dir string) (Pet, mygo.Rectangle) {
	pet, ok := loadPet(dir)
	if !ok {
		a := mygo.Screen.PrimaryDisplay().WorkArea
		pet = Pet{
			X:     float64(a.X+a.Width) - 24 - petWidth/2,
			Y:     float64(a.Y+a.Height) - 24 - petHeight/2,
			Scale: 1,
		}
	}
	pet.Scale = clamp(pet.Scale, minScale, maxScale)
	area := mygo.Screen.DisplayNearestPoint(mygo.Point{X: int(pet.X), Y: int(pet.Y)}).WorkArea
	pet.X = clamp(pet.X, float64(area.X), float64(area.X+area.Width))
	pet.Y = clamp(pet.Y, float64(area.Y), float64(area.Y+area.Height))
	return pet, area
}

func clamp(v, lo, hi float64) float64 {
	return math.Min(hi, math.Max(lo, v))
}
