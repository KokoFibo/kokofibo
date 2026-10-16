import { createScene } from '../../src/lib/scene/engine';
import { Journey } from '../../src/lib/scene/journey';
import { WebGLRenderer } from 'three';

// ---------- fake browser ----------
const VW = 1440, VH = 900;
type Box = { x: number; y: number; w: number; h: number };
const el = (b: Box) => ({ offsetLeft: b.x, offsetTop: b.y, offsetWidth: b.w, offsetHeight: b.h, offsetParent: null as any });
const els: Record<string, any> = {};
let y = 0;
const sect = (n: string, h: number) => { els[`[data-scene="${n}"]`] = el({ x: 0, y, w: VW, h }); const t = y; y += h; return t; };
sect('hero', 828); els['#terminal'] = el({ x: 820, y: 250, w: 520, h: 330 });
const sTop = sect('services', 1160);
['web', 'ai', 'trading', 'hr', 'support'].forEach((id, i) => { els[`[data-hub="${id}"]`] = el({ x: 120 + (i % 3) * 406, y: sTop + 368 + Math.floor(i / 3) * 350, w: 386, h: 330 }); });
const pTop = sect('process', 740);
for (let i = 0; i < 4; i++) els[`[data-stage="${i}"]`] = el({ x: 120 + i * 308, y: pTop + 368, w: 276, h: 260 });
sect('portfolio', 910); sect('testimonials', 780);
const cTop = sect('cta', 804); els['[data-logo-anchor]'] = el({ x: 576, y: cTop + 112, w: 288, h: 288 });
const PAGE = y;

const winL: Record<string, Function[]> = {}, docL: Record<string, Function[]> = {}, canL: Record<string, Function[]> = {};
const on = (m: Record<string, Function[]>) => (t: string, f: Function) => (m[t] ??= []).push(f);
const off = (m: Record<string, Function[]>) => (t: string, f: Function) => { m[t] = (m[t] ?? []).filter((g) => g !== f); };
const fire = (m: Record<string, Function[]>, t: string, e: any = {}) => (m[t] ?? []).slice().forEach((f) => f(e));
const W: any = { scrollX: 0, scrollY: 0, innerWidth: VW, innerHeight: VH, devicePixelRatio: 2, addEventListener: on(winL), removeEventListener: off(winL), matchMedia: () => ({ matches: false }) };
const D: any = { hidden: false, readyState: 'complete', addEventListener: on(docL), removeEventListener: off(docL), documentElement: { scrollHeight: PAGE },
  querySelector: (s: string) => els[s] ?? null, getElementById: (id: string) => els['#' + id] ?? null };
const C: any = { clientWidth: VW, clientHeight: VH, style: {} as any, addEventListener: on(canL), removeEventListener: off(canL) };
(globalThis as any).window = W; (globalThis as any).document = D; Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 8, deviceMemory: 8 }, configurable: true });
Object.defineProperty(globalThis, 'location', { value: { search: '' }, configurable: true });

// ---------- manual clock + rAF ----------
let clock = 1000; let queue: { id: number; cb: Function }[] = []; let nextId = 1;
(globalThis as any).requestAnimationFrame = (cb: Function) => { queue.push({ id: nextId, cb }); return nextId++; };
(globalThis as any).cancelAnimationFrame = (id: number) => { queue = queue.filter((q) => q.id !== id); };
(performance as any).now = () => clock;
function frames(n: number, dtMs = 16.7) { for (let i = 0; i < n; i++) { clock += dtMs; const q = queue; queue = []; q.forEach((e) => e.cb(clock)); } }
const engineQueued = () => queue.filter((q) => q.cb.name === 'frame').length;
const scrollTo = (v: number) => { W.scrollY = v; fire(winL, 'scroll'); };

