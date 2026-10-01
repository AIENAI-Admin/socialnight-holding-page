/* Counts down to 15:00 WAT on 1 October 2026. WAT is UTC+1 with no DST, so the
 * target is a fixed instant and the page shows the same remaining time in every
 * timezone.
 *
 * At zero the clock stops on 00:00:00 and the headline swaps. Hours are padded
 * like the other two units so that final state reads as a whole clock rather
 * than "0:00:00", and so the line doesn't reflow when it drops below ten.
 *
 * #intro-end previews that finished state without waiting for the clock. It is
 * not a view of its own: views.js doesn't recognise it, so it falls through to
 * the intro, and the only thing that changes here is the reading of how much
 * time is left. Navigating away restores the real countdown, so the preview
 * can't get stuck.
 */
(() => {
  const TARGET = Date.UTC(2026, 9, 1, 14, 0, 0);
  const PREVIEW_HASH = "#intro-end";

  const headline = document.querySelector(".headline");
  const hours = document.getElementById("hours");
  const minutes = document.getElementById("minutes");
  const seconds = document.getElementById("seconds");

  const WAITING_HEADLINE = headline.innerHTML;
  const LIVE_HEADLINE = "GAMES NIGHT<br>IS LIVE \u{1F525}";

  const pad = (n) => String(n).padStart(2, "0");

  // Tri-state, so the first call always writes and later ones only touch the
  // headline when the state actually flips rather than once a second.
  let live = null;
  let timer = null;

  function setLive(next) {
    if (next === live) return;
    live = next;
    headline.innerHTML = next ? LIVE_HEADLINE : WAITING_HEADLINE;
    headline.classList.toggle("is-live", next);
  }

  function tick() {
    clearTimeout(timer);

    const left =
      location.hash === PREVIEW_HASH ? 0 : Math.max(0, TARGET - Date.now());
    const total = Math.floor(left / 1000);

    hours.textContent = pad(Math.floor(total / 3600));
    minutes.textContent = pad(Math.floor(total / 60) % 60);
    seconds.textContent = pad(total % 60);
    setLive(left === 0);

    if (left > 0) timer = setTimeout(tick, 1000 - (Date.now() % 1000));
  }

  tick();
  addEventListener("hashchange", tick);
  // A backgrounded tab has its timers throttled, and a frozen or suspended one
  // has them deferred outright, so the swap can land late for anyone who left
  // the page open across the start. tick() clears its own pending timer before
  // doing anything, so calling it again is safe: it just re-reads the clock and
  // re-arms. Returning to the tab therefore always shows the true state rather
  // than whatever the last timer that managed to run left behind.
  // Deliberately not gated on document.hidden. Ticking on the way out is
  // harmless, and trusting that flag would mean trusting the one thing that is
  // unreliable here: anything that reports the page hidden while it is on
  // screen would suppress the very correction this exists to make.
  // Bound to document, which is where the event is actually fired. It does
  // bubble to window, but there is no reason to depend on that.
  document.addEventListener("visibilitychange", tick);
})();
