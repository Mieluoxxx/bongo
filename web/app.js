// Bongo ties the Live2D model to the pointer and the keyboard.

const MODEL_URL = "/live2d/c_0120.model3.json";
const bridge = window.mygo || { on() {}, call() { return Promise.resolve(); } };

// The model's content inside its 4068×4068 canvas, in canvas pixels,
// measured from the drawable vertices.
const PAD = 280;
const CONTENT = { left: 522 - PAD, top: 350 - PAD, right: 3971 + PAD, bottom: 3542 + PAD };

// The expressions that fit a cat at work, which typing and petting pick
// from. The 表情 panel offers all of them.
const EXPRESSION_NAMES = [
  "开心兴奋", "星星眼", "爱心眼", "调皮", "脸红",
  "吐舌", "问号", "感叹号", "流汗", "晕晕",
];

// The window covers the whole work area and never changes while the pet
// moves or zooms: the page moves the canvas and scales the model in it,
// both in the same frame. The canvas holds the pet at its largest, so its
// drawing buffer never changes size either.
const BOX = { width: 500, height: 466 };   // the pet at scale 1
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const STAGE = { width: BOX.width * MAX_SCALE, height: BOX.height * MAX_SCALE };

const app = new PIXI.Application({
  width: STAGE.width,
  height: STAGE.height,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

document.getElementById("stage").appendChild(app.view);

app.ticker.maxFPS = 30;

const expressions = new Map();
const state = {
  px: 0, py: 0,          // pointer target, -1 to 1
  hx: 0, hy: 0,          // eased pointer
  keyAt: -1e9,           // time of the last key
  typing: 0,             // 0 to 1, how busy the typing is
  keys: 0,
  expr: null,
  lastExpr: -1e9,
  locked: false,         // 固定: dragging and zooming leave the pet be
};

let model = null;
let core = null;

// The pen over the order pad follows the pointer and presses down while
// the left mouse button is held, in this app or any other; ⌘Z or Ctrl+Z
// lights the pad's undo, E its eraser. So the model's maker set it up for
// VTube Studio.
const UNDO_KEY = 6;     // Z
const ERASER_KEY = 14;  // E
const pad = { x: 0, y: 0, down: false, press: 0, undoAt: -1e9, eraseAt: -1e9 };

// pet is the centre of the pet in the page, and its scale.
const pet = { x: window.innerWidth / 2, y: window.innerHeight / 2, s: 1 };

function petRect() {
  const w = BOX.width * pet.s;
  const h = BOX.height * pet.s;
  return { x: pet.x - w / 2, y: pet.y - h / 2, w, h };
}

function fit() {
  if (!model) return;
  const cw = CONTENT.right - CONTENT.left;
  const ch = CONTENT.bottom - CONTENT.top;
  const s = Math.min(BOX.width / cw, BOX.height / ch) * pet.s;
  model.scale.set(s);
  model.x = STAGE.width / 2 - (CONTENT.left + cw / 2) * s;
  model.y = STAGE.height / 2 - (CONTENT.top + ch / 2) * s;
}

// place moves the canvas, and what goes with the pet, to where it is.
function place() {
  // Keep a hold on the pet: never let it go off the screen entirely. A
  // drag may take it past the window, to another display, which the window
  // goes to.
  if (!drag && !switching) {
    pet.x = Math.min(Math.max(pet.x, 0), window.innerWidth);
    pet.y = Math.min(Math.max(pet.y, 0), window.innerHeight);
  }
  app.view.style.transform =
    `translate(${pet.x - STAGE.width / 2}px, ${pet.y - STAGE.height / 2}px)`;
  const r = petRect();
  const toast = document.getElementById("toast");
  toast.style.left = pet.x + "px";
  toast.style.top = Math.min(r.y + r.h + 8, window.innerHeight - 40) + "px";
  const error = document.getElementById("error");
  error.style.left = pet.x + "px";
  error.style.top = pet.y + "px";
  reportHit();
}

// reportHit tells the app where the page takes the mouse, once a frame at
// most; everywhere else the mouse goes through the window.
let hitFrame = 0;
let hitSent = "";
let hitHeld = false;
function reportHit() {
  if (hitFrame) return;
  hitFrame = requestAnimationFrame(() => {
    hitFrame = 0;
    const rects = [petRect()];
    for (const id of ["toast", "error"]) {
      const el = document.getElementById(id);
      if (el.hidden) continue;
      const b = el.getBoundingClientRect();
      rects.push({ x: b.left, y: b.top, w: b.width, h: b.height });
    }
    const hold = Boolean(drag) || Radial.busy || Settings.visible;
    // A drag takes the mouse everywhere: where the pet is can wait for it
    // to land, rather than cross to the app every frame.
    if (drag && hitHeld) return;
    hitHeld = hold;
    const json = JSON.stringify([rects, hold]);
    if (json === hitSent) return;
    hitSent = json;
    bridge.call("Bongo.SetHit", rects, hold);
  });
}

function save() {
  bridge.call("Bongo.Save", pet.x, pet.y, pet.s);
}

// expressionGroups sort the expressions for the 表情 tab, as
// live2d/expressions.json does.
let expressionGroups = [];

// loadExpressions loads every expression the model lists in expressions/.
async function loadExpressions() {
  let list = [];
  try {
    const refs = (await (await fetch(MODEL_URL)).json()).FileReferences;
    list = (refs.Expressions || []).filter((e) => e.File.startsWith("expressions/"));
    expressionGroups = (await (await fetch("/live2d/expressions.json")).json()).groups || [];
  } catch (err) {
    console.warn("model", err);
  }
  await Promise.all(list.map(async ({ Name, File }) => {
    try {
      const res = await fetch("/live2d/" + File.split("/").map(encodeURIComponent).join("/"));
      if (!res.ok) return;
      const data = await res.json();
      expressions.set(Name, data.Parameters || []);
    } catch (err) {
      console.warn("expression", Name, err);
    }
  }));
}

function set(id, value, weight = 1) {
  if (core.getParameterIndex(id) < 0) return;
  core.setParameterValueById(id, value, weight);
}

function get(id) {
  if (core.getParameterIndex(id) < 0) return 0;
  return core.getParameterValueById(id);
}

// blend lays one exp3 parameter set over the pose, at a gain of 0 to 1.
function blend(params, gain) {
  for (const p of params) {
    if (core.getParameterIndex(p.Id) < 0) continue;
    const cur = core.getParameterValueById(p.Id);
    switch (p.Blend) {
      case "Multiply":
        core.setParameterValueById(p.Id, cur * (1 + (p.Value - 1) * gain));
        break;
      case "Overwrite":
        core.setParameterValueById(p.Id, cur * (1 - gain) + p.Value * gain);
        break;
      default:
        core.setParameterValueById(p.Id, cur + p.Value * gain);
    }
  }
}

// applyExpression blends the passing expression over the base pose.
function applyExpression(now) {
  const expr = state.expr;
  if (!expr) return;
  const t = (now - expr.at) / 1000;
  const gain = Math.min(1, t / 0.15, Math.max(0, (expr.dur - t) / 0.3));
  if (gain <= 0) {
    state.expr = null;
    renderExpressions();
    return;
  }
  blend(expr.params, gain);
}

// Styles are what the pet wears until told otherwise: a hair style, a pair
// of glasses, a dress, stickers, grouped as live2d/styles.json says. Each
// fades in and out over STYLE_FADE seconds.
const STYLE_FADE = 0.25;
const styles = {
  groups: [],
  params: new Map(),  // key -> exp3 parameters
  on: new Set(),      // keys worn
  weight: new Map(),  // key -> 0 to 1, while it fades
  at: 0,
};
const styleKey = (group, item) => `${group}·${item}`;
// An item is the name of its exp3 file, or a name and the files it wears
// together.
const itemName = (item) => (typeof item === "string" ? item : item.name);
const itemFiles = (item) => (typeof item === "string" ? [item] : item.files);

async function loadStyles() {
  try {
    const res = await fetch("/live2d/styles.json");
    styles.groups = (await res.json()).groups || [];
  } catch (err) {
    console.warn("styles", err);
    return;
  }
  await Promise.all(styles.groups.flatMap((g) => g.items.map(async (item) => {
    try {
      const params = [];
      for (const file of itemFiles(item)) {
        const res = await fetch(`/live2d/styles/${encodeURIComponent(g.name)}/${encodeURIComponent(file)}.exp3.json`);
        if (!res.ok) return;
        params.push(...((await res.json()).Parameters || []));
      }
      styles.params.set(styleKey(g.name, itemName(item)), params);
    } catch (err) {
      console.warn("style", g.name, itemName(item), err);
    }
  })));
  buildStyleMenu();
}

function applyStyles(now) {
  const dt = styles.at ? Math.min((now - styles.at) / 1000, 0.1) : 0;
  styles.at = now;
  for (const [key, params] of styles.params) {
    const target = styles.on.has(key) ? 1 : 0;
    let w = styles.weight.get(key) || 0;
    if (w !== target) {
      w = target > w ? Math.min(target, w + dt / STYLE_FADE) : Math.max(target, w - dt / STYLE_FADE);
      styles.weight.set(key, w);
    }
    if (w > 0) blend(params, w);
  }
}

// Poses are what the pet's hands do until told otherwise, from
// live2d/gestures: one at a time, fading in and out like the styles. With
// the omelette out, the left mouse button squeezes the ketchup instead of
// pressing the pen.
const POSES = ["蛋包饭", "双手比耶", "喵喵手"];
const poses = { params: new Map(), on: null, weight: new Map(), at: 0 };

async function loadPoses() {
  await Promise.all(POSES.map(async (name) => {
    try {
      const res = await fetch(`/live2d/gestures/${encodeURIComponent(name)}.exp3.json`);
      if (!res.ok) return;
      poses.params.set(name, (await res.json()).Parameters || []);
    } catch (err) {
      console.warn("pose", name, err);
    }
  }));
}

function applyPoses(now) {
  const dt = poses.at ? Math.min((now - poses.at) / 1000, 0.1) : 0;
  poses.at = now;
  for (const [name, params] of poses.params) {
    const target = poses.on === name ? 1 : 0;
    let w = poses.weight.get(name) || 0;
    if (w !== target) {
      w = target > w ? Math.min(target, w + dt / STYLE_FADE) : Math.max(target, w - dt / STYLE_FADE);
      poses.weight.set(name, w);
    }
    if (w > 0) blend(params, w);
  }
}

// pose puts the pose named name on, or takes it off if it is on.
function pose(name) {
  poses.on = poses.on === name ? null : name;
  renderMotions();
}

// wear puts a style on or takes it off; a group of exclusive styles, such
// as the glasses, wears one at most.
function wear(group, item) {
  const key = styleKey(group.name, item);
  const on = !styles.on.has(key);
  if (group.exclusive) {
    for (const other of group.items) styles.on.delete(styleKey(group.name, itemName(other)));
  }
  if (on) styles.on.add(key);
  else styles.on.delete(key);
  renderStyleMenu();
  bridge.call("Bongo.SetStyles", [...styles.on]);
}

function update() {
  const now = performance.now();

  // Pointer: the head turns first, the eyes follow a little further.
  state.hx += (state.px - state.hx) * 0.1;
  state.hy += (state.py - state.hy) * 0.1;

  // A key press is a short nod, plus a nervous wobble while typing fast.
  const age = now - state.keyAt;
  const hit = age < 200 ? Math.sin((age / 200) * Math.PI) : 0;
  state.typing = Math.max(0, state.typing - 0.015);
  const wobble = Math.sin(now / 150) * state.typing;

  set("ParamAngleX", state.hx * 24 + wobble * 1.5);
  set("ParamAngleY", -state.hy * 16 - hit * 6);
  set("ParamAngleZ", -state.hx * 7 + wobble * 2);
  set("ParamEyeBallX", state.hx * 0.85);
  set("ParamEyeBallY", -state.hy * 0.6 + hit * 0.05);
  set("ParamBodyAngleX", state.hx * 3);
  set("ParamBodyAngleY", -hit * 3 + state.typing * 0.6);
  set("ParamBodyAngleZ", -state.hx * 2 + wobble);

  pad.x += (state.px - pad.x) * 0.2;
  pad.y += (state.py - pad.y) * 0.2;
  pad.press += ((pad.down ? 1 : 0) - pad.press) * 0.35;
  set("pointX", pad.x * 30);
  set("pointY", -pad.y * 30);
  set("danbaoX", pad.x * 10);
  set("danbaoY", -pad.y * 10);
  const omelette = poses.weight.get("蛋包饭") || 0;
  set("pointZ", pad.press * (1 - omelette));
  set("bi", pad.press * (1 - omelette));
  set("ji", pad.press * omelette);
  // A key lights its tool for a moment, then lets it fade.
  const lit = (at) => Math.max(0, Math.min(1, 1 - (now - at - 250) / 200));
  set("chehui", lit(pad.undoAt));
  set("pi", lit(pad.eraseAt));

  // The mouth opens a little on each key, and the brows lift.
  if (hit > 0) {
    set("ParamMouthOpenY", Math.max(get("ParamMouthOpenY"), hit * 0.32));
    set("ParamMouthForm", Math.max(get("ParamMouthForm"), 0.1 + hit * 0.35));
  }

  applyStyles(now);
  applyPoses(now);
  applyExpression(now);
  Motions.apply(core, now);
}

function showExpression(force) {
  const now = performance.now();
  if (state.expr && !force) return;
  if (!force && now - state.lastExpr < 3500) return;
  const names = EXPRESSION_NAMES.filter((name) => expressions.has(name));
  if (names.length === 0) return;
  playExpression(names[Math.floor(Math.random() * names.length)], 1.8 + Math.random() * 0.8);
}

function playExpression(name, dur) {
  const now = performance.now();
  state.expr = { name, params: expressions.get(name), at: now, dur };
  renderExpressions();
  state.lastExpr = now;
}



function onKey(key) {
  if (key && key.code === UNDO_KEY && (key.control || key.command)) pad.undoAt = performance.now();
  if (key && key.code === ERASER_KEY && !key.control && !key.command) pad.eraseAt = performance.now();
  state.keyAt = performance.now();
  state.typing = Math.min(1, state.typing + 0.24);
  state.keys += 1;
  if (state.keys % 20 === 0) showExpression(false);
}

async function boot() {
  try {
    const start = await bridge.call("Bongo.Initial");
    if (start && start.scale > 0) {
      pet.x = start.x;
      pet.y = start.y;
      pet.s = Math.min(Math.max(start.scale, MIN_SCALE), MAX_SCALE);
      for (const key of start.styles || []) styles.on.add(key);
      state.locked = Boolean(start.locked);
    }
    place();
    const [loaded] = await Promise.all([
      PIXI.live2d.Live2DModel.from(MODEL_URL, {
        autoInteract: false,
        idleMotionGroup: "Idle",
      }),
      loadExpressions(),
      loadStyles(),
      loadPoses(),
      Motions.load(),
    ]);
    // A style a later model no longer has is not worn.
    for (const key of styles.on) if (!styles.params.has(key)) styles.on.delete(key);
    // Worn styles start on, not fading in.
    for (const key of styles.on) styles.weight.set(key, 1);
    model = loaded;
    core = model.internalModel.coreModel;
    app.stage.addChild(model);
    fit();
    place();
    model.internalModel.on("beforeModelUpdate", update);
  } catch (err) {
    console.error(err);
    const box = document.getElementById("error");
    box.textContent = "模型加载失败\n" + (err && err.message ? err.message : err);
    box.hidden = false;
    place();
  }
}

bridge.on("bongo:key", onKey);
bridge.on("bongo:mouse", (m) => { pad.down = m.down; });
bridge.on("bongo:pointer", (p) => {
  state.px = Math.min(1, Math.max(-1, (p.x - pet.x) / (window.innerWidth / 2)));
  state.py = Math.min(1, Math.max(-1, (p.y - pet.y) / (window.innerHeight / 2)));
});
bridge.on("bongo:status", (s) => {
  if (s.accessibility) return;
  const toast = document.getElementById("toast");
  toast.hidden = false;
  reportHit();
  setTimeout(() => { toast.hidden = true; reportHit(); }, 8000);
});

document.getElementById("grant").addEventListener("click", () => {
  bridge.call("Bongo.OpenAccessibility");
  document.getElementById("toast").hidden = true;
  reportHit();
});

// Zooming scales the pet around the pointer: the height follows the target
// as a critically damped spring on its log, so its speed never jumps and
// the wheel's notches blend into one glide. A pause this long ends a
// gesture.
const GESTURE_IDLE = 150;
const zoom = {
  running: false,
  to: 1,       // the scale asked for
  v: 0,        // how fast the scale changes, as a log per second
  ax: 0, ay: 0, // the point that stays put
  last: -1e9,  // time of the last input
  prev: 0,
  omega: 22,   // the spring's stiffness, per second
  speed: 1.5,  // most the scale may change per second, as a log
};

function zoomBy(k, x, y, wheel) {
  const now = performance.now();
  if (!zoom.running && now - zoom.last > GESTURE_IDLE) {
    zoom.to = pet.s;
    zoom.v = 0;
  }
  zoom.ax = x;
  zoom.ay = y;
  zoom.last = now;
  zoom.to = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom.to * k));
  if (wheel) {
    // A burst of notches cannot fling the pet far ahead of where it is.
    zoom.to = Math.min(pet.s * 1.15, Math.max(pet.s / 1.15, zoom.to));
    zoom.omega = 22;
    zoom.speed = 1.5;
  } else {
    // The fingers lead: follow them closely.
    zoom.omega = 45;
    zoom.speed = 4;
  }
  if (zoom.running) return;
  zoom.running = true;
  zoom.prev = now;
  requestAnimationFrame(zoomStep);
}