let fails = 0;
const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const uni = (r: WebGLRenderer) => {
  const u: Record<string, any> = {};
  const group = r.lastScene.children[0];
  const nodes = group.children.find((c: any) => c.type === 'Points' && c.material.uniforms.uColorB);
  for (const k of ['uMorph', 'uPipe', 'uRecede', 'uProg', 'uLogo', 'uWave', 'uPipeW', 'uBurst']) u[k] = nodes.material.uniforms[k].value;
  u.glow = nodes.material.uniforms.uHubGlow.value.slice();
  return u;
};

// ---------- scenario ----------
const journey = new Journey(); journey.measure();
const cap = { tier: 'full' as const, maxDpr: 2, nodeCount: 140, pulseCount: 18, fpsCap: 60, pointer: true };
let ready = 0; let fallback: string | null = null;
const ctrl = createScene(C as any, cap as any, journey, { onReady: () => ready++, onFallback: (r) => (fallback = r) });
const R = WebGLRenderer.instances[0];

console.log('1) hero');
frames(5);
check(R.renders >= 1 && ready === 1, `first frame rendered, onReady fired once (renders=${R.renders})`);
check(C.style.opacity === '1', `canvas opacity 1 at top (got ${C.style.opacity})`);
check(R.sizes.length >= 1 && R.sizes[0][0] === VW, `renderer sized to ${VW}×${VH}`);
check(R.dpr === 2, 'pixel ratio = min(devicePixelRatio, tier cap) = 2');

console.log('2) scroll through the whole page, 30px at a time, 4 frames per step');
let maxMorph = 0, maxPipe = 0, maxRecede = 0, maxProg = 0, maxLogo = 0; let monotonicProblems = 0;
let prevAct = [0, 0, 0, 0, 0]; let sawStop = false;
for (let sy = 0; sy <= PAGE - VH; sy += 30) {
  scrollTo(sy); frames(4);
  if (engineQueued() === 0) sawStop = true;
  const u = uni(R);
  maxMorph = Math.max(maxMorph, u.uMorph); maxPipe = Math.max(maxPipe, u.uPipe); maxRecede = Math.max(maxRecede, u.uRecede); maxProg = Math.max(maxProg, u.uProg); maxLogo = Math.max(maxLogo, u.uLogo);
  for (const v of Object.values(u)) if (typeof v === 'number' && !Number.isFinite(v)) monotonicProblems++;
}
frames(120); // let everything settle at the bottom of the page
const bottom = uni(R);
maxLogo = Math.max(maxLogo, bottom.uLogo);
check(maxMorph > 0.99 && maxPipe > 0.99 && maxRecede > 0.99 && maxProg > 0.99 && maxLogo > 0.99, `all five acts reached their end values (morph ${maxMorph.toFixed(2)}, pipe ${maxPipe.toFixed(2)}, recede ${maxRecede.toFixed(2)}, prog ${maxProg.toFixed(2)}, logo ${maxLogo.toFixed(2)})`);
check(monotonicProblems === 0, 'no NaN/Infinity in any uniform while scrolling');
check(bottom.uLogo > 0.99 && Math.abs(Number(C.style.opacity) - 0.9) < 0.01, `finale settled at page bottom (logo ${bottom.uLogo.toFixed(2)}, canvas opacity ${C.style.opacity})`);
check(engineQueued() > 0, 'loop keeps running in the finale (shimmer / orbiting comets)');

console.log('3) still zone (testimonials): render stops, scroll does not wake it, resize does');
scrollTo(3500); frames(240);
check(engineQueued() === 0, 'rendering stopped once the scene settled in the still zone');
const before = R.renders; scrollTo(3560); frames(5);
check(R.renders === before, 'scrolling inside the still zone renders nothing');
fire(winL, 'resize'); W.innerWidth = VW; C.clientWidth = VW - 1; fire(winL, 'resize'); frames(6); C.clientWidth = VW; fire(winL, 'resize'); frames(6);
check(R.renders > before, `a resize forces a few redraws (+${R.renders - before})`);
frames(20); check(engineQueued() === 0, 'and the loop stops again afterwards');
scrollTo(4100); frames(3);
check(engineQueued() > 0, 'leaving the still zone (finale converging) wakes the loop');

