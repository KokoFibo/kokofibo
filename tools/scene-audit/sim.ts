import { Journey, newSample } from '../../src/lib/scene/journey';

type Box = { x: number; y: number; w: number; h: number };
function el(b: Box) { return { offsetLeft: b.x, offsetTop: b.y, offsetWidth: b.w, offsetHeight: b.h, offsetParent: null as any }; }

function layout(kind: 'desktop' | 'phone') {
  const D = kind === 'desktop';
  const vw = D ? 1440 : 390, vh = D ? 900 : 780;
  const els: Record<string, any> = {};
  let y = 0;
  const sect = (name: string, h: number) => { els[`[data-scene="${name}"]`] = el({ x: 0, y, w: vw, h }); const top = y; y += h; return top; };
  // heights are estimates from the markup / Tailwind classes (see comments in the report)
  sect('hero', D ? 828 : 1000);
  els['#terminal'] = el({ x: D ? 820 : 20, y: D ? 250 : 620, w: D ? 520 : 350, h: D ? 330 : 300 });
  // services
  const sTop = sect('services', D ? 1160 : 2166);
  const cardW = D ? 386 : 350, cardH = 330;
  const gridTop = sTop + (D ? 112 + 200 + 56 : 80 + 220 + 56);
  ['web', 'ai', 'trading', 'hr', 'support'].forEach((id, i) => {
    const r = D ? Math.floor(i / 3) : i, c = D ? i % 3 : 0;
    els[`[data-hub="${id}"]`] = el({ x: (D ? 120 : 20) + c * (cardW + 20), y: gridTop + r * (cardH + 20), w: cardW, h: cardH });
  });
  // process
  const pTop = sect('process', D ? 740 : 1116);
  const stTop = pTop + (D ? 112 + 200 + 56 : 80 + 200 + 56);
  for (let i = 0; i < 4; i++)
    els[`[data-stage="${i}"]`] = D ? el({ x: 120 + i * (276 + 32), y: stTop, w: 276, h: 260 }) : el({ x: 20, y: stTop + i * 182, w: 350, h: 150 });
  sect('portfolio', D ? 910 : 1616);
  sect('testimonials', D ? 780 : 1176);
  const cTop = sect('cta', D ? 804 : 716);
  const phTop = cTop + (D ? 112 : 80), ph = D ? 288 : 224;
  els['[data-logo-anchor]'] = el({ x: vw / 2 - ph / 2, y: phTop, w: ph, h: ph });
  return { els, vw, vh, pageH: y };
}

for (const kind of ['desktop', 'phone'] as const) {
  const L = layout(kind);
  (globalThis as any).window = { innerHeight: L.vh, innerWidth: L.vw };
  (globalThis as any).document = {
    querySelector: (s: string) => L.els[s] ?? null,
    getElementById: (id: string) => L.els['#' + id] ?? null,
    documentElement: { scrollHeight: L.pageH },
  };
  const j = new Journey();
  j.measure();
  const keys = (j as any).keys as any[];
  const maxScroll = L.pageH - L.vh;
  console.log(`\n==== ${kind.toUpperCase()}  viewport ${L.vw}×${L.vh}, page ${L.pageH}px, max scroll ${maxScroll}`);
  console.log('key#  scrollY  (×vh)   morph pipe recede prog logo  opacity still');
  keys.forEach((k, i) =>
    console.log(`${String(i).padStart(3)}  ${String(Math.round(k.y)).padStart(7)}  ${(k.y / L.vh).toFixed(2).padStart(5)}   ${[k.morph, k.pipe, k.recede, k.prog, k.logo].map((v) => v.toFixed(0).padStart(4)).join(' ')}   ${k.opacity.toFixed(2).padStart(6)}  ${k.still}`)
  );
  // sanity
  let ok = true;
  for (let i = 1; i < keys.length; i++) if (!(keys[i].y > keys[i - 1].y)) { ok = false; console.log('  ✗ keys not increasing at', i); }
  const end = j.sample(maxScroll, newSample());
  console.log(`  at max scroll: morph=${end.morph.toFixed(2)} pipe=${end.pipe.toFixed(2)} recede=${end.recede.toFixed(2)} logo=${end.logo.toFixed(2)} opacity=${end.opacity.toFixed(2)}  ${end.logo >= 0.999 ? '✓ finale fully formed' : '✗ FINALE NOT REACHED'}`);
  if (end.logo < 0.999) ok = false;
  // how long (in px and viewport heights) does each act stay "settled"?
  const settled = (pred: (s: any) => boolean) => {
    let from = -1, best = 0, bestFrom = 0;
    const tmp = newSample();
    for (let yy = 0; yy <= maxScroll; yy += 5) {
      const s = j.sample(yy, tmp);
      if (pred(s)) { if (from < 0) from = yy; if (yy - from > best) { best = yy - from; bestFrom = from; } } else from = -1;
    }
    return `${best}px (${(best / L.vh).toFixed(2)} vh) starting at ${bestFrom}`;
  };
  console.log('  settled spans:');
  console.log('   clusters   :', settled((s) => s.morph > 0.99 && s.pipe < 0.01));
  console.log('   pipeline   :', settled((s) => s.pipe > 0.99 && s.prog > 0.99 && s.recede < 0.01));
  console.log('   rails      :', settled((s) => s.recede > 0.99 && s.logo < 0.01));
  console.log('   still (paused render):', settled((s) => s.still));
  console.log('   finale     :', settled((s) => s.logo > 0.99));
  // when do two transitions overlap? (more than one value strictly between 0 and 1 at the same scroll)
  const tmp2 = newSample(); const overlaps: string[] = []; let cur: string | null = null; let start = 0;
  for (let yy = 0; yy <= maxScroll; yy += 5) {
    const s = j.sample(yy, tmp2);
    const active = (['morph', 'pipe', 'recede', 'prog', 'logo'] as const).filter((f) => s[f] > 0.02 && s[f] < 0.98);
    const tag = active.length > 1 ? active.join('+') : null;
    if (tag !== cur) { if (cur) overlaps.push(`${cur} @${start}-${yy}`); cur = tag; start = yy; }
  }
  console.log('  overlapping transitions:', overlaps.length ? overlaps.join(' | ') : 'none');
  if (!ok) process.exitCode = 1;
}
