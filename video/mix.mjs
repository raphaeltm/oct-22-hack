// Mixes the voiceover, music bed and SFX onto out/picture.mp4, then writes the
// web deliverables: web/public/media/radar-film.{mp4,jpg,vtt}.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTimeline } from './timeline.mjs';

const ROOT = new URL('.', import.meta.url).pathname;
const WEB = join(ROOT, '../web/public/media');
mkdirSync(WEB, { recursive: true });
const durations = JSON.parse(readFileSync(join(ROOT, 'vo-durations.json'), 'utf8'));
const words = JSON.parse(readFileSync(join(ROOT, 'vo-words.json'), 'utf8'));
const lines = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'lines.json'), 'utf8')));
const { scenes, total } = buildTimeline(durations);
const S = Object.fromEntries(scenes.map((s) => [s.id, s]));

const lufs = (f) => {
  const txt = execFileSync('bash', ['-c', `ffmpeg -hide_banner -i "${f}" -af ebur128 -f null - 2>&1 | grep -E '^\\s+I:' | tail -n1`]).toString();
  return Number(txt.match(/-?\d+(\.\d+)?/)[0]);
};

// [file, start seconds, target LUFS]
const sfx = (n) => join(ROOT, 'audio/sfx', `${n}.mp3`);
const events = [];
const TICK = -33, WHOOSH = -31;
events.push([sfx('riser'), S.reveal.start + 0.35 - 2.5, -27]);
events.push([sfx('ping'), S.reveal.start + 0.3, -24]);
for (const id of ['profile', 'matches', 'rivals', 'auto', 'receipts', 'cta']) events.push([sfx('whoosh'), S[id].start - 0.45, WHOOSH]);
events.push([sfx('tick'), S.profile.start + 3.65, TICK]);
for (let i = 0; i < 4; i++) events.push([sfx('tick'), S.matches.start + 0.2 + i * 0.24, TICK - 2]);
for (let i = 0; i < 3; i++) events.push([sfx('tick'), S.rivals.start + 0.75 + i * 0.45, TICK - 2]);
events.push([sfx('ping'), S.cta.start + 0.25, -26]);

const inputs = [];
const parts = [];
let n = 0;
const add = (file, start, gainDb, extra = '') => {
  inputs.push('-i', file);
  const ms = Math.max(0, Math.round(start * 1000));
  parts.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${gainDb.toFixed(2)}dB${extra},adelay=${ms}|${ms}[a${n}]`);
  return n++;
};

// voice
const voIdx = scenes.map((s) => {
  const f = join(ROOT, 'audio/vo_trim', `${s.vo}.wav`);
  return add(f, s.voStart, -16 - lufs(f));
});
// effects
const fxIdx = events.map(([f, t, target]) => add(f, t, target - lufs(f)));
// music bed, looped to the full length
inputs.push('-stream_loop', '-1', '-i', sfx('bed'));
const bed = n++;
parts.push(`[${bed}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},volume=${(-25 - lufs(sfx('bed'))).toFixed(2)}dB,afade=t=in:d=1.5,afade=t=out:st=${(total - 3.5).toFixed(3)}:d=3.5[bedraw]`);

parts.push(`${voIdx.map((i) => `[a${i}]`).join('')}amix=inputs=${voIdx.length}:normalize=0,apad=whole_dur=${total.toFixed(3)}[vo]`);
parts.push('[vo]asplit=2[vo1][vokey]');
parts.push('[bedraw][vokey]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=450:makeup=1[bed]');
parts.push(`${fxIdx.map((i) => `[a${i}]`).join('')}amix=inputs=${fxIdx.length}:normalize=0[fx]`);
parts.push(`[vo1][bed][fx]amix=inputs=3:normalize=0,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

const mixWav = join(ROOT, 'out/mix.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', mixWav], { stdio: 'inherit' });
console.log('mixed audio');

// web mp4: 1080p H.264 + AAC, fast start for progressive playback
const mp4 = join(WEB, 'radar-film.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(ROOT, 'out/picture.mp4'), '-i', mixWav,
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-tune', 'animation', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', mp4], { stdio: 'inherit' });
// poster: the reveal beat (mirrors the landing hero)
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(S.reveal.start + 3.6), '-i', join(ROOT, 'out/picture.mp4'), '-frames:v', '1', '-vf', 'scale=1600:-1', '-q:v', '3', join(WEB, 'radar-film.jpg')], { stdio: 'inherit' });

// captions: one cue per voice line, timed from the transcript
const ts = (t) => {
  const ms = Math.round(t * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, '0')}`;
};
let vtt = 'WEBVTT\n\n';
scenes.forEach((s, i) => {
  const w = words[s.vo]?.words ?? [];
  const a = s.voStart + (w[0]?.[1] ?? 0);
  const b = s.voStart + (w.at(-1)?.[2] ?? s.voDur) + 0.4;
  vtt += `${i + 1}\n${ts(a)} --> ${ts(Math.min(b, s.end))}\n${lines[s.vo].replace('…', ',')}\n\n`;
});
writeFileSync(join(WEB, 'radar-film.vtt'), vtt);
console.log(`wrote ${mp4}, poster and captions (${total.toFixed(2)} s)`);