function zoomStep(now) {
  // A late frame must not turn into one big jump.
  const dt = Math.min((now - zoom.prev) / 1000, 1 / 60);
  zoom.prev = now;
  const l = Math.log(pet.s);
  const lt = Math.log(zoom.to);
  let s;
  if (Math.abs(lt - l) < 0.0005 && Math.abs(zoom.v) < 0.01) {
    s = zoom.to;
    zoom.v = 0;
  } else {
    zoom.v += (zoom.omega * zoom.omega * (lt - l) - 2 * zoom.omega * zoom.v) * dt;
    zoom.v = Math.min(zoom.speed, Math.max(-zoom.speed, zoom.v));
    s = Math.exp(l + zoom.v * dt);
  }
  const k = s / pet.s;
  pet.x = zoom.ax + (pet.x - zoom.ax) * k;
  pet.y = zoom.ay + (pet.y - zoom.ay) * k;
  pet.s = s;
  fit();
  place();
  syncSize();
  // Draw now, with the canvas moved in this same frame.
  app.render();
  if (s === zoom.to && now - zoom.last > GESTURE_IDLE) {
    zoom.running = false;
    save();
    if (Settings.visible) Settings.keepOff(silhouette().box);
    return;
  }
  requestAnimationFrame(zoomStep);
}

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (state.locked) return;
  const k = Math.min(1.4, Math.max(0.7, Math.exp(-e.deltaY * 0.0015)));
  zoomBy(k, e.clientX, e.clientY, true);
}, { passive: false });

