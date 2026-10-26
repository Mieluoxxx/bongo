// Radial is the pet's menu: a whole ring of petals around the pet, wide
// enough to hold all of it so they never cover it, one petal per action.

const Radial = (() => {
  const DEPTH = 78;    // a petal from its inner edge to its outer
  const CORNER = 12;   // the radius of its corners
  const GAP = 8;       // between petals, as wide at their outer ends as at their inner
  const MARGIN = 10;   // between the pet's outline and the petals
  const HIT = 10;      // how far past a petal the pointer still picks it
  const EDGE = 6;      // how close to the screen's edge a petal may come
  const NS = "http://www.w3.org/2000/svg";
  const TAU = Math.PI * 2;

  // Line icons on a 24-point grid.
  const ICONS = {
    shirt: "M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.7-2 3-4 3S8.5 4.7 8 3z",
    smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2 M9 9.5h.01 M15 9.5h.01",
    zap: "M13 2 4 14h7l-1 8 9-12h-7z",
    resize: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7",
    pin: "M12 17v5 M9 3h6l-1 6 3 3v2H7v-2l3-3z",
    unpin: "M12 17v5 M9 3h6l-1 6 3 3v2H7v-2l3-3z M3 3l18 18",
    eyeOff: "M3 3l18 18 M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4 M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2",
    logout: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4 M15 8l4 4-4 4 M19 12H9",
  };

  const ring = document.getElementById("ring");
  let petals = [];     // { item, a0, a1, r, node }, a0 < a1, clockwise
  let center = { x: 0, y: 0 };
  let hovered = -1;
  let closing = 0;

  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };

  const at = (a, r) => [center.x + Math.cos(a) * r, center.y + Math.sin(a) * r];
  const pt = (a, r) => at(a, r).map((v) => v.toFixed(2)).join(" ");

  // petalPath is the petal from angle a0 to a1 and radius r0 to r1, drawn
  // inset by CORNER: a stroke as wide as two corners, in the fill's colour,
  // rounds it. Its sides keep GAP/2 off the radii at a0 and a1 all along,
  // so a gap is as wide at its outer end as at its inner, whatever radius the
  // petals on either side of it sit at.
  function petalPath(a0, a1, r0, r1) {
    const d = GAP / 2 + CORNER;
    const i = r0 + CORNER;
    const o = r1 - CORNER;
    const i0 = a0 + Math.asin(d / i);
    const i1 = a1 - Math.asin(d / i);
    const o0 = a0 + Math.asin(d / o);
    const o1 = a1 - Math.asin(d / o);
    return `M${pt(i0, i)}L${pt(o0, o)}A${o} ${o} 0 0 1 ${pt(o1, o)}L${pt(i1, i)}A${i} ${i} 0 0 0 ${pt(i0, i)}Z`;
  }

  // enclose returns the smallest circle around points, by Welzl's
  // incremental algorithm.
  function enclose(points) {
    const ps = points.slice();
    for (let i = ps.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ps[i], ps[j]] = [ps[j], ps[i]];
    }
    const inside = (c, p) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-6;
    const two = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 });
    const three = (a, b, c) => {
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      // In a line: the circle on the two that are furthest apart.
      if (Math.abs(d) < 1e-9) {
        return [two(a, b), two(a, c), two(b, c)].sort((m, n) => n.r - m.r)[0];
      }
      const aa = a.x * a.x + a.y * a.y;
      const bb = b.x * b.x + b.y * b.y;
      const cc = c.x * c.x + c.y * c.y;
      const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
      const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
      return { x, y, r: Math.hypot(a.x - x, a.y - y) };
    };
    let c = { x: 0, y: 0, r: -1 };
    for (let i = 0; i < ps.length; i++) {
      if (inside(c, ps[i])) continue;
      c = { x: ps[i].x, y: ps[i].y, r: 0 };
      for (let j = 0; j < i; j++) {
        if (inside(c, ps[j])) continue;
        c = two(ps[i], ps[j]);
        for (let k = 0; k < j; k++) {
          if (!inside(c, ps[k])) c = three(ps[i], ps[j], ps[k]);
        }
      }
    }
    return c;
  }

  // room is how far the pet has to step for its whole ring to fit on the
  // screen: away from an edge it is too near, or to the middle of a screen
  // too small for the ring either way.
  function room(points) {
    const c = enclose(points);
    const o = c.r + MARGIN + DEPTH + EDGE;
    const step = (v, size) => (2 * o > size ? size / 2 - v : Math.min(Math.max(v, o), size - o) - v);
    return { dx: step(c.x, window.innerWidth), dy: step(c.y, window.innerHeight) };
  }

  // lay lays n petals all the way round, the first at the top, or turned
  // so the fewest fall off a screen too small for the whole ring.
  function lay(n, c, r) {
    const step = TAU / n;
    const lay = (turn) => Array.from({ length: n }, (_, i) => {
      const a0 = -Math.PI / 2 - step / 2 + turn + i * step;
      return { a0, a1: a0 + step, r };
    });
    const cut = (list) => list.reduce((sum, p) => {
      const [x, y] = [c.x + Math.cos((p.a0 + p.a1) / 2) * (r + DEPTH / 2), c.y + Math.sin((p.a0 + p.a1) / 2) * (r + DEPTH / 2)];
      return sum + (x < EDGE || y < EDGE || x > window.innerWidth - EDGE || y > window.innerHeight - EDGE ? 1 : 0);
    }, 0);
    let best = lay(0);
    let fewest = cut(best);
    for (let k = 1; k < 8 && fewest > 0; k++) {
      const list = lay((k * step) / 8);
      const n2 = cut(list);
      if (n2 < fewest) [best, fewest] = [list, n2];
    }
    return best;
  }

  function build() {
    ring.textContent = "";
    const svg = el("svg", { width: window.innerWidth, height: window.innerHeight }, ring);
    const defs = el("defs", {}, svg);
    const grad = el("linearGradient", { id: "petal-on", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#3b82f6" }, grad);
    el("stop", { offset: "1", "stop-color": "#60a5fa" }, grad);
    petals.forEach((p, i) => {
      const g = el("g", { class: "petal" }, svg);
      const mid = (p.a0 + p.a1) / 2;
      g.style.setProperty("--i", i);
      // A hovered petal steps out along its own angle.
      g.style.setProperty("--dx", `${(Math.cos(mid) * 5).toFixed(2)}px`);
      g.style.setProperty("--dy", `${(Math.sin(mid) * 5).toFixed(2)}px`);
      el("path", {
        class: "shape",
        d: petalPath(p.a0, p.a1, p.r, p.r + DEPTH),
        "stroke-width": CORNER * 2,
        "stroke-linejoin": "round",
      }, g);
      const [x, y] = at(mid, p.r + DEPTH / 2);
      const icon = el("path", {
        class: "icon",
        d: ICONS[p.item.icon] || "",
        transform: `translate(${(x - 12).toFixed(2)} ${(y - 20).toFixed(2)})`,
        fill: "none",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }, g);
      icon.style.color = p.item.color;
      const label = el("text", { class: "label", x: x.toFixed(2), y: (y + 18).toFixed(2) }, g);
      label.textContent = p.item.label;
      p.node = g;
    });
  }

  function pick(x, y) {
    const dx = x - center.x;
    const dy = y - center.y;
    const dist = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    return petals.findIndex((p) => {
      // a, turned by whole turns to the first angle past the petal's start.
      const b = a + Math.ceil((p.a0 - a) / TAU) * TAU;
      return b < p.a1 && dist > p.r - HIT && dist < p.r + DEPTH + HIT;
    });
  }

  function hover(i) {
    if (i === hovered) return;
    if (petals[hovered]) petals[hovered].node.classList.remove("on");
    hovered = i;
    if (petals[hovered]) petals[hovered].node.classList.add("on");
  }

  function changed() {
    if (Radial.onchange) Radial.onchange();
  }

  // open lays items out in a ring around the pet, whose outline points
  // trace.
  function open(items, points) {
    clearTimeout(closing);
    const c = enclose(points);
    const r = c.r + MARGIN;
    center = c;
    petals = lay(items.length, c, r).map((p, i) => ({ ...p, item: items[i] }));
    build();
    ring.classList.remove("open");
    ring.hidden = false;
    hovered = -1;
    // Bloom on the next frame, from the folded state just laid out.
    requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.add("open")));
    changed();
  }

  function close() {
    if (ring.hidden) return;
    ring.classList.remove("open");
    clearTimeout(closing);
    closing = setTimeout(() => {
      ring.hidden = true;
      changed();
    }, 180);
  }

  window.addEventListener("pointermove", (e) => {
    if (ring.classList.contains("open")) hover(pick(e.clientX, e.clientY));
  });

  // A press anywhere closes the ring; on a petal, it runs its action.
  window.addEventListener("pointerdown", (e) => {
    if (!ring.classList.contains("open") || e.button !== 0) return;
    const i = pick(e.clientX, e.clientY);
    // Nothing else is to see this press, a panel the petal opens included.
    e.stopImmediatePropagation();
    e.preventDefault();
    close();
    if (i >= 0) petals[i].item.run(petals[i]);
  }, true);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return {
    open,
    room,
    close,
    get busy() { return !ring.hidden; },
    onchange: null,
  };
})();
