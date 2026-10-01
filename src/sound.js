/* Background music, off by default.
 *
 * The track is referenced by URL rather than inlined. It is 2.1MB, which is
 * ~2.9MB once base64'd into a 142KB page, so inlining would make every visitor
 * pay for audio most of them never turn on. The URL is absolute rather than
 * relative because the standalone file gets opened from contexts with no base
 * URL, where a relative path silently resolves to nothing. Nothing is fetched
 * until someone asks for sound.
 *
 * An <audio> element, not decodeAudioData. Web Audio decodes to uncompressed
 * Float32, so 135 seconds of 44.1kHz stereo would sit resident at ~48MB, and
 * all that buys is sample-accurate scheduling that background music has no use
 * for. click.js is the opposite case and correctly uses Web Audio: its sounds
 * are milliseconds long and have to land on the exact edge of a press.
 *
 * Off is the default, and the choice is remembered. Autoplay is blocked until a
 * gesture, so a returning visitor's stored "on" is attempted rather than
 * assumed: if it is refused, the control waits for their next interaction and
 * honours it then, instead of displaying ON over silence.
 *
 * There is deliberately no fade. It was written with one and removed: ramping
 * up from zero means the element spends its first moments silent, and Chrome
 * treats silent media in a backgrounded page as video-only and pauses it to
 * save power, which rejects the pending play() with an AbortError. Anyone who
 * turned sound on and changed tab inside the fade got nothing. The ramp can't
 * be moved to a Web Audio gain node either: MediaElementSource on a
 * cross-origin stream without CORS outputs silence, and this track is
 * cross-origin by design. Starting at the target level costs a soft entry;
 * stopping dead is what someone pressing OFF is asking for anyway.
 */
(() => {
  const TRACK = "{{TRACK_URL}}";
  const KEY = "aienai-sound";
  // Background level. The track peaks at -3.9dB, so it is mastered loud and
  // carries the room from down here.
  const VOLUME = 0.3;

  const group = document.querySelector(".sound");
  if (!group) return;

  const options = new Map(
    [...group.querySelectorAll("[data-sound]")].map((b) => [b.dataset.sound, b])
  );

  let audio = null;
  let armed = false;
  // The standing intent, which is not the same as whether audio is playing:
  // between a click and play() resolving, this is already true. The error
  // handler reads it to know whether there is anything left to correct.
  let wanted = false;
  // Bumped on every change of intent. A play() that resolves after the visitor
  // has asked for silence checks this and stands down rather than painting ON
  // over their decision.
  let gen = 0;

  // localStorage throws rather than returning null under some privacy settings,
  // and is missing outright for a file:// page in a few browsers. Neither is
  // reason to lose the control, so reads and writes are both best effort.
  const remember = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  };

  const recall = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };

  function paint(on) {
    for (const [name, button] of options) {
      const current = (name === "on") === on;
      button.classList.toggle("is-current", current);
      button.setAttribute("aria-pressed", String(current));
    }
  }

  // Waiting for the first gesture after a blocked autoplay. Both listeners have
  // to come off together, so neither uses { once: true }.
  function arm() {
    if (armed) return;
    armed = true;
    addEventListener("pointerdown", wake);
    addEventListener("keydown", wake);
  }

  function disarm() {
    if (!armed) return;
    armed = false;
    removeEventListener("pointerdown", wake);
    removeEventListener("keydown", wake);
  }

  function wake() {
    disarm();
    start(false);
  }

  /* `asked` separates a click on ON from a restore on load. A click gets
   * optimistic feedback, because play() doesn't resolve until audio actually
   * starts and over 2MB that is a visible wait in which the control would feel
   * dead. A restore gets none, because it is expected to be refused. */
  function start(asked) {
    const mine = ++gen;
    disarm();
    wanted = true;

    if (asked) {
      paint(true);
      remember("on");
    }

    if (!audio) {
      audio = new Audio(TRACK);
      audio.loop = true;
      // Bound once, so it outlives any single call and can't close over a
      // generation. The standalone file opened offline, or the host moving out
      // from under the URL, both land here. Reverting quietly is the right
      // failure: this is a holding page, not a player, and an error nobody can
      // act on is worse than silence.
      audio.addEventListener("error", () => {
        if (wanted) paint(false);
      });
    }

    audio.volume = VOLUME;
    // Older Safari returns undefined from play() rather than a promise.
    Promise.resolve(audio.play())
      .then(() => {
        if (gen !== mine) return;
        paint(true);
        remember("on");
      })
      .catch(() => {
        if (gen !== mine) return;
        paint(false);
        if (asked) {
          // Not the autoplay policy: this followed a real click. Something else
          // failed, so don't leave behind a preference that can't be honoured.
          remember("off");
        } else {
          // Expected on a fresh load, where the policy wants a gesture first.
          // The preference stands and the next interaction anywhere starts it.
          arm();
        }
      });
  }

  function stop() {
    gen++;
    disarm();
    wanted = false;
    paint(false);
    remember("off");
    if (audio) audio.pause();
  }

  options.get("on").addEventListener("click", () => start(true));
  options.get("off").addEventListener("click", stop);

  if (recall() === "on") start(false);
})();