console.log('4) video modal pause');
scrollTo(3500); frames(240);
ctrl.setPaused(false); frames(4); const r0 = R.renders;
scrollTo(1000); frames(3); ctrl.setPaused(true); frames(5);
const r1 = R.renders; frames(30);
check(R.renders === r1 && engineQueued() === 0, 'paused: no frames rendered, no pending rAF');
scrollTo(1100); frames(10);
check(R.renders === r1, 'paused: scrolling does not restart rendering');
ctrl.setPaused(false); frames(6);
check(R.renders > r1, 'resumed: rendering continues');

console.log('5) hero interactions');
scrollTo(0); frames(240);
winL['kf:pulse']?.forEach((f) => f());
frames(3); check(uni(R).uWave >= 0, `terminal pulse starts a wave (uWave=${uni(R).uWave.toFixed(2)})`);
frames(130); check(uni(R).uWave === -1, 'the wave ends by itself');
scrollTo(1300); frames(240);
ctrl.setActiveHub(2); frames(60); const g = uni(R).glow;
check(g[2] > 0.95 && g[0] < 0.3, `hover on card 3 lights hub 3 and dims the others (glow ${g.map((v: number) => v.toFixed(2)).join(', ')})`);
ctrl.setActiveHub(-1); frames(90); const g2 = uni(R).glow; check(g2.every((v: number) => v > 0.6 && v < 0.7), 'hover end returns all hubs to the resting glow');
ctrl.setLogoActive(true); ctrl.kickLogo(); frames(3); ctrl.setLogoActive(false); frames(3);
check(true, 'logo hover / kick calls do not throw');

console.log('6) hidden tab');
D.hidden = true; fire(docL, 'visibilitychange'); frames(5);
check(engineQueued() === 0, 'hidden tab: loop stopped');
D.hidden = false; fire(docL, 'visibilitychange'); frames(5);
check(engineQueued() > 0, 'tab visible again: loop restarted');

console.log('7) slow device → adaptive quality (fresh scene: the monitor only watches the start)');
ctrl.destroy();
scrollTo(0);
let fb2: string | null = null;
const ctrl2 = createScene(C as any, cap as any, journey, { onFallback: (r) => (fb2 = r) });
const R2 = WebGLRenderer.instances[WebGLRenderer.instances.length - 1];
let dprAtFirstDrop = -1;
for (let i = 0; i < 600 && !fb2; i++) { frames(1, 45); if (dprAtFirstDrop < 0 && R2.dpr === 1) dprAtFirstDrop = i; }
check(dprAtFirstDrop > 0, `slow frames (45 ms) first lower the pixel ratio 2 → 1 (after ${dprAtFirstDrop} frames)`);
check(fb2 === 'slow-device' && R2.disposed && R2.lostCtx, `then fall back to the SVG and release the GL context (fallback="${fb2}")`);
check(R.disposed && R.lostCtx, 'destroy() of the first scene released its context too');
void ctrl2;

console.log('8) debug stats and JS cost per frame');
{
  scrollTo(PAGE - VH); frames(200);
  const R3 = WebGLRenderer.instances[WebGLRenderer.instances.length - 1];
  void R3;
  const st = ctrl2.stats();
  check(st.tier === 'full' && Number.isFinite(st.fps) && st.gpu === 'FAKE GPU' && st.drawCalls === 12, `stats() reports tier, fps, gpu and draw calls (fps ${st.fps.toFixed(0)})`);
}
{
  // a fresh, healthy scene in the finale (the busiest state: everything morphed, comets + glow + sweep)
  const c3 = createScene(C as any, cap as any, journey, {});
  scrollTo(PAGE - VH); frames(240);
  const t0 = process.hrtime.bigint(); const N = 2000;
  for (let i = 0; i < N; i++) frames(1, 16.7);
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  check(us < 1000, `JS cost per frame in the finale: ${us.toFixed(0)} µs (Node, fake renderer; budget < 1000 µs)`);
  c3.destroy();
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nENGINE SMOKE TEST PASSED');
process.exit(fails ? 1 : 0);