// A pinch never reaches the page: the app catches it over the pet.
bridge.on("bongo:pinch", (p) => {
  if (!state.locked) zoomBy(1 + p.mag, p.x, p.y, false);
});

// zoomTo glides the pet to scale s around (x, y).
function zoomTo(s, x, y) {
  zoomBy(s / (zoom.running ? zoom.to : pet.s), x, y, false);
}

// Dragging moves the canvas, which costs the compositor alone. A press
// that does not move pets the pet instead.
//
// The pointer reports about twice a frame, but unevenly: no report reaches
// one frame in five, and the next takes three. Moving the pet on each
// report stalls it, then jumps it. Each frame instead places it where the
// pointer was DRAG_LAG ms before, between the two reports around that time
// by their timestamps, or, with no report yet, a little further along the
// pointer's way. That guess goes back to the last report by DRAG_AHEAD ms
// past it, so a pointer that stops does not leave the pet overshot.
const DRAG_LAG = 8;
const DRAG_AHEAD = 16;
let drag = null;
let movedAt = 0;
// Where the window is, from where it started: the page's points plus this
// hold still on the screen as the window goes to another display. Its
// screenY cannot: WebKit counts it from the top of the display the window
// is on.
let ox = 0, oy = 0;
// A pointer report from before the window last moved, or while it moves,
// is from where the window was.
let windowMovedAt = 0;
let windowMoving = false;

