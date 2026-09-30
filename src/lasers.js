/* The iMessage "Lasers" screen effect, rebuilt in one green and anchored to the
 * top edge rather than to a message bubble.
 *
 * Beams are rendered sharp into an offscreen buffer, then that whole buffer is
 * composited back three times at different blur radii: wide and faint for the
 * room glow, mid for the halo, tight to keep the edges readable. The blur is
 * what gives a beam its soft edge and the bloom inside it, and doing it once
 * over the whole fan also means crossings bloom together rather than each beam
 * carrying its own separate haze.
 *
 * Approximating that falloff by stacking nested wedges was tried first and does
 * not work at this scale. An edge line is only a few pixels across, so every
 * layer lands inside the same pixel column and the profile ends up quantised by
 * the raster, leaving the hard edge the layers were meant to remove.
 *
 * A beam is a shaft, not a line: two bright edge lines with a dimmer green fill
 * between them and a haze around the outside, four wedges in all. Blurring a
 * single bright centre line can only ever give a rope, because it has no
 * interior that is darker than its own edges; the structure has to be drawn in
 * before the blur can soften it.
 *
 * The source colour never changes; only intensity does. The original cycles the
 * hue, which is where most of its life comes from, so that life has to be found
 * elsewhere: every beam sways and flickers on its own period, and the periods
 * are deliberately unrelated so the fan never visibly repeats as a whole.
 *
 * Sits above the floor grid and below the content. Beams reaching the headline
 * are far enough down their falloff to stay well under white text.
 */
