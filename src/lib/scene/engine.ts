import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { gsap } from 'gsap';
import type { Capability } from './capability';
import { Constellation, GATE_COUNT, HUB_COUNT } from './constellation';
import { newSample, type Journey, type JourneySample } from './journey';

export interface SceneOptions {
  /** First frame rendered (or context restored) → safe to reveal the canvas. */
  onReady?: () => void;
  /** 3D can't / shouldn't run → show the SVG fallback again. */
  onFallback?: (reason: string) => void;
}

/** Live numbers for the debug HUD (?scene=debug). */
export interface SceneStats {
  tier: string;
  dpr: number;
  canvas: [number, number];
  running: boolean;
  paused: boolean;
  lost: boolean;
  /** Smoothed frames per second while rendering. */
  fps: number;
  /** Slowest recent frame in ms, and how many rendered frames took > 1.5× the target. */
  frameMsMax: number;
  slowFrames: number;
  frames: number;
  drawCalls: number;
  points: number;
  lines: number;
  gpu: string;
  state: JourneySample;
  target: JourneySample;
  scrollY: number;
}

export interface SceneController {
  /** Snapshot for the debug HUD. */
  stats(): SceneStats;
  /** Highlight one service cluster (0..4) or none (-1). */
  setActiveHub(i: number): void;
  /** The CTA button is hovered/focused: the core beats like a heart. */
  setLogoActive(active: boolean): void;
  /** One-off beat of the core (tap on touch screens). */
  kickLogo(): void;
  /** Stop/resume rendering (e.g. while a video modal is open). The last frame stays on screen. */
  setPaused(paused: boolean): void;
  /** Layout changed (anchors re-measured): redraw even if the scene is otherwise still. */
  invalidate(): void;
  destroy(): void;
}

