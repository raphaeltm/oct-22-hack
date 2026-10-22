// Scene timing for the film. Shared by film.js (pictures) and mix.mjs (sound),
// so the voiceover and the pictures can't drift apart.
//
// Each beat starts when the previous one ends. Its voice line starts `lead`
// seconds in, and the beat lasts at least `min` seconds or long enough for the
// line plus `tail`.
export const BEATS = [
  { id: 'hook', vo: '01_hook', lead: 0.5, tail: 0.7, min: 7.5 },
  { id: 'insight', vo: '02_insight', lead: 0.35, tail: 1.6, min: 7.5 },
  { id: 'reveal', vo: '03_reveal', lead: 0.8, tail: 1.1, min: 5.4 },
  { id: 'gap', vo: '04_gap', lead: 0.5, tail: 2.4, min: 7.4 },
  { id: 'partners', vo: '05_partners', lead: 0.5, tail: 1.8, min: 9 },
  { id: 'outreach', vo: '06_outreach', lead: 0.5, tail: 2.6, min: 7.6 },
  { id: 'replies', vo: '07_replies', lead: 0.5, tail: 2, min: 8.4 },
  { id: 'receipts', vo: '08_receipts', lead: 0.35, tail: 1.2, min: 3.6 },
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
