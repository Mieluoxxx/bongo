# Bongo

A desktop companion for the Live2D model in `live2d/`, built with
[mygo](https://github.com/egoist/mygo).

The model follows the pointer, nods on every key press, and shows one of
its expressions every 20 keys.

## Run

    go run .

On Windows, build the app with

    powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1

which writes `dist\Bongo.exe`, a windowed build without a console. Windows
11 22H2 or newer shows the desktop through the window; the WebView2 runtime
it needs comes with Windows 10 and 11.

- Drag the model anywhere; a plain click on it pets it.
- The pen over its order pad follows the pointer and presses down while
  the left mouse button is held, in any app; ⌘Z or Ctrl+Z lights the pad's
  undo, E its eraser.
- Scroll, or pinch on a trackpad, over the model to change its size.
- Right-click the model for its menu, a ring of petals: 样式 (styles),
  表情 (expressions), 动作 (motions), 大小 (size), 固定 (lock the model in
  place: no dragging, no wheel or pinch zoom), 隐藏 (hide) and 退出 (quit).
  The ring goes all the way round the model, outside it; near an edge of
  the screen the model steps away from it while the menu is open. 样式,
  表情, 动作 and 大小 open one settings panel, a tab each, beside the model;
  its title bar drags it.
- Press ⌘⇧B on macOS, Ctrl+Shift+B on Windows, to hide or show it.

Where the model is, its size, the styles it wears and whether it is locked
are kept in `pet.json` in the app's user data folder, such as
`%APPDATA%\Bongo\pet.json` on Windows.

## Windows

The pet is a frameless, click-through, always-on-top window over the work
area of its display. A click on it does not take the keyboard from the app
you are in, and it stays out of the taskbar and Alt+Tab. The window lets
the mouse through everywhere but over the pet and its menus.

Windows needs no Accessibility permission: `internal/input` hears keys and
the left mouse button in every app with the low-level `WH_KEYBOARD_LL` and
`WH_MOUSE_LL` hooks. The page keeps the same key codes on both platforms,
so Ctrl+Z lights the order pad's undo and E its eraser as ⌘Z does on macOS.

There is no pinch event of its own on Windows: the wheel over the pet
zooms it, and a precision touchpad's pinch may reach the page as
Ctrl+wheel. The window shows on the virtual desktop it was opened on, not
on every one. The build is unsigned, so SmartScreen may ask for
confirmation the first time it runs.

## Keyboard permission

On macOS the app hears keys pressed in other apps through the
Accessibility permission: System Settings → Privacy & Security →
Accessibility. When it is missing, the app shows a prompt with a button
that opens that pane.

The same permission lets a pinch over the model zoom it while another app
is in front: macOS hands trackpad gestures to the active app only, so the
app catches pinches over the model on their way there. Without it, a pinch
zooms the model only after a click has made the app active.

Windows needs no permission for either: its low-level hooks hear every app,
and the wheel reaches the page over the pet.

## How it works

- `main.go` opens a transparent always-on-top mygo window and serves `web/`
  and `live2d/` from the embedded filesystem.
- `web/app.js` draws the model with PixiJS and pixi-live2d-display, plays
  the model's `Idle` motion, and drives its head, eyes and mouth from the
  pointer and key events.
- `web/motion.js` plays the model's animations: once, or held on their
  last frame until played again, and laid over the pose each frame so
  nothing they move stays moved.
- `web/menu.js` draws the ring of petals.
- `web/settings.js` is the settings panel: its tabs, where it goes beside
  the model, and dragging it.
- `overlay.go` keeps the window over the work area of the model's
  display, lets the mouse through it everywhere but over the model, and
  keeps the model's place, size and styles.
- `internal/input` listens for keys and the left mouse button with
  `NSEvent` on macOS and the low-level Windows hooks on Windows.
- `internal/window` makes the pet's window and tunes it for the
  platform: on macOS it hides the title bar and the window buttons of the
  window mygo made while keeping its titled style, which is what makes a
  transparent WKWebView render without darkening on macOS 27; on Windows
  it gives the pet a frameless window without a redirection bitmap, which
  is what lets the page's transparent pixels show the desktop, keeps a
  click from activating the app, and keeps the window out of the taskbar
  and Alt+Tab.
- `live2d/c_0120.model3.json` lists the model's motions and expressions,
  and `live2d/styles.json` groups the styles for the 样式 menu.

## The model's files

    live2d/
      c_0120.model3.json      the model: moc, textures, physics, and the lists below
      c_0120.moc3 …           moc, physics, display info, textures (c_0120.2048/)
      expressions/            passing expressions: 开心兴奋, 星星眼, 哭 …
      gestures/               poses of the hands and props: 点菜按下, 双手比耶 …
      styles/<group>/         what the model wears until told otherwise
      styles.json             the style groups, which of them are exclusive
      expressions.json        the kinds the 表情 tab sorts the expressions into
      motions.json            the animations in the 动作 menu, which of them hold
      motions/                idle, and the animations: 自拍, 番茄酱, 泡泡糖 …
      vtube/                  VTube Studio's settings for the model, icon

`styles.json` names each style after its exp3 file in `styles/<group>/`,
or gives it a name of its own and the files it wears together:

    {"name": "银色魔爪", "files": ["魔爪", "魔爪换色"]}

A group marked `exclusive` wears one style at most, and the menu offers 无
(none) for it. `vtube/c_0120.vtube.json` describes the files as they were
laid out for VTube Studio, in one folder; it is kept for reference.

## Window

The window covers the work area of the display the model is on and keeps
that frame: the page moves the canvas and scales the model in it, in the
same frame, so dragging and zooming never wait for the window. A window
resized every frame shows its web view a frame late, the old picture at
the new place. The page reports where it takes the mouse — the model, and
the menu while it is open — and the window lets the mouse through
everywhere else. Dragging the model to another display takes the window
there.

On Windows the window also stays out of the taskbar and Alt+Tab, and a
click on the pet leaves the keyboard in the app the user is typing in.

## Known limitation

On macOS the window is not frameless: it keeps the titled style with the
title bar and the buttons hidden. A frameless window darkens the content of
its WKWebView in mygo 0.6.4 on macOS 27, and the same darkening rules out
`ui.WebView` in a window of native UI, so the model lives in a page window
for now. A titled window also stays below the menu bar.

On Windows the transparent window needs the no-redirection-bitmap window
and DirectComposition of Windows 11 22H2 or newer; on Windows 10 the window
is opaque. It shows on the virtual desktop it was opened on, not on every
one.

## License

The code of Bongo is under the MIT license, in [LICENSE](LICENSE).

The character in `live2d/`, 大肥鱼 by
[ZipZipPipe](https://space.bilibili.com/4168597),
[茶坤菜的](https://space.bilibili.com/2505395) and
[六青](https://space.bilibili.com/11272072) on bilibili, is not: it is
under CC BY-NC-SA 4.0, in
[live2d/LICENSE](live2d/LICENSE), with its credits and Bongo's changes to
it in [live2d/NOTICE.md](live2d/NOTICE.md). The app embeds the model, so a
built binary carries it too: share builds only non-commercially, crediting
the creator, under the same license for the model.

`web/vendor` holds third-party code under licenses of its own, listed in
[web/vendor/licenses](web/vendor/licenses/README.md); Live2D Cubism Core
among it is proprietary, redistributed under Live2D's license agreement.
