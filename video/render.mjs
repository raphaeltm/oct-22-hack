// Renders film.html frame by frame with headless Chromium and pipes the frames to ffmpeg.
//   node render.mjs                 -> out/picture.mp4 (no audio, 30 fps)
//   node render.mjs --stills a,b,c  -> out/stills/t-<sec>.png for each time
//   node render.mjs --fps 10        -> quick low-fps preview
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('--fps', 30));
const stills = opt('--stills', null);
const outDir = join(ROOT, 'out');
await mkdir(join(outDir, 'stills'), { recursive: true });

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(ROOT)) throw new Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${port}/film.html`);
await page.waitForFunction(() => window.filmReady === true, null, { timeout: 30000 });
const total = await page.evaluate(() => window.TIMELINE.total);
console.log(`timeline ${total.toFixed(2)} s`);

if (stills) {
  for (const s of stills.split(',')) {
    const t = Number(s);
    await page.evaluate((x) => window.seek(x), t);
    await page.screenshot({ path: join(outDir, 'stills', `t-${t.toFixed(2).padStart(6, '0')}.png`) });
  }
  console.log(`wrote ${stills.split(',').length} stills`);
} else {
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', join(outDir, 'picture.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.ceil(total * FPS);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((x) => window.seek(x), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (FPS * 5) === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
  console.log(`wrote out/picture.mp4, ${frames} frames`);
}
await browser.close();
server.close();