app.view.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const r = petRect();
  if (e.clientX < r.x || e.clientX > r.x + r.w || e.clientY < r.y || e.clientY > r.y + r.h) return;
  stepAnim = null;
  stepped = null;
  drag = { x0: e.clientX + ox, y0: e.clientY + oy, px: pet.x, py: pet.y, moved: false, trail: [], frame: 0 };
  app.view.setPointerCapture(e.pointerId);
  reportHit();
});

app.view.addEventListener("pointermove", (e) => {
  if (!drag || state.locked || windowMoving || e.timeStamp <= windowMovedAt) return;
  const dx = e.clientX + ox - drag.x0;
  const dy = e.clientY + oy - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  drag.trail.push({ t: e.timeStamp, dx, dy });
  if (drag.trail.length > 8) drag.trail.shift();
  if (!drag.frame) drag.frame = requestAnimationFrame(dragStep);
});

// dragAt is how far the pointer had gone from where the drag began at time t.
function dragAt(trail, t) {
  const last = trail[trail.length - 1];
  if (t >= last.t) {
    // The pointer's speed over its last few reports: over one, a pixel's
    // rounding swings it.
    let first = trail.length - 1;
    while (first > 0 && last.t - trail[first - 1].t <= 24) first--;
    const a = trail[first];
    const span = last.t - a.t;
    if (span <= 0) return last;
    const ahead = t - last.t;
    const k = Math.max(0, Math.min(ahead, DRAG_AHEAD - ahead)) / span;
    return { dx: last.dx + (last.dx - a.dx) * k, dy: last.dy + (last.dy - a.dy) * k };
  }
  let i = trail.length - 1;
  while (i > 0 && trail[i - 1].t > t) i--;
  if (i === 0) return trail[0];
  const a = trail[i - 1];
  const b = trail[i];
  const k = (t - a.t) / (b.t - a.t || 1);
  return { dx: a.dx + (b.dx - a.dx) * k, dy: a.dy + (b.dy - a.dy) * k };
}

