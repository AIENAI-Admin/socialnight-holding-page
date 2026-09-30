/* Clicks the ENTER button.
 *
 * The source recording is a real mouse click, which is two separate transients:
 * a quiet tick as the button goes down and a louder one as it comes back up,
 * 125ms apart. Rather than store that gap, the two are cut out as their own
 * assets and fired on pointerdown and pointerup, so the sound lasts as long as
 * the press actually lasts. A long hold holds the click open, which a single
 * baked clip can't do, and it drops the 115ms of inaudible silence between them
 * that would otherwise be ~70% of the bytes.
 *
 * Web Audio rather than an <audio> element: a new buffer source per press has
 * no rewind, so repeated taps always sound and overlap cleanly instead of
 * cutting each other off.
 *
 * The context is built on the first press, not at load. Built at load it would
 * be born suspended and log an autoplay warning; built inside the gesture it
 * starts running. Decoding is async, so the very first press plays a frame or
 * two late, and every press after it is immediate.
 */
(() => {
  const enter = document.querySelector(".enter");
  if (!enter) return;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  // Both peak at -1dBFS. That is mastering level, not interface level, so it is
  // pulled down here rather than baked into the assets: the gain is the part
  // worth tuning, and attenuating the PCM would only throw away resolution.
  const VOLUME = 0.35;

  const SOUNDS = {
    down: "{{CLICK_DOWN}}",
    up: "{{CLICK_UP}}",
  };

  let ctx = null;
  const decoded = {};
  // A press that lands on the button but is released somewhere else still has
  // to close the click, so the release is watched on the window. The flag keeps
  // that from firing on presses that started anywhere but the button.
  let armed = false;

  function bytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function play(which) {
    if (!ctx) {
      ctx = new Ctx();
      for (const name of Object.keys(SOUNDS)) {
        decoded[name] = ctx.decodeAudioData(bytes(SOUNDS[name]));
      }
    }
    // Returning to the tab can leave the context suspended even though it was
    // started from a gesture.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const here = ctx;
    decoded[which]
      .then((buffer) => {
        const src = here.createBufferSource();
        const gain = here.createGain();
        src.buffer = buffer;
        gain.gain.value = VOLUME;
        src.connect(gain).connect(here.destination);
        src.start();
      })
      // Decoding or playback failing is not a reason to break the button.
      .catch(() => {});
  }

  function press() {
    armed = true;
    play("down");
  }

  function release() {
    if (!armed) return;
    armed = false;
    play("up");
  }

  enter.addEventListener("pointerdown", press);

  // Enter and Space activate the link too, and holding either repeats keydown.
  enter.addEventListener("keydown", (e) => {
    if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
    press();
  });

  // All three on the window: activating the link hands focus to the schedule
  // heading, so by the time the key comes back up the button no longer has it
  // and a listener bound to the button would never hear the release.
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  addEventListener("keyup", release);
})();
