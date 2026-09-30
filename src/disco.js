/* Makes the disco ball a pendulum you can drag.
 *
 * The whole .disco element rotates about the top of its cord rather than the
 * ball moving on its own, which is what a ball on a string actually does: the
 * cord stays straight and the ball tilts with it.
 *
 * Released, it integrates a damped pendulum rather than running a canned
 * keyframe animation. A fixed animation would always swing the same distance
 * for the same length of time, so a nudge and a hard flick would look
 * identical; here the release speed comes off the pointer and carries through.
 *
 * Idle cost is zero. The loop sleeps once the swing falls below a threshold
 * and is only woken by a release, so the page is not holding a frame open for
 * a ball that is hanging still, on top of what the lasers already cost.
 */
(() => {
  const root = document.querySelector(".disco");
  const ball = document.querySelector(".disco-ball");
  if (!root || !ball) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Pivot to centre of mass: 140px of cord, less the 8px the ball overlaps it,
  // plus the ball's 50px radius.
  const LENGTH = 182;
  // Not real gravity. Pixels are not metres, and at 9.81 the period works out
  // near 27 seconds, which reads as broken rather than slow. This gives about
  // 1.9s, which is what a ball on a short cord looks like.
  const GRAVITY = 2000;
  // Settles in about 11 seconds from a full-scale drag. Lighter damping looks
  // no better and keeps the corner of the page moving for nearly 20.
  const DAMPING = 1;
  // Past critical, so under reduced motion it returns to rest without ever
  // crossing centre. The drag still tracks; it just doesn't oscillate after.
  const REDUCED_DAMPING = 6;
  const MAX_ANGLE = 0.6;
  // Fixed substep. Integrating a whole frame at once goes unstable on a long
  // frame, and a dropped frame is exactly when the swing is worth keeping.
  const STEP = 1 / 240;
  const SLEEP_ANGLE = 0.002;
  const SLEEP_SPEED = 0.01;
  // A flick can report an enormous instantaneous speed, and this is a real
  // pendulum rather than an eased animation, so too much of it puts the ball
  // over the top: measured at 8 it carried 464 degrees, winding right round
  // the pivot instead of swinging. At 2.5 a hard flick from the drag limit
  // peaks near 53 degrees, which is as far as it can go and still read as a
  // swing.
  const MAX_RELEASE_SPEED = 2.5;
  // A pointer that came to rest before letting go should drop, not fling.
  const STALE_MS = 120;

  let angle = 0;
  let speed = 0;
  let pivotX = 0;
  let dragging = false;
  let pointerId = null;
  let lastAngle = 0;
  let lastTime = 0;
  let prev = 0;
  let carry = 0;
  let raf = null;

  function measure() {
    // Read the used style rather than the bounding box: the box is the rotated
    // one, so measuring it mid-swing would walk the pivot along with the ball.
    if (!root.offsetWidth) return;
    pivotX = parseFloat(getComputedStyle(root).left) + root.offsetWidth / 2;
  }

  // The cord swings and the ball counter-rotates by the same amount, so it
  // travels along the arc while keeping its own orientation. That is what a
  // ball on a chain does, as opposed to a bob on a rigid rod, and it is also
  // the only way the swing can go wide: the source is a photograph, so its
  // specular highlights are baked in, and carrying them round through 50
  // degrees reads as the room's lighting having swung rather than the ball.
  function render() {
    const t = angle ? `rotate(${angle.toFixed(5)}rad)` : "";
    root.style.transform = t;
    ball.style.transform = angle ? `rotate(${(-angle).toFixed(5)}rad)` : "";
  }

  // The CSS rotation that puts the ball under the pointer, taken from the
  // pointer's horizontal offset against the fixed cord length.
  //
  // The pointer's y is deliberately not used. It was the vertical leg of an
  // atan2, but it measures the absolute drop below the pivot, so dragging
  // downwards lengthened that leg and shrank the angle: the same 80px
  // sideways pull gave 30 degrees at the ball's resting height and 10 at
  // 300px below it, and a straight-down drag gave zero. Down-and-sideways is
  // the natural gesture on a ball hanging at the top of the screen, and a
  // drag that barely moved and then barely swung read as the ball having
  // seized. The cord can't stretch, so its length is the hypotenuse and the
  // horizontal offset alone fixes the angle.
  //
  // Note the sign. This returns a rotation, not a bearing, and a positive CSS
  // rotation carries a point hanging below the origin to the left: six
  // o'clock going clockwise arrives at seven, not five. Measuring the offset
  // the other way round and handing that straight to rotate() sends the ball
  // away from the pointer.
  function angleFor(x) {
    const reach = Math.max(-1, Math.min(1, (pivotX - x) / LENGTH));
    const a = Math.asin(reach);
    return Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
  }

  function frame(now) {
    const damping = reduced.matches ? REDUCED_DAMPING : DAMPING;
    carry += Math.min(0.05, (now - prev) / 1000);
    prev = now;

    while (carry >= STEP) {
      speed += (-(GRAVITY / LENGTH) * Math.sin(angle) - damping * speed) * STEP;
      angle += speed * STEP;
      carry -= STEP;
    }
    render();

    if (Math.abs(angle) < SLEEP_ANGLE && Math.abs(speed) < SLEEP_SPEED) {
      angle = 0;
      speed = 0;
      render();
      raf = null;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (raf !== null) return;
    prev = performance.now();
    carry = 0;
    raf = requestAnimationFrame(frame);
  }

  ball.addEventListener("pointerdown", (e) => {
    measure();
    dragging = true;
    pointerId = e.pointerId;
    ball.setPointerCapture(pointerId);
    root.classList.add("is-dragging");
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    speed = 0;
    angle = angleFor(e.clientX);
    lastAngle = angle;
    lastTime = performance.now();
    render();
    e.preventDefault();
  });

  ball.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const next = angleFor(e.clientX);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    // Sampling every move event makes the release speed jittery on a fast
    // pointer; a floor on dt averages over enough travel to be stable.
    if (dt > 0.008) {
      speed = (next - lastAngle) / dt;
      lastAngle = next;
      lastTime = now;
    }
    angle = next;
    render();
  });

  function release(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    pointerId = null;
    root.classList.remove("is-dragging");
    if (performance.now() - lastTime > STALE_MS) speed = 0;
    speed = Math.max(-MAX_RELEASE_SPEED, Math.min(MAX_RELEASE_SPEED, speed));
    wake();
  }

  ball.addEventListener("pointerup", release);
  ball.addEventListener("pointercancel", release);
  // Capture can be dropped without a pointerup ever reaching the ball. Left
  // unhandled, dragging stays true for good: the ball holds its angle, ignores
  // the physics loop and keeps the grabbing cursor, which is the one way it can
  // genuinely seize rather than just swing weakly.
  ball.addEventListener("lostpointercapture", release);

  measure();
  addEventListener("resize", measure);
})();