function dragStep(now) {
  if (!drag) return;
  drag.frame = 0;
  const last = drag.trail[drag.trail.length - 1];
  const at = dragAt(drag.trail, now - DRAG_LAG);
  pet.x = drag.px + at.dx;
  pet.y = drag.py + at.dy;
  place();
  if (now - movedAt > 100) {
    movedAt = now;
    follow();
  }
  // Keep gliding until the pet is back on the last report.
  if (now - DRAG_LAG < last.t + DRAG_AHEAD) drag.frame = requestAnimationFrame(dragStep);
}

function endDrag() {
  if (!drag) return;
  const { moved, trail, frame } = drag;
  cancelAnimationFrame(frame);
  if (moved) {
    // Land where the pointer let go, not where the glide got to.
    const last = trail[trail.length - 1];
    pet.x = drag.px + last.dx;
    pet.y = drag.py + last.dy;
  }
  drag = null;
  reportHit();
  if (!moved) {
    onKey();
    showExpression(true);
    return;
  }
  // Where it lands holds it only once the window is on its display.
  follow().then(() => {
    place();
    save();
  });
}

// follow takes the window to the display the pet's centre went to, and
// resolves once it is there, or at once if it is there already. The pet
// hides meanwhile: until the page hears where the window went, it would
// show for a frame or two at its old place on the new display.
let switching = null;
let originSeen = null;
const frames = (n) => new Promise((done) => {
  const step = () => (--n > 0 ? requestAnimationFrame(step) : done());
  requestAnimationFrame(step);
});

