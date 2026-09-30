/* Two views over one shared background: the countdown and the run of show.
 *
 * The grid never re-renders — only the foreground cross-fades, driven by the
 * URL hash so the browser's back button returns to the countdown.
 *
 * The intro enters from above and exits below, so it only ever drifts
 * downwards. That needs two distinct off states, hence the is-leaving class.
 *
 * The run of show is the People & Operations programme for 1 October 2026.
 * Durations chain into the following start time everywhere except the welcome,
 * which leaves five minutes of slack before the icebreaker, so start times are
 * authored rather than derived.
 */
(() => {
  const SEGMENTS = [
    {
      time: "3:00PM",
      title: "Arrival & settle in",
      detail: "Music on, snacks out, teams find their spots",
      duration: "10 min",
    },
    {
      time: "3:10PM",
      title: "Welcome & house rules",
      detail: "Ayo opens · teams, scoring, prizes",
      duration: "10 min",
    },
    {
      time: "3:25PM",
      title: "Icebreaker",
      detail: "Two Truths & a Lie · quick-fire round",
      duration: "15 min",
    },
    {
      time: "3:40PM",
      title: "Game 1 — Word scramble",
      detail: "Rebus puzzles · Tournament",
      duration: "30 min",
    },
    {
      time: "4:10PM",
      title: "Break & refreshments",
      detail: "Reset drinks, mingle, catch breath",
      duration: "15 min",
    },
    {
      time: "4:25PM",
      title: "Game 2 — Company Quiz",
      detail: "10 to 15 questions · AIENAI, values, WoW",
      duration: "25 min",
    },
    {
      time: "4:50PM",
      title: "Game 3 — Imposter",
      detail: "Peak-energy closer for the games section",
      duration: "30 min",
    },
    {
      time: "5:20PM",
      title: "Scores & EOQ moment",
      detail: "Team scores tallied · EOQ winner announced · winning team prize",
      duration: "20 min",
    },
    {
      time: "5:40PM",
      title: "Words from Fe / Ini",
      detail: "Quarter wrap · thank-yous · look-ahead",
      duration: "10 min",
    },
    {
      time: "5:50PM",
      title: "Group photo",
      detail: "Wardrobe reset · team + individual shots",
      duration: "10 min",
    },
    {
      time: "6:00PM",
      title: "Free flow",
      detail: "Music up, drinks out, roll into dinner venue",
      duration: "",
    },
  ];

  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  document.getElementById("schedule-rows").innerHTML = SEGMENTS.map(
    (s) => `<div class="schedule-row">
      <span class="col-time">${escape(s.time)}</span>
      <span class="col-segment"><b>${escape(s.title)}</b><small>${escape(s.detail)}</small></span>
      <span class="col-duration">${escape(s.duration)}</span>
    </div>`
  ).join("");

  const views = new Map(
    [...document.querySelectorAll(".view")].map((el) => [el.id, el])
  );

  function show(name, initial) {
    const active = views.has(name) ? name : "intro";

    for (const [id, el] of views) {
      const isActive = id === active;

      if (isActive && el.classList.contains("is-leaving")) {
        // Return to the pre-entry offset. The view is transparent here, but the
        // jump still has to be committed unanimated or it plays in reverse.
        el.classList.add("no-transition");
        el.classList.remove("is-leaving");
        el.offsetHeight;
        el.classList.remove("no-transition");
      } else if (!isActive && el.classList.contains("is-active")) {
        el.classList.add("is-leaving");
      }

      el.classList.toggle("is-active", isActive);
      el.setAttribute("aria-hidden", String(!isActive));
    }

    if (!initial) {
      views.get(active).querySelector("[data-focus]").focus({ preventScroll: true });
    }
  }

  addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1), true);
})();
