// Scene timing for the film. Shared by film.js (pictures) and mix.mjs (sound),
// so the voiceover and the pictures can't drift apart.
//
// Each beat starts when the previous one ends. Its voice line starts `lead`
// seconds in, and the beat lasts at least `min` seconds or long enough for the
// line plus `tail`.
export const BEATS = [
  { id: 'hook', vo: '01_hook', lead: 0.45, tail: 0.15, min: 6.2 },
  { id: 'problem', vo: '02_problem', lead: 0.25, tail: 0.75, min: 7 },
  { id: 'reveal', vo: '03_reveal', lead: 0.9, tail: 1.1, min: 5.4 },
  { id: 'profile', vo: '04_profile', lead: 0.5, tail: 1.7, min: 8.2 },
  { id: 'matches', vo: '05_matches', lead: 0.5, tail: 3.2, min: 9.6 },
  { id: 'rivals', vo: '06_rivals', lead: 0.5, tail: 2.9, min: 9.2 },
  { id: 'auto', vo: '07_autopilot', lead: 0.5, tail: 2.6, min: 9.4 },
  { id: 'receipts', vo: '08_receipts', lead: 0.35, tail: 1.3, min: 3.6 },
  { id: 'cta', vo: '09_cta', lead: 0.6, tail: 4.2, min: 7.4 },
];

export function buildTimeline(durations) {
  let t = 0;
  const scenes = BEATS.map((b) => {
    const vo = durations[b.vo] ?? 4;
    const dur = Math.max(b.min, b.lead + vo + b.tail);
    const s = { ...b, start: t, end: t + dur, dur, voStart: t + b.lead, voDur: vo };
    t += dur;
    return s;
  });
  return { scenes, total: t };
}
