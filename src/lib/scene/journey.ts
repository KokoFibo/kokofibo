/**
 * The scroll journey: a small keyframe track keyed to *document* positions of
 * the page sections, plus the screen anchors of the five service cards and the
 * four process steps.
 *
 * Why not ScrollTrigger? The engine samples `scrollY` every frame and eases
 * toward the sampled values, which gives the same inertia as `scrub`, never
 * conflicts with other scroll systems, and extends by just adding keyframes.
 *
 *  act            values driven                         canvas
 *  hero           free constellation                    100 %
 *  services       morph 0→1 (five clusters on cards)     90 %
 *  process        pipe 0→1 (gates), prog 0→1 (packet)    95 %
 *  portfolio      recede 0→1 (margin rails)              22 %
 *  testimonials   frozen, rendering paused               12 %
 *  CTA            logo 0→1 (nodes form the reactor core) 90 %
 */

/** Order matters: index = hub id used by the shaders. */
export const HUB_IDS = ['web', 'ai', 'trading', 'hr', 'support'] as const;
export const STAGE_COUNT = 4;

export interface JourneySample {
  /** 0 = hero constellation … 1 = five service clusters. */
  morph: number;
  /** 0 … 1 = clusters have become the process pipeline. */
  pipe: number;
  /** 0 … 1 = pipeline has dissolved into margin rails. */
  recede: number;
  /** 0 … 1 = how far the data packet has travelled through the pipeline. */
  prog: number;
  /** 0 … 1 = nodes have converged into the reactor core (CTA). */
  logo: number;
  /** Canvas opacity (before the CSS cap for narrow screens). */
  opacity: number;
  /** Nothing animates here: the engine may stop rendering once values have settled. */
  still: boolean;
}

export const newSample = (): JourneySample => ({ morph: 0, pipe: 0, recede: 0, prog: 0, logo: 0, opacity: 1, still: false });

interface Key extends JourneySample {
  y: number;
}