function follow() {
  if (switching) return switching;
  switching = (async () => {
    try {
      if (!(await bridge.call("Bongo.Moved", pet.x, pet.y))) return;
      app.view.style.visibility = "hidden";
      await frames(2);
      const seen = new Promise((done) => { originSeen = done; });
      windowMoving = true;
      if (await bridge.call("Bongo.Switch", pet.x, pet.y)) {
        await Promise.race([seen, new Promise((done) => setTimeout(done, 500))]);
        await frames(2);
      }
    } finally {
      windowMoving = false;
      originSeen = null;
      switching = null;
      app.view.style.visibility = "";
    }
  })();
  return switching;
}
app.view.addEventListener("pointerup", endDrag);
app.view.addEventListener("pointercancel", endDrag);

// The window moved to another display, or its work area changed: what
// stays put on screen moves the other way in the page.
bridge.on("bongo:origin", (o) => {
  ox -= o.dx;
  oy -= o.dy;
  windowMovedAt = performance.now();
  windowMoving = false;
  pet.x += o.dx;
  pet.y += o.dy;
  zoom.ax += o.dx;
  zoom.ay += o.dy;
  if (drag) {
    drag.px += o.dx;
    drag.py += o.dy;
  }
  place();
  if (originSeen) originSeen();
});
window.addEventListener("resize", place);

// The menu: a ring of petals around the pet, outside its outline.
// Near an edge of the screen the pet steps away from it for the ring to
// fit, and steps back once the menu and its panel are closed.
let stepped = null;    // how far the pet stepped for the menu
let stepAnim = null;

function stepBy(dx, dy, done) {
  const from = performance.now();
  let last = 0;
  const anim = (stepAnim = {});
  const frame = (now) => {
    if (stepAnim !== anim) return;
    const t = Math.min(1, (now - from) / 240);
    const e = 1 - Math.pow(1 - t, 3);
    pet.x += dx * (e - last);
    pet.y += dy * (e - last);
    last = e;
    place();
    if (t < 1) requestAnimationFrame(frame);
    else {
      stepAnim = null;
      if (done) done();
    }
  };
  requestAnimationFrame(frame);
}

// The ring and the settings panel take the mouse while either is open, and
// the pet steps back once both are closed.
function menusChanged() {
  reportHit();
  if (Radial.busy || Settings.visible || !stepped) return;
  const { dx, dy } = stepped;
  stepped = null;
  stepBy(-dx, -dy, save);
}
Radial.onchange = menusChanged;
Settings.onchange = menusChanged;