(() => {
  const canvas = document.getElementById("lasers");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const buf = document.createElement("canvas");
  const bctx = buf.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Canvas filter is Chrome 52+, Firefox 49+, Safari 17+. Without it the beams
  // still draw, just without the bloom, so the page degrades rather than fails.
  const canBlur = typeof ctx.filter === "string";

  // Blur radius, alpha. Radii are in design pixels and scaled to the viewport
  // so the glow keeps its proportions rather than thinning out on big screens.
  const PASSES = [
    [30, 0.36],
    [10, 0.42],
    [2.5, 0.85],
  ];

  // A beam is a shaft, not a line: two bright edges with a green fill between
  // them. Drawing one glowing line per beam gave a rope rather than a shaft,
  // because a single blurred core has no interior to be dimmer than its edges.
  const EDGE_RGB = "190,255,220";
  const FILL_RGB = "0,218,102";
  const HALO_RGB = "0,218,102";
  // The fill has to stay well under the edges. Measured at parity the shaft
  // blurs into a flat bar and the edges stop reading as edges at all; the gap
  // below is what keeps them visible through the widest blur pass.
  const EDGE_ALPHA = 0.8;
  const FILL_ALPHA = 0.15;
  const HALO_ALPHA = 0.085;
  // Halo reaches this far outside the shaft, as a multiple of its half-width.
  const HALO_SPREAD = 1.9;

  // Design pixels the apex sits above the top edge, scaled with the viewport.
  const ORIGIN_LIFT = 64;

  // Shapes the sway. A plain sine spreads its speed evenly over the sweep and
  // reads as a drift; a galvanometer crosses its centre quickly and then
  // brakes into each extreme. Dropping the exponent below 1 sharpens the
  // crossing and lengthens the braking.
  //
  // It cannot go far. The derivative is unbounded at the crossing, so the beam
  // stops sweeping and starts teleporting: at 0.55, measured per frame rather
  // than per instant, the sweep sits under a third of its own top speed for
  // 98% of its travel and covers the rest in a couple of frames, which reads
  // as a twitch. 0.82 keeps about 40% of the sweep at speed and spends the
  // other 60% braking, which is the shape being aimed at.
  const SWAY_SHAPE = 0.82;

  function swing(phase) {
    const s = Math.sin(phase);
    return Math.sign(s) * Math.abs(s) ** SWAY_SHAPE;
  }

  // Fixed seed: the fan is authored, not random per load, so what gets reviewed
  // is what ships.
  const rand = (() => {
    let s = 0x2f6e2b1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();

  // Fewer than before: each beam is now a ribbon rather than a line, so the
  // same count would close the fan into a solid sheet.
  const BEAM_COUNT = 9;

  const BEAMS = Array.from({ length: BEAM_COUNT }, (_, i) => {
    const t = i / (BEAM_COUNT - 1);
    return {
      // Fanned across the lower half circle, jittered so the spacing never
      // looks stepped.
      angle: (t - 0.5) * 2.42 + (rand() - 0.5) * 0.4,
      sway: 0.04 + rand() * 0.1,
      // Crosses in 1.3 to 2.4 seconds. The shaping only redistributes speed
      // within a sweep, it cannot make one faster, so the period has to carry
      // the actual pace.
      swaySpeed: 1.3 + rand() * 1.1,
      swayPhase: rand() * Math.PI * 2,
      // Angular half-width, so a beam keeps its shape at any viewport size.
      // Sized against the blur rather than by eye: the widest pass is 30px, so
      // anything narrower than roughly 60px across gets its interior filled
      // straight back in and the two edges collapse into one line again. These
      // clear that from about a third of the way down the screen, which is
      // also where the reference beams start to separate.
      width: 0.045 + rand() * 0.085,
      // Half-thickness of an edge line. Small enough that the blur is what
      // gives it its visible width, as with the old core.
      edge: 0.0016 + rand() * 0.0016,
      flickerSpeed: 0.5 + rand() * 1.9,
      flickerPhase: rand() * Math.PI * 2,
      // Wide range on purpose: an evenly lit fan reads as a peacock tail, so a
      // few beams carry the eye and the rest sit back as haze.
      gain: 0.28 + rand() * 0.72,
      // How far the shaft opens and closes, as a fraction of its width. The
      // low end of the range is near zero on purpose: a fan where every beam
      // breathes reads as the whole thing pulsing, so some have to hold still
      // for the ones that move to be noticed.
      breathe: 0.06 + rand() * 0.42,
      // Roughly a 12 to 25 second cycle. Slower than this and the shaft is
      // only ever measurably wider, never seen to widen; faster and it stops
      // being a beam sweeping and starts being a shape animating.
      breatheSpeed: 0.26 + rand() * 0.27,
      // Phase is stepped by index rather than drawn from the seed. Random
      // phases clump, and any moment where most of the fan happens to be in
      // step turns the effect into a single global pulse. Spreading them round
      // the circle guarantees that whatever is opening has something else
      // closing against it; the unequal speeds then let the pairing drift so
      // it never settles into a visible rhythm.
      breathePhase: (i / BEAM_COUNT) * Math.PI * 2 + rand() * 0.5,
    };
  });

  let w = 0;
  let h = 0;
  let scale = 1;
  let raf = null;

  function resize() {
    // Deliberately 1x even on retina. Blur cost scales with pixel count, and at
    // dpr 2 the three passes are four times the work for detail that the blur
    // immediately destroys. Measured at 1440x832: ~5ms a frame at 1x, which
    // would not hold at 2x. Nothing in this layer has a hard edge to lose;
    // the grid and the text are separate elements and stay crisp.
    const dpr = 1;
    w = innerWidth;
    h = innerHeight;
    scale = Math.max(0.6, h / 832);

    for (const c of [canvas, buf]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Fills between two angular bounds either side of the beam axis. Bounds are
  // independent rather than symmetric so the same primitive draws the interior
  // fill, the halo around it, and each edge line as an off-centre sliver.
  function wedge(ox, oy, angle, a0, a1, reach, alpha, rgb) {
    const s0 = Math.sin(angle + a0);
    const c0 = Math.cos(angle + a0);
    const s1 = Math.sin(angle + a1);
    const c1 = Math.cos(angle + a1);

    // The apex is nudged off the origin so a zero-width sliver still has area.
    const near = 1;
    const ex = ox + Math.sin(angle) * reach;
    const ey = oy + Math.cos(angle) * reach;

    // Falloff is deliberately front-loaded. The reach has to exceed the screen
    // diagonal or shallow beams stop mid-air, but a gradient spread evenly over
    // that reach leaves them near full strength at the bottom edge, which is
    // what turns the fan into a solid sunburst.
    const grad = bctx.createLinearGradient(ox, oy, ex, ey);
    grad.addColorStop(0, `rgba(${rgb},${alpha})`);
    grad.addColorStop(0.05, `rgba(${rgb},${alpha})`);
    grad.addColorStop(0.24, `rgba(${rgb},${alpha * 0.3})`);
    grad.addColorStop(0.62, `rgba(${rgb},0)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);

    bctx.fillStyle = grad;
    bctx.beginPath();
    bctx.moveTo(ox + s0 * near, oy + c0 * near);
    bctx.lineTo(ox + s1 * near, oy + c1 * near);
    bctx.lineTo(ox + s1 * reach, oy + c1 * reach);
    bctx.lineTo(ox + s0 * reach, oy + c0 * reach);
    bctx.closePath();
    bctx.fill();
  }

  function draw(t) {
    const ox = w / 2;
    // Apex sits above the top edge so the pinch point where every shaft
    // collapses to a point is off-screen. Sitting it on the edge gave the fan
    // a visible origin, which reads as a light source in the room rather than
    // beams passing through it. Far enough up that the narrowest shaft has
    // opened past the blur by the time it crosses into view.
    const oy = -ORIGIN_LIFT * scale;
    const reach = Math.hypot(w, h) * 1.35;

    bctx.clearRect(0, 0, w, h);
    bctx.globalCompositeOperation = "lighter";

    for (const b of BEAMS) {
      const angle = b.angle + swing(t * b.swaySpeed + b.swayPhase) * b.sway;
      // Never fully off: a beam that blinks out and back reads as a glitch.
      const flicker = 0.72 + 0.28 * Math.sin(t * b.flickerSpeed + b.flickerPhase);
      const gain = b.gain * flicker;
      // Only the shaft opens and closes. The edges are lines, so they keep
      // their thickness and travel apart instead of fattening with it.
      const wd =
        b.width * (1 + Math.sin(t * b.breatheSpeed + b.breathePhase) * b.breathe);
      const ed = b.edge;

      // Outside in: haze around the shaft, the green interior, then the two
      // edges last so they sit on top of their own fill rather than under it.
      const halo = wd * HALO_SPREAD;
      wedge(ox, oy, angle, -halo, halo, reach, HALO_ALPHA * gain, HALO_RGB);
      wedge(ox, oy, angle, -wd, wd, reach, FILL_ALPHA * gain, FILL_RGB);
      wedge(ox, oy, angle, -wd - ed, -wd + ed, reach, EDGE_ALPHA * gain, EDGE_RGB);
      wedge(ox, oy, angle, wd - ed, wd + ed, reach, EDGE_ALPHA * gain, EDGE_RGB);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // Wash: lifts the black just enough that the beams look like they are
    // lighting the room rather than floating over it.
    const wash = ctx.createRadialGradient(ox, oy, 0, ox, oy, h * 0.7);
    wash.addColorStop(0, "rgba(0,218,102,0.055)");
    wash.addColorStop(0.5, "rgba(0,218,102,0.014)");
    wash.addColorStop(1, "rgba(0,218,102,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    if (canBlur) {
      for (const [radius, alpha] of PASSES) {
        ctx.filter = `blur(${(radius * scale).toFixed(2)}px)`;
        ctx.globalAlpha = alpha;
        ctx.drawImage(buf, 0, 0, w, h);
      }
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(buf, 0, 0, w, h);
    }

    // Bloom, breathing on a period unrelated to any beam.
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.9);
    const r = Math.min(w, h) * 0.16 * pulse;
    const bloom = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    bloom.addColorStop(0, "rgba(200,255,225,0.22)");
    bloom.addColorStop(0.3, "rgba(0,218,102,0.085)");
    bloom.addColorStop(1, "rgba(0,218,102,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(ox - r, oy - r, r * 2, r * 2);

    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    stop();
    if (reduced.matches) {
      draw(0);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  resize();
  start();

  let queued = false;
  addEventListener("resize", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      resize();
      if (reduced.matches) draw(0);
    });
  });

  // Nothing to animate for a backgrounded tab.
  addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduced.addEventListener("change", start);
})();
