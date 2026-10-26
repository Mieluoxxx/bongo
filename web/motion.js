// Motions plays the model's animations the way its maker set them up for
// VTube Studio, in live2d/motions.json: once, then fading back, or, for a
// hold, once and then held on its last frame until played again. One plays
// at a time; a new one fades in as the last fades out.
//
// It lays the animation over the pose each frame instead of handing it to
// the library's motion manager, whose values the model keeps after the
// animation ends: a phone taken out, or a bubble blown, would stay.

const Motions = (() => {
  const FADE_IN = 0.2;
  const FADE_OUT = 0.35;

  const list = [];        // { name, hold, data } in the menu's order
  let playing = [];       // { motion, at, out }, out: when it began to fade out

  // compile turns a curve's flat segment list into segments with their
  // points: [t0, v0, type, ...points, type, ...points].
  function compile(s, restricted) {
    const segs = [];
    let p0 = { t: s[0], v: s[1] };
    for (let i = 2; i < s.length;) {
      const type = s[i];
      if (type === 1) {
        const c1 = { t: s[i + 1], v: s[i + 2] };
        const c2 = { t: s[i + 3], v: s[i + 4] };
        const p1 = { t: s[i + 5], v: s[i + 6] };
        segs.push({ type, p0, c1, c2, p1, restricted });
        p0 = p1;
        i += 7;
      } else {
        const p1 = { t: s[i + 1], v: s[i + 2] };
        segs.push({ type, p0, p1 });
        p0 = p1;
        i += 3;
      }
    }
    return segs;
  }

  const bez = (a, b, c, d, s) => {
    const u = 1 - s;
    return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d;
  };

  function value(segs, t) {
    let seg = segs[segs.length - 1];
    for (const s of segs) {
      if (t <= s.p1.t) {
        seg = s;
        break;
      }
    }
    const { p0, p1 } = seg;
    if (t <= p0.t) return p0.v;
    if (t >= p1.t) return p1.v;
    switch (seg.type) {
      case 0:
        return p0.v + ((t - p0.t) / (p1.t - p0.t)) * (p1.v - p0.v);
      case 1: {
        // Restricted beziers take the time itself as their parameter;
        // others find the parameter at which the curve reaches the time.
        let s = (t - p0.t) / (p1.t - p0.t);
        if (!seg.restricted) {
          let lo = 0;
          let hi = 1;
          for (let i = 0; i < 24; i++) {
            s = (lo + hi) / 2;
            if (bez(p0.t, seg.c1.t, seg.c2.t, p1.t, s) < t) lo = s;
            else hi = s;
          }
        }
        return bez(p0.v, seg.c1.v, seg.c2.v, p1.v, s);
      }
      case 2:
        return p0.v;
      default:
        return p1.v;
    }
  }

  async function load() {
    try {
      const manifest = await (await fetch("/live2d/motions.json")).json();
      await Promise.all(manifest.motions.map(async (m, i) => {
        const res = await fetch(`/live2d/motions/${encodeURIComponent(m.file)}.motion3.json`);
        if (!res.ok) return;
        const json = await res.json();
        const restricted = Boolean(json.Meta.AreBeziersRestricted);
        list[i] = {
          name: m.name,
          hold: Boolean(m.hold),
          duration: json.Meta.Duration,
          curves: json.Curves
            .filter((c) => c.Target === "Parameter" || c.Target === "PartOpacity")
            .map((c) => ({ target: c.Target, id: c.Id, segs: compile(c.Segments, restricted) })),
        };
      }));
    } catch (err) {
      console.warn("motions", err);
    }
  }

  const find = (name) => list.find((m) => m && m.name === name);

  // active reports whether the motion named name plays, and is not on its
  // way out.
  const active = (name) => playing.some((p) => p.motion.name === name && p.out === null);

  // held reports whether a hold motion is on.
  const held = (name) => active(name) && find(name).hold;

  // play starts the motion named name, or, for a hold that is on, lets it
  // go.
  function play(name) {
    const motion = find(name);
    if (!motion) return;
    const now = performance.now() / 1000;
    const on = held(name);
    for (const p of playing) if (p.out === null) p.out = now;
    if (!on) playing.push({ motion, at: now, out: null });
    if (Motions.onchange) Motions.onchange();
  }

  // apply lays the playing motions over the pose; core is the model's.
  function apply(core, nowMs) {
    const now = nowMs / 1000;
    let ended = false;
    playing = playing.filter((p) => {
      const t = now - p.at;
      const done = !p.motion.hold && t >= p.motion.duration;
      if (done && p.out === null) {
        p.out = p.at + p.motion.duration;
        ended = true;
      }
      const fadeIn = Math.min(1, t / FADE_IN);
      const fadeOut = p.out === null ? 1 : 1 - (now - p.out) / FADE_OUT;
      const w = Math.max(0, Math.min(fadeIn, fadeOut));
      if (w <= 0 && p.out !== null) return false;
      const at = Math.min(t, p.motion.duration);
      for (const c of p.motion.curves) {
        const v = value(c.segs, at);
        if (c.target === "PartOpacity") {
          if (core.getPartIndex(c.id) < 0) continue;
          const cur = core.getPartOpacityById(c.id);
          core.setPartOpacityById(c.id, cur + (v - cur) * w);
          continue;
        }
        if (core.getParameterIndex(c.id) < 0) continue;
        const cur = core.getParameterValueById(c.id);
        core.setParameterValueById(c.id, cur + (v - cur) * w);
      }
      return true;
    });
    if (ended && Motions.onchange) Motions.onchange();
  }

  return {
    load,
    play,
    apply,
    active,
    held,
    get names() { return list.filter(Boolean).map((m) => m.name); },
    isHold: (name) => Boolean(find(name) && find(name).hold),
    onchange: null,
  };
})();