export interface Anchor {
  /** Document-space px. */
  x: number;
  y: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const NUMERIC = ['morph', 'pipe', 'recede', 'prog', 'logo', 'opacity'] as const;

/** Position of an element in the document, ignoring CSS transforms (reveal animations). */
function docPos(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const section = (name: string) => document.querySelector<HTMLElement>(`[data-scene="${name}"]`);
const SCENES = ['hero', 'services', 'process', 'portfolio', 'testimonials', 'cta'] as const;

export class Journey {
  /** Service hubs: document px. */
  readonly anchors: Anchor[] = HUB_IDS.map(() => ({ x: 0, y: 0 }));
  /** Pipeline landmarks: the four step gates + the "shipped" output. Document px. */
  readonly gates: Anchor[] = Array.from({ length: STAGE_COUNT + 1 }, () => ({ x: 0, y: 0 }));
  /** Cluster radius in CSS px. */
  clusterPx = 120;
  /** Gate ring radius (perpendicular to the flow) in CSS px. */
  gatePx = 40;
  /** Centre of the CTA placeholder, document px, and the logo box scale in px (globe radius = 0.8 of it). */
  readonly logo: Anchor = { x: 0, y: 0 };
  logoPx = 90;
  /** Left part of the hero terminal: where the data wave starts. */
  readonly terminal: Anchor = { x: 0, y: 0 };
  private hasLogo = false;
  /** Viewport height used for the keyframes (see measure()). */
  vh = 0;
  /** Measured top/bottom of each scene section, document px (debug report). */
  readonly sections: Record<string, { top: number; bottom: number }> = {};
  private keys: Key[] = [{ y: 0, ...newSample() }];

  /** (Re)read the layout. Cheap; call on resize / load / content size changes. */
  measure(): void {
    // Use the *large* viewport (the canvas is 100lvh). On phones window.innerHeight changes while the
    // browser toolbar slides in and out, which would otherwise shift every keyframe during scrolling.
    const canvas = document.getElementById('scene-canvas');
    const vh = Math.max(window.innerHeight, canvas?.clientHeight ?? 0);
    this.vh = vh;
    const keys: Key[] = [{ y: 0, ...newSample() }];
    /** Append a keyframe that repeats the previous one with `patch` applied. */
    const add = (y: number, patch: Partial<JourneySample> = {}): void => {
      const prev = keys[keys.length - 1];
      keys.push({ ...prev, ...patch, y: Math.max(y, prev.y + 1) });
    };
    const span = (el: HTMLElement) => {
      const top = docPos(el).y;
      return { top, bottom: top + el.offsetHeight };
    };

    for (const name of SCENES) {
      const el = section(name);
      if (el) {
        const sp = span(el);
        this.sections[name] = { top: Math.round(sp.top), bottom: Math.round(sp.bottom) };
      }
    }

    // ── anchors ──
    // Service hubs. Grid layouts: right on the card's top-right corner, so the hub glows half
    // outside the glass and the cluster spills into the gaps and margins. Single column
    // (phones): pulled inward so the whole cluster stays on screen.
    const phone = window.innerWidth < 640;
    const widths: number[] = [];
    HUB_IDS.forEach((id, i) => {
      const el = document.querySelector<HTMLElement>(`[data-hub="${id}"]`);
      if (!el) return;
      const p = docPos(el);
      this.anchors[i].x = p.x + el.offsetWidth - (phone ? 64 : 12);
      this.anchors[i].y = p.y + (phone ? 22 : 12);
      widths.push(el.offsetWidth);
    });
    this.clusterPx = widths.length ? clamp(Math.min(...widths) * 0.38, 90, phone ? 115 : 150) : 120;

    // Pipeline: a gate on each step's number badge; the "shipped" output past the last step.
    const stages = Array.from({ length: STAGE_COUNT }, (_, i) =>
      document.querySelector<HTMLElement>(`[data-stage="${i}"]`)
    );
    const hasPipeline = stages.every(Boolean);
    if (hasPipeline) {
      const stacked = window.innerWidth < 768; // md breakpoint: steps stack into one column
      stages.forEach((el, i) => {
        const p = docPos(el!);
        this.gates[i].x = p.x + 10;
        this.gates[i].y = p.y + 10;
      });
      const last = stages[STAGE_COUNT - 1]!;
      const pl = docPos(last);
      this.gates[STAGE_COUNT].x = stacked ? pl.x + 10 : pl.x + last.offsetWidth * 0.62;
      this.gates[STAGE_COUNT].y = pl.y + (stacked ? 110 : 10);
      this.gatePx = stacked ? 28 : clamp(stages[0]!.offsetWidth * 0.14, 38, 56);
    }

    const terminal = document.getElementById('terminal');
    if (terminal) {
      const t = docPos(terminal);
      this.terminal.x = t.x + terminal.offsetWidth * 0.25;
      this.terminal.y = t.y + terminal.offsetHeight / 2;
    }
    const logoEl = document.querySelector<HTMLElement>('[data-logo-anchor]');
    this.hasLogo = !!logoEl;
    if (logoEl) {
      const l = docPos(logoEl);
      this.logo.x = l.x + logoEl.offsetWidth / 2;
      this.logo.y = l.y + logoEl.offsetHeight / 2;
      this.logoPx = Math.min(logoEl.offsetHeight, logoEl.offsetWidth) * 0.46;
    }

    // ── keyframes ──
    const services = section('services');
    const process = section('process');
    const portfolio = section('portfolio');
    const testimonials = section('testimonials');
    const hero = section('hero');
    let lastBottom = 0;

    if (services) {
      const s = span(services);
      add(Math.max(s.top - 0.9 * vh, 0.12 * vh)); // hero holds a moment before it starts to dissolve
      add(s.top - 0.35 * vh, { morph: 1, opacity: 0.9 }); // clusters formed by the time the heading is readable
      lastBottom = s.bottom;
    } else if (hero) {
      const h = span(hero);
      add(h.bottom - 0.5 * vh);
      lastBottom = h.bottom;
    }

    if (process && hasPipeline) {
      const p = span(process);
      const g0 = this.gates[0].y;
      const gl = this.gates[STAGE_COUNT - 1].y;
      // The clusters stay until the last service cards have mostly scrolled away, but the pipeline
      // must start early enough to be formed while its first gate is still in the middle of the screen.
      const pipeStart = Math.min(services ? span(services).bottom - 0.4 * vh : g0 - 1.25 * vh, g0 - 0.8 * vh);
      const pipeDone = Math.max(pipeStart + 0.3 * vh, g0 - 0.5 * vh);
      const progDone = Math.max(pipeDone + 0.25 * vh, gl - 0.15 * vh); // packet sweeps while the steps travel up
      add(pipeStart); // clusters hold until here
      add(pipeDone, { pipe: 1, opacity: 0.95 }); // clusters release → pipeline forms
      add(progDone, { prog: 1 });
      add(progDone + 0.15 * vh); // short dwell on the completed pipeline
      const prev = keys[keys.length - 1].y;
      lastBottom = p.bottom;
      if (portfolio) {
        add(Math.max(prev + 0.25 * vh, p.bottom - 0.3 * vh), { recede: 1, opacity: 0.22 }); // → margin rails
      }
    }

    if (portfolio) {
      const pf = span(portfolio);
      add(pf.bottom - 0.75 * vh);
      lastBottom = pf.bottom;
    }

    if (testimonials) {
      const t = span(testimonials);
      // dim within ~0.35 vh instead of crawling over the whole portfolio, so the still zone is long
      add(Math.min(t.top + 0.25 * vh, keys[keys.length - 1].y + 0.35 * vh), { opacity: 0.12, still: true }); // nothing moves behind the videos
      add(t.bottom - 0.55 * vh); // hold (still)
      lastBottom = t.bottom;
    }

    if (this.hasLogo) {
      // finale: everything converges into the core as its placeholder reaches mid-screen, then holds
      const maxY = Math.max(0, document.documentElement.scrollHeight - vh);
      add(Math.min(this.logo.y - 0.5 * vh, maxY - 24), { logo: 1, opacity: 0.9, still: false });
    } else {
      add(lastBottom - 0.1 * vh, { opacity: 0, still: false });
    }

    this.keys = keys;
  }

  /** Everything measured from the real page, for the debug report (lets the timeline be re-simulated exactly). */
  describe(): unknown {
    const r = (v: number) => Math.round(v);
    const pt = (a: Anchor) => ({ x: r(a.x), y: r(a.y) });
    return {
      vh: this.vh,
      sections: this.sections,
      hubs: this.anchors.map(pt),
      gates: this.gates.map(pt),
      logo: { ...pt(this.logo), px: r(this.logoPx) },
      terminal: pt(this.terminal),
      clusterPx: r(this.clusterPx),
      gatePx: r(this.gatePx),
      keys: this.keys.map((k) => ({
        y: r(k.y),
        morph: +k.morph.toFixed(2),
        pipe: +k.pipe.toFixed(2),
        recede: +k.recede.toFixed(2),
        prog: +k.prog.toFixed(2),
        logo: +k.logo.toFixed(2),
        opacity: +k.opacity.toFixed(2),
        still: k.still,
      })),
    };
  }

  sample(scrollY: number, out: JourneySample): JourneySample {
    const k = this.keys;
    const last = k[k.length - 1];
    if (scrollY <= k[0].y) return copy(k[0], out);
    if (scrollY >= last.y) return copy(last, out);
    let i = 0;
    while (i < k.length - 2 && scrollY >= k[i + 1].y) i++;
    const a = k[i];
    const b = k[i + 1];
    const t = ease((scrollY - a.y) / (b.y - a.y));
    for (const f of NUMERIC) out[f] = a[f] + (b[f] - a[f]) * t;
    out.still = a.still && b.still;
    return out;
  }
}

function copy(k: Key, out: JourneySample): JourneySample {
  for (const f of NUMERIC) out[f] = k[f];
  out.still = k.still;
  return out;
}

/**
 * Highlights a service cluster:
 *  - mouse / keyboard: hover or focus on a card
 *  - touch: the card crossing the middle band of the screen
 * Returns an unbind function.
 */
export function bindServiceHighlight(setActive: (hub: number) => void): () => void {
  const cards = HUB_IDS.map((id) => document.querySelector<HTMLElement>(`[data-hub="${id}"]`));
  const cleanups: (() => void)[] = [];
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (fine) {
    cards.forEach((el, i) => {
      if (!el) return;
      const on = () => setActive(i);
      const off = () => setActive(-1);
      el.addEventListener('pointerenter', on);
      el.addEventListener('pointerleave', off);
      el.addEventListener('focusin', on);
      el.addEventListener('focusout', off);
      cleanups.push(() => {
        el.removeEventListener('pointerenter', on);
        el.removeEventListener('pointerleave', off);
        el.removeEventListener('focusin', on);
        el.removeEventListener('focusout', off);
      });
    });
  } else if ('IntersectionObserver' in window) {
    const inBand = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = cards.indexOf(e.target as HTMLElement);
          if (i < 0) continue;
          if (e.isIntersecting) inBand.add(i);
          else inBand.delete(i);
        }
        setActive(inBand.size ? [...inBand][inBand.size - 1] : -1);
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 }
    );
    cards.forEach((el) => el && io.observe(el));
    cleanups.push(() => io.disconnect());
  }

  return () => cleanups.forEach((fn) => fn());
}
