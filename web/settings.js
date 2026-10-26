// Settings is the pet's settings panel: one panel, a tab for each of its
// settings, beside the pet on the side with room for it. It keeps its place
// and its height while the tabs change, and its title bar drags it.

const Settings = (() => {
  const EDGE = 8;   // how close to the screen's edge the panel may come
  const GAP = 14;   // between the pet and the panel

  const panel = document.getElementById("panel");
  let tabs = [];             // { name, build }: build returns the tab's body
  const bodies = new Map();  // name -> the body built at open
  const buttons = new Map(); // name -> its tab
  let current = null;

  // define sets the tabs, in order.
  function define(list) {
    tabs = list;
  }

  function show(name) {
    current = name;
    for (const [n, body] of bodies) body.hidden = n !== name;
    for (const [n, button] of buttons) button.classList.toggle("on", n === name);
  }

  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // place puts the panel beside box: to the side with the most room that
  // holds it, level with the pet's middle, or above or below it.
  function place(box) {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const clampX = (x) => Math.min(Math.max(EDGE, x), W - w - EDGE);
    const clampY = (y) => Math.min(Math.max(EDGE, y), H - h - EDGE);
    const midY = clampY(box.y + box.h / 2 - h / 2);
    const midX = clampX(box.x + box.w / 2 - w / 2);
    const right = W - (box.x + box.w);
    const left = box.x;
    const sides = (right >= left
      ? [{ x: box.x + box.w + GAP, y: midY }, { x: box.x - w - GAP, y: midY }]
      : [{ x: box.x - w - GAP, y: midY }, { x: box.x + box.w + GAP, y: midY }])
      .concat([{ x: midX, y: box.y - h - GAP }, { x: midX, y: box.y + box.h + GAP }]);
    const fits = (s) => s.x >= EDGE && s.y >= EDGE && s.x + w <= W - EDGE && s.y + h <= H - EDGE &&
      !overlaps({ x: s.x, y: s.y, w, h }, box);
    const spot = sides.find(fits) || { x: clampX(sides[0].x), y: midY };
    panel.style.left = spot.x + "px";
    panel.style.top = spot.y + "px";
  }

  // open shows the panel on the tab named name, beside the pet's box.
  function open(name, box) {
    panel.textContent = "";
    bodies.clear();
    buttons.clear();

    const head = document.createElement("div");
    head.className = "panel-head";
    const bar = document.createElement("div");
    bar.className = "tabs";
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.className = "tab";
      button.textContent = tab.name;
      button.addEventListener("click", () => show(tab.name));
      buttons.set(tab.name, button);
      bar.appendChild(button);
    }
    const shut = document.createElement("button");
    shut.className = "close";
    shut.setAttribute("aria-label", "关闭");
    shut.textContent = "×";
    shut.addEventListener("click", close);
    head.append(bar, shut);

    const wrap = document.createElement("div");
    wrap.className = "panel-body";
    for (const tab of tabs) {
      const body = tab.build();
      body.classList.add("tab-body");
      bodies.set(tab.name, body);
      wrap.appendChild(body);
    }
    panel.append(head, wrap);
    panel.hidden = false;

    // As tall as the tallest tab, so switching never moves the panel's
    // edges.
    wrap.style.minHeight = "";
    let tallest = 0;
    for (const body of bodies.values()) {
      for (const other of bodies.values()) other.hidden = other !== body;
      tallest = Math.max(tallest, body.offsetHeight);
    }
    wrap.style.minHeight = tallest + "px";
    show(name);
    place(box);
    panel.classList.remove("open");
    requestAnimationFrame(() => panel.classList.add("open"));
    dragBy(head);
    changed();
  }

  // dragBy lets head move the panel.
  function dragBy(head) {
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const x0 = e.clientX - panel.offsetLeft;
      const y0 = e.clientY - panel.offsetTop;
      head.setPointerCapture(e.pointerId);
      const move = (m) => {
        const x = Math.min(Math.max(EDGE, m.clientX - x0), window.innerWidth - panel.offsetWidth - EDGE);
        const y = Math.min(Math.max(EDGE, m.clientY - y0), window.innerHeight - panel.offsetHeight - EDGE);
        panel.style.left = x + "px";
        panel.style.top = y + "px";
      };
      const up = () => {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        changed();
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
  }

  // keepOff moves the panel beside box again if the pet has grown into it.
  function keepOff(box) {
    if (panel.hidden) return;
    const r = { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight };
    if (overlaps(r, box)) place(box);
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    panel.classList.remove("open");
    current = null;
    changed();
  }

  function changed() {
    if (Settings.onchange) Settings.onchange();
  }

  // A press outside the panel closes it.
  window.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target)) close();
  }, true);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return {
    define,
    open,
    keepOff,
    close,
    get visible() { return !panel.hidden; },
    get tab() { return current; },
    onchange: null,
  };
})();
