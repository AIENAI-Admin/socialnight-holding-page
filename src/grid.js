/* Perspective floor from Figma node 3725:7473.
 *
 * Figma exports this as 73 masked SVGs (~10MB) at one fixed size. The geometry
 * underneath is simple, so it is redrawn here to whatever the viewport is.
 *
 * Everything is expressed relative to the floor depth (horizon to bottom edge),
 * which keeps the grid self-similar: a taller viewport scales the whole floor
 * rather than revealing a differently-proportioned one. Row positions and the
 * bottom-edge column spacing match the measured design at 1440x832; the
 * columns terminate on a band rather than the Figma vanishing point.
 */
(() => {
  const svg = document.getElementById("grid");
  if (!svg) return;

  const HORIZON = 0.5112; // fraction of viewport height, from the 1440x832 frame
  const COLUMN_SLOPE = 0.40912; // sideways drift per pixel of depth, per column
  const REFERENCE_DEPTH = 406.947;
  const REFERENCE_STROKE = 2;
  const FAN = 40; // extra columns past the viewport edge, forming the haze at the horizon

  // Columns terminate along a horizontal band rather than a single vanishing
  // point. tanh puts the outer columns asymptotically at the band's two ends,
  // so the haze collects there instead of being lost off-screen.
  const BAND_WIDTH = 0.6; // fraction of viewport width spanned by the band
  const BAND_TAPER = 0.12; // column spacing at the band, relative to the bottom edge

  // Row positions as fractions of floor depth, measured off the Figma export.
  // They compress faster than a true perspective near the horizon, so they are
  // kept verbatim rather than derived.
  const ROWS = [
    0.994, 0.92551, 0.86256, 0.80392, 0.74914, 0.69803, 0.65001, 0.60507,
    0.56274, 0.52273, 0.48502, 0.44947, 0.41561, 0.38359, 0.35312, 0.32419,
    0.29664, 0.27047, 0.24538, 0.22137, 0.1986, 0.17659, 0.15565, 0.13549,
    0.1161, 0.09748, 0.07962, 0.06254, 0.04592, 0.03007, 0.01467,
  ];

  const FADE_TO = 0.06; // line opacity at the bottom edge; zero at the horizon

  function draw() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const horizonY = h * HORIZON;
    const depth = h - horizonY;
    const originX = w / 2;
    const spread = COLUMN_SLOPE * depth; // column spacing at the bottom edge

    const parts = [
      `<defs><linearGradient id="grid-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${horizonY.toFixed(2)}" x2="0" y2="${h}">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#fff" stop-opacity="${FADE_TO}"/>` +
        `</linearGradient></defs>`,
    ];
    const line = (x1, y1, x2, y2) =>
      parts.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`
      );

    const halfBand = (BAND_WIDTH * w) / 2;
    const bandSpacing = BAND_TAPER * spread;

    const columns = Math.ceil(originX / spread) + FAN;
    for (let n = -columns; n <= columns; n++) {
      const top = originX + halfBand * Math.tanh((n * bandSpacing) / halfBand);
      const drift = originX + n * spread - top;
      // Cut each column where it leaves the viewport, sideways or at the bottom.
      const t =
        drift === 0 ? 1 : Math.min(1, (drift > 0 ? w - top : top) / Math.abs(drift));
      line(top, horizonY, top + drift * t, horizonY + depth * t);
    }

    for (const t of ROWS) {
      const y = horizonY + depth * t;
      line(0, y, w, y);
    }

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("stroke", "url(#grid-fade)");
    svg.setAttribute("stroke-width", (REFERENCE_STROKE * (depth / REFERENCE_DEPTH)).toFixed(2));
    svg.innerHTML = parts.join("");
  }

  let queued = false;
  draw();
  addEventListener("resize", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  });
})();