// silhouette renders the model small, off screen, and returns the ends of
// each row of its pixels, which hold its outline, and the box around them,
// in page points. It runs as the menu opens, so the styles the pet wears
// count too.
function silhouette() {
  const k = 0.2;
  const w = Math.ceil(STAGE.width * k);
  const h = Math.ceil(STAGE.height * k);
  const rt = PIXI.RenderTexture.create({ width: w, height: h, resolution: 1 });
  app.renderer.render(model, { renderTexture: rt, transform: new PIXI.Matrix(k, 0, 0, k, 0, 0), clear: true });
  const px = app.renderer.plugins.extract.pixels(rt);
  rt.destroy(true);
  const page = (x, y) => ({ x: pet.x + (x - w / 2) / k, y: pet.y + (y - h / 2) / k });
  const points = [];
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < 40) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0) continue;
    // The pixels' outer corners, so the outline holds them whole.
    points.push(page(left, y), page(left, y + 1), page(right + 1, y), page(right + 1, y + 1));
    x0 = Math.min(x0, left); x1 = Math.max(x1, right + 1);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  const box = { x: pet.x + (x0 - w / 2) / k, y: pet.y + (y0 - h / 2) / k, w: (x1 - x0) / k, h: (y1 - y0) / k };
  return { points, box };
}

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const r = petRect();
  if (!model || e.clientX < r.x || e.clientX > r.x + r.w || e.clientY < r.y || e.clientY > r.y + r.h) {
    Radial.close();
    return;
  }
  const { points, box } = silhouette();
  const { dx, dy } = Radial.room(points);
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    stepped = { dx: dx + (stepped ? stepped.dx : 0), dy: dy + (stepped ? stepped.dy : 0) };
    stepBy(dx, dy);
    for (const p of points) {
      p.x += dx;
      p.y += dy;
    }
    box.x += dx;
    box.y += dy;
  }
  const setting = (name) => () => Settings.open(name, box);
  Radial.open([
    { label: "样式", icon: "shirt", color: "#8b5cf6", run: setting("样式") },
    { label: "表情", icon: "smile", color: "#ec4899", run: setting("表情") },
    { label: "动作", icon: "zap", color: "#f59e0b", run: setting("动作") },
    { label: "大小", icon: "resize", color: "#10b981", run: setting("大小") },
    state.locked
      ? { label: "取消固定", icon: "unpin", color: "#0ea5e9", run: () => setLocked(false) }
      : { label: "固定", icon: "pin", color: "#0ea5e9", run: () => setLocked(true) },
    { label: "隐藏", icon: "eyeOff", color: "#6366f1", run: () => bridge.call("Bongo.Hide") },
    { label: "退出", icon: "logout", color: "#ef4444", run: () => bridge.call("Bongo.Quit") },
  ], points);
});

function setLocked(locked) {
  state.locked = locked;
  bridge.call("Bongo.SetLocked", locked);
  syncSize();
}

// The settings panel's tabs. Each keeps its chips in step with the pet
// while the panel is open.
let renderExpressions = () => {};
let renderMotions = () => {};
let syncSize = () => {};
Motions.onchange = () => renderMotions();

Settings.define([
  { name: "样式", build: () => stylePanel },
  { name: "表情", build: expressionTab },
  { name: "动作", build: motionTab },
  { name: "大小", build: sizeTab },
]);

// section is a titled part of a tab, with a hint beside its title.
function section(title, hint, ...content) {
  const box = document.createElement("div");
  box.className = "section";
  const head = document.createElement("div");
  head.className = "section-title";
  head.textContent = title;
  if (hint) {
    const note = document.createElement("span");
    note.className = "hint";
    note.textContent = hint;
    head.appendChild(note);
  }
  box.append(head, ...content);
  return box;
}

// chipPanel offers names as chips, and runs play with the one clicked.
function chipPanel(names, play) {
  const body = document.createElement("div");
  body.className = "chips";
  for (const name of names) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = name;
    chip.addEventListener("click", () => play(name));
    body.appendChild(chip);
  }
  return body;
}

// expressionTab plays an expression for a few seconds, its chip lit while
// it shows, sorted by kind; one no group names goes under 其他.
function expressionTab() {
  const play = (name) => playExpression(name, 2.6);
  const grouped = new Set();
  const parts = [];
  for (const group of expressionGroups) {
    const names = group.items.filter((name) => expressions.has(name));
    if (names.length === 0) continue;
    names.forEach((name) => grouped.add(name));
    parts.push([group.name, chipPanel(names, play)]);
  }
  const rest = [...expressions.keys()].filter((name) => !grouped.has(name));
  if (rest.length) parts.push(["其他", chipPanel(rest, play)]);
  renderExpressions = () => {
    for (const [, chips] of parts) {
      for (const chip of chips.children) {
        chip.classList.toggle("on", Boolean(state.expr && state.expr.name === chip.textContent));
      }
    }
  };
  renderExpressions();
  const body = document.createElement("div");
  parts.forEach(([name, chips], i) => body.append(section(name, i === 0 ? "点一下，播放约 3 秒" : "", chips)));
  return body;
}