const FOV = 45;
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
const CAM_Z = 9;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createScene(
  canvas: HTMLCanvasElement,
  cap: Capability,
  journey: Journey,
  opts: SceneOptions = {}
): SceneController {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: cap.tier === 'full',
    depth: false,
    stencil: false,
    powerPreference: 'default',
  });
  renderer.setClearColor(0x000000, 0);

  let dpr = Math.min(window.devicePixelRatio || 1, cap.maxDpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  const constellation = new Constellation({ nodeCount: cap.nodeCount, pulseCount: cap.pulseCount, pixelRatio: dpr });
  scene.add(constellation.group);

  // ───────── scroll-driven state (eased toward what the journey says) ─────────
  const target = newSample();
  const state = newSample();
  const readTarget = (): void => {
    journey.sample(window.scrollY, target);
  };
  readTarget();
  Object.assign(state, target); // snap: a reload mid-page must not replay the transitions
  const converged = (): boolean =>
    Math.abs(state.morph - target.morph) < 0.002 &&
    Math.abs(state.pipe - target.pipe) < 0.002 &&
    Math.abs(state.recede - target.recede) < 0.002 &&
    Math.abs(state.prog - target.prog) < 0.002 &&
    Math.abs(state.logo - target.logo) < 0.002 &&
    Math.abs(state.opacity - target.opacity) < 0.002;

  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  const hubWorld = Array.from({ length: HUB_COUNT }, () => ({ x: 0, y: 0 }));
  const gateWorld = Array.from({ length: GATE_COUNT }, () => ({ x: 0, y: 0 }));
  const flow = { x: 1, y: 0 };
  const logo = { hover: 0, wantHover: false, kick: 0 };

  // ───────── sizing ─────────
  let lastW = 0;
  let lastH = 0;
  /** Apply the canvas size to renderer + camera + layout. Returns true if anything changed. */
  const applySize = (): boolean => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return false;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // Free constellation: keep the text side (left) calm on wide screens; centre + shrink on narrow ones.
    const desktop = camera.aspect > 1.15;
    const s = Math.min(1, Math.max(0.42, camera.aspect / 1.7));
    const [cx, cy] = constellation.graph.centroid;
    constellation.group.scale.setScalar(s);
    if (desktop) constellation.group.position.set(1.7, 0, 0);
    else constellation.group.position.set(-cx * s, -cy * s + 0.4, 0); // centre the cloud
    return true;
  };
  let resizeRaf = 0;
  const onResize = (): void => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (applySize()) {
        forceFrames = 3; // redraw even if the scene is "still"
        sync();
      }
    });
  };
  window.addEventListener('resize', onResize, { passive: true });
  applySize();

  const onPointer = (e: PointerEvent): void => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (cap.pointer) window.addEventListener('pointermove', onPointer, { passive: true });

  // ───────── adaptive quality ─────────
  let level = 0;
  let warm = 30; // frames to ignore (shader compile, intro start)
  let samples = 0;
  let sum = 0;
  let goodWindows = 0;
  const monitor = (rawMs: number): void => {
    if (goodWindows >= 3 || rawMs > 250) return; // settled, or tab just resumed
    if (warm > 0) {
      warm--;
      return;
    }
    sum += rawMs;
    if (++samples < 90) return;
    const avg = sum / samples;
    sum = samples = 0;
    if (avg > (1000 / cap.fpsCap) * 1.45) {
      level++;
      if (level === 1 && dpr > 1) {
        dpr = 1;
        renderer.setPixelRatio(1);
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        constellation.setPixelRatio(1);
        warm = 20;
      } else {
        fail('slow-device');
      }
    } else {
      goodWindows++;
    }
  };

  // ───────── loop ─────────
  let raf = 0;
  let running = false;
  let destroyed = false;
  let lost = false;
  let revealed = false;
  let last = 0;
  let time = 0;
  let introStarted = false;
  let paused = false;
  let forceFrames = 0;
  const minInterval = 1000 / cap.fpsCap - 2;
  const perf = { ema: 1000 / cap.fpsCap, max: 0, slow: 0, frames: 0 };

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const raw = now - last;
    if (cap.fpsCap < 60 && raw < minInterval) return;
    last = now;
    const dt = Math.min(raw / 1000, 0.1);
    time += dt;
    perf.frames++;
    if (raw < 250) {
      perf.ema += (raw - perf.ema) * 0.05;
      perf.max = Math.max(perf.max, raw);
      if (raw > (1000 / cap.fpsCap) * 1.5) perf.slow++;
    }

    // ease scroll-driven values + pointer
    readTarget();
    const ks = 1 - Math.exp(-dt * 6);
    state.morph += (target.morph - state.morph) * ks;
    state.pipe += (target.pipe - state.pipe) * ks;
    state.recede += (target.recede - state.recede) * ks;
    state.prog += (target.prog - state.prog) * (1 - Math.exp(-dt * 8)); // packet follows the scroll a bit tighter
    state.logo += (target.logo - state.logo) * ks;
    state.opacity += (target.opacity - state.opacity) * ks;
    state.still = target.still;
    const kp = 1 - Math.exp(-dt * 3);
    pointer.x += (pointer.tx - pointer.x) * kp;
    pointer.y += (pointer.ty - pointer.y) * kp;
    canvas.style.opacity = String(clamp01(state.opacity));

    // Camera only translates (never rotates) so screen-anchored hubs stay exact.
    const par = 1 - 0.6 * state.morph;
    const z = CAM_Z - 0.6 * state.morph;
    camera.position.set(pointer.x * 0.55 * par, -pointer.y * 0.35 * par, z);
    constellation.group.rotation.y = Math.sin(time * 0.07) * 0.28 + pointer.x * 0.08;
    constellation.group.rotation.x = Math.sin(time * 0.05 + 1.3) * 0.06;

    // Hub anchors: document px → world units on the z = 0 plane, through the *current* camera.
    const W = canvas.clientWidth || 1;
    const H = canvas.clientHeight || 1;
    const wpp = (2 * TAN_HALF * z) / H; // world units per CSS px
    const sx = window.scrollX;
    const sy = window.scrollY;
    for (let i = 0; i < HUB_COUNT; i++) {
      const a = journey.anchors[i];
      hubWorld[i].x = camera.position.x + (a.x - sx - W / 2) * wpp;
      hubWorld[i].y = camera.position.y + (H / 2 - (a.y - sy)) * wpp;
    }
    constellation.setHubLayout(hubWorld, journey.clusterPx * wpp);

    // Pipeline landmarks go through the same document → world mapping; the flow direction
    // follows whatever the layout is (horizontal on desktop, vertical in a single column).
    for (let i = 0; i < GATE_COUNT; i++) {
      const a = journey.gates[i];
      gateWorld[i].x = camera.position.x + (a.x - sx - W / 2) * wpp;
      gateWorld[i].y = camera.position.y + (H / 2 - (a.y - sy)) * wpp;
    }
    const fx = gateWorld[GATE_COUNT - 2].x - gateWorld[0].x;
    const fy = gateWorld[GATE_COUNT - 2].y - gateWorld[0].y;
    const fl = Math.hypot(fx, fy);
    if (fl > 1e-4) {
      flow.x = fx / fl;
      flow.y = fy / fl;
    }
    constellation.setPipelineLayout(gateWorld, flow, journey.gatePx * wpp, (W / 2) * wpp, (H / 2) * wpp);

    // CTA finale: core position/size through the same document → world mapping, plus its heartbeat.
    constellation.setLogoLayout(
      camera.position.x + (journey.logo.x - sx - W / 2) * wpp,
      camera.position.y + (H / 2 - (journey.logo.y - sy)) * wpp,
      journey.logoPx * wpp,
      journey.logoPx * 0.8
    );
    logo.hover += ((logo.wantHover ? 1 : 0) - logo.hover) * (1 - Math.exp(-dt * 6));
    logo.kick *= Math.exp(-dt * 3);
    constellation.setLogoPulse(Math.max(logo.kick, logo.hover * (0.5 + 0.5 * Math.sin(time * 5.5))));

    // Hero: the origin of the terminal → network wave.
    constellation.setWaveOrigin(
      camera.position.x + (journey.terminal.x - sx - W / 2) * wpp,
      camera.position.y + (H / 2 - (journey.terminal.y - sy)) * wpp
    );
    constellation.update(time, dt, z, state);

    renderer.render(scene, camera);

    if (!introStarted) {
      introStarted = true;
      gsap.to(constellation.u.uIntro, { value: 1, duration: 2.6, ease: 'power2.out', delay: 0.2 });
    }
    if (!revealed) {
      revealed = true;
      opts.onReady?.();
    }
    monitor(raw);

    // Nothing visible, or nothing moving (testimonials): stop burning GPU until scroll changes things.
    if (forceFrames > 0) forceFrames--;
    else if (idle()) stop();
  };

  /** True when there is nothing worth rendering right now. */
  const idle = (): boolean =>
    (state.opacity < 0.005 && target.opacity < 0.005) || (target.still && converged());

  const start = (): void => {
    if (running || destroyed) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const sync = (): void => {
    if (!document.hidden && !lost && !destroyed && !paused && (forceFrames > 0 || !idle())) start();
    else stop();
  };
  const onScroll = (): void => {
    readTarget();
    sync();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  // The hero terminal announces each "✓" line (and its idle heartbeat) with this event.
  const onPulse = (): void => {
    if (running && state.morph < 0.3 && state.opacity > 0.2) constellation.triggerWave();
  };
  window.addEventListener('kf:pulse', onPulse);
  document.addEventListener('visibilitychange', sync);

  // ───────── WebGL context loss (common on iOS Safari) ─────────
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    sync();
    opts.onFallback?.('context-lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    applySize();
    forceFrames = 3;
    sync();
    opts.onReady?.();
  });

  function fail(reason: string): void {
    destroy();
    opts.onFallback?.(reason);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('kf:pulse', onPulse);
    document.removeEventListener('visibilitychange', sync);
    gsap.killTweensOf(constellation.u.uIntro);
    constellation.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  sync();

  return {
    stats(): SceneStats {
      let gpu = '';
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      } catch {
        gpu = 'unknown';
      }
      const info = renderer.info.render;
      return {
        tier: cap.tier,
        dpr,
        canvas: [lastW, lastH],
        running,
        paused,
        lost,
        fps: 1000 / perf.ema,
        frameMsMax: perf.max,
        slowFrames: perf.slow,
        frames: perf.frames,
        drawCalls: info.calls,
        points: info.points,
        lines: info.lines,
        gpu,
        state: { ...state },
        target: { ...target },
        scrollY: window.scrollY,
      };
    },
    setActiveHub(i: number) {
      constellation.setActiveHub(i);
    },
    setLogoActive(active: boolean) {
      logo.wantHover = active;
      forceFrames = 2;
      sync();
    },
    kickLogo() {
      logo.kick = 1;
      forceFrames = 2;
      sync();
    },
    setPaused(p: boolean) {
      paused = p;
      if (!p) forceFrames = 2;
      sync();
    },
    invalidate() {
      forceFrames = 3;
      sync();
    },
    destroy,
  };
}

