// Browser check of the landing page film section against a running web build
// (default http://127.0.0.1:4173, e.g. `npm run build -w web && npx vite preview` in web/).
// Covers desktop and mobile layout, mouse and keyboard playback, captions and the error state.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = new URL('./out/landing/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('#film').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200); // reveal transition
  return { page, errors };
}

// desktop, mouse
{
  const { page, errors } = await open({ width: 1440, height: 900 });
  const requested = [];
  page.on('request', (r) => { if (r.url().includes('radar-film.mp4')) requested.push(r.url()); });
  await page.locator('#film').screenshot({ path: OUT + 'desktop-idle.png' });
  const poster = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = document.querySelector('.lp-film-frame video').poster; }));
  ok('poster loads', poster > 0, `${poster}px`);
  ok('video not downloaded before play', requested.length === 0);
  await page.getByRole('button', { name: /watch the film/i }).click();
  await page.waitForFunction(() => document.querySelector('.lp-film-frame video').currentTime > 2, null, { timeout: 15000 }).catch(() => {});
  const st = await page.evaluate(() => { const v = document.querySelector('.lp-film-frame video'); return { t: v.currentTime, paused: v.paused, muted: v.muted, controls: v.controls, dur: v.duration, w: v.videoWidth, err: v.error?.code ?? null, tracks: v.textTracks.length }; });
  ok('plays with sound after click', st.t > 2 && !st.paused && !st.muted, JSON.stringify(st));
  ok('native controls shown while playing', st.controls);
  const shown = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.lp-film-frame').parentElement).opacity));
  ok('frame stays visible while playing', shown > 0.95, `opacity ${shown}`);
  ok('captions track present', st.tracks === 1);
  const vtt = await page.evaluate(async () => { const r = await fetch('/media/radar-film.vtt'); return { status: r.status, body: (await r.text()).slice(0, 6) }; });
  ok('captions file served', vtt.status === 200 && vtt.body === 'WEBVTT', JSON.stringify(vtt));
  await page.locator('#film').screenshot({ path: OUT + 'desktop-playing.png' });
  await page.locator('.lp-problem').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  ok('pauses when scrolled to another panel', await page.evaluate(() => document.querySelector('.lp-film-frame video').paused));
  ok('no page errors (desktop)', errors.length === 0, errors.join('; '));
  await page.close();
}

// the whole video frame fits on screen below the fixed nav (vertical page)
for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  const { page } = await open(vp);
  await page.locator('.lp-film-frame').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const f = document.querySelector('.lp-film-frame').getBoundingClientRect();
    const nav = document.querySelector('.lp-nav').getBoundingClientRect();
    return { h: Math.round(f.height), w: Math.round(f.width), left: f.left, right: f.right, navBottom: nav.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  ok(`film frame fits ${vp.width}x${vp.height}`, r.h <= vp.height - r.navBottom && r.left >= 0 && r.right <= vp.width && !r.overflow, JSON.stringify(r));
  await page.screenshot({ path: OUT + `panel-${vp.width}.png` });
  await page.close();
}

// keyboard only
{
  const { page } = await open({ width: 1280, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => document.activeElement?.classList.contains('lp-film-play'));
  }
  ok('play button reachable by Tab', found);
  if (found) {
    await page.locator('.lp-film-play').screenshot({ path: OUT + 'keyboard-focus.png' }).catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.lp-film-frame video').currentTime > 1, null, { timeout: 15000 }).catch(() => {});
    ok('Enter starts playback', await page.evaluate(() => document.querySelector('.lp-film-frame video').currentTime > 1));
  }
  await page.close();
}

// mobile
{
  const { page, errors } = await open({ width: 390, height: 844 });
  await page.locator('#film').screenshot({ path: OUT + 'mobile-idle.png' });
  const box = await page.locator('.lp-film-frame').boundingBox();
  ok('mobile frame fits viewport', box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('no horizontal overflow on mobile', !overflow);
  ok('no page errors (mobile)', errors.length === 0, errors.join('; '));
  await page.close();
}

// error state: the file is missing
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**/radar-film.mp4', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('#film').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /watch the film/i }).click();
  await page.waitForSelector('.lp-film-frame.error', { timeout: 10000 }).catch(() => {});
  const txt = await page.locator('.lp-film-frame').innerText();
  ok('missing file shows an error, not a spinner', /failed to load/i.test(txt), JSON.stringify(txt));
  await page.waitForTimeout(800);
  await page.locator('#film').screenshot({ path: OUT + 'error.png' });
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