// motionTab puts on a pose, or plays an animation, its chip lit while it
// is on; a pose, or a hold, stays on until clicked again.
function motionTab() {
  const hands = chipPanel(POSES.filter((name) => poses.params.has(name)), pose);
  const play = (name) => Motions.play(name);
  const holds = chipPanel(Motions.names.filter((name) => Motions.isHold(name)), play);
  const once = chipPanel(Motions.names.filter((name) => !Motions.isHold(name)), play);
  renderMotions = () => {
    for (const chip of [...holds.children, ...once.children]) {
      chip.classList.toggle("on", Motions.active(chip.textContent));
    }
    for (const chip of hands.children) chip.classList.toggle("on", poses.on === chip.textContent);
  };
  renderMotions();
  const body = document.createElement("div");
  body.append(
    section("姿势", "再点一次收起", hands),
    section("保持", "再点一次收起", holds),
    section("播放一次", "", once),
  );
  if (poses.params.has("蛋包饭")) {
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.textContent = "摆出蛋包饭后，番茄酱瓶跟着鼠标，按住左键挤番茄酱";
    hands.after(tip);
  }
  return body;
}

// sizeTab sets the pet's scale with a slider or a preset, and locks it in
// place.
function sizeTab() {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "slider";
  slider.min = MIN_SCALE * 100;
  slider.max = MAX_SCALE * 100;
  const value = document.createElement("span");
  value.className = "size-value";
  // The slider under the pointer is not moved under it.
  let sliding = false;
  slider.addEventListener("pointerdown", () => { sliding = true; });
  slider.addEventListener("change", () => { sliding = false; });
  slider.addEventListener("input", () => zoomTo(slider.value / 100, pet.x, pet.y));
  const presets = chipPanel(["50%", "75%", "100%", "150%", "200%"], (name) => zoomTo(parseInt(name, 10) / 100, pet.x, pet.y));
  presets.classList.add("segmented");
  const row = document.createElement("div");
  row.className = "size-row";
  row.append(slider, value);

  const lock = document.createElement("label");
  lock.className = "switch-row";
  const text = document.createElement("span");
  text.textContent = "固定位置和大小";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "switch";
  toggle.addEventListener("change", () => setLocked(toggle.checked));
  lock.append(text, toggle);

  syncSize = () => {
    const v = Math.round(pet.s * 100);
    if (!sliding) slider.value = v;
    const fill = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--fill", `${fill}%`);
    value.textContent = `${v}%`;
    for (const chip of presets.children) chip.classList.toggle("on", parseInt(chip.textContent, 10) === v);
    toggle.checked = state.locked;
  };
  syncSize();
  const body = document.createElement("div");
  body.append(section("大小", "滚轮或双指捏合也能缩放", row, presets), section("固定", "开启后不能拖动，也不能缩放", lock));
  return body;
}

// The 样式 panel: a chip per style, which stays open to wear several.
const stylePanel = document.createElement("div");
stylePanel.className = "styles";

function buildStyleMenu() {
  stylePanel.textContent = "";
  for (const group of styles.groups) {
    const items = group.items.map(itemName).filter((item) => styles.params.has(styleKey(group.name, item)));
    if (items.length === 0) continue;
    const head = document.createElement("div");
    head.className = "section-title";
    head.textContent = group.name;
    stylePanel.appendChild(head);
    const row = document.createElement("div");
    row.className = "chips";
    if (group.exclusive) {
      const none = document.createElement("button");
      none.className = "chip";
      none.dataset.none = group.name;
      none.textContent = "无";
      none.addEventListener("click", () => {
        for (const item of group.items) styles.on.delete(styleKey(group.name, itemName(item)));
        renderStyleMenu();
        bridge.call("Bongo.SetStyles", [...styles.on]);
      });
      row.appendChild(none);
    }
    for (const item of items) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.key = styleKey(group.name, item);
      chip.textContent = item;
      chip.addEventListener("click", () => wear(group, item));
      row.appendChild(chip);
    }
    stylePanel.appendChild(row);
  }
  renderStyleMenu();
}

function renderStyleMenu() {
  for (const chip of stylePanel.querySelectorAll(".chip")) {
    const none = chip.dataset.none;
    const on = none
      ? ![...styles.on].some((key) => key.startsWith(none + "·"))
      : styles.on.has(chip.dataset.key);
    chip.classList.toggle("on", on);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) app.ticker.stop();
  else app.ticker.start();
});

boot();
