import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { buildGraph, mulberry32, type Graph } from './graph';
import { PulseSystem } from './pulses';
import {
  CLUSTER_PULSE_VERT,
  COLORS,
  CORE_COMET_VERT,
  CORE_GLOW_FRAG,
  CORE_GLOW_VERT,
  CORE_RING_FRAG,
  CORE_RING_VERT,
  EDGE_FRAG_CLUSTER,
  EDGE_FRAG_LOGO,
  EDGE_FRAG_NET,
  EDGE_FRAG_PIPE,
  EDGE_FRAG_RAIL,
  EDGE_VERT,
  NODE_FRAG,
  NODE_VERT,
  PIPE_PULSE_VERT,
  PULSE_FRAG,
  PULSE_VERT,
} from './shaders';

export const HUB_COUNT = 5;
/** Landmarks of the pipeline: four stages + the "shipped" output. */
export const GATE_COUNT = 5;

export interface ConstellationOptions {
  nodeCount: number;
  pulseCount: number;
  pixelRatio: number;
}

/** Scroll-driven state fed to `update` (all already eased by the engine). */
export interface SceneProgress {
  morph: number;
  pipe: number;
  recede: number;
  prog: number;
  logo: number;
}

const vec = (c: readonly number[]) => new Vector3(c[0], c[1], c[2]);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const TRAIL_SCALE = [1, 0.62, 0.42, 0.26];
const PACKET_SCALE = [1, 0.82, 0.66, 0.52, 0.4, 0.3, 0.22, 0.16];

/**
 * The "living system". The same nodes travel through five layouts as the page scrolls:
 *   hero constellation → five service clusters → process pipeline → margin rails → the reactor core.
 * Twelve small draw calls: nodes, five edge sets, three pulse sets (hero / cluster / pipeline)
 * and three for the core (orbit lines, orbit comets, central glow).
 */
export class Constellation {
  readonly group = new Group();
  readonly graph: Graph;

  /** Shared uniform objects — one write updates every material that reads them. */
  readonly u = {
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uMorph: { value: 0 },
    uPipe: { value: 0 },
    uRecede: { value: 0 },
    uPipeW: { value: 0 },
    uBurst: { value: 0 },
    uProg: { value: 0 },
    uLogo: { value: 0 },
    uLogoS: { value: 1 },
    uLogoPulse: { value: 0 },
    uCorePx: { value: 80 },
    uLogoPos: { value: new Vector3() },
    uWave: { value: -1 },
    uWaveOrigin: { value: new Vector2() },
    uPixelRatio: { value: 1 },
    uFogNear: { value: 8 },
    uFogFar: { value: 18 },
    uClusterR: { value: 1.2 },
    uGateR: { value: 0.4 },
    uHubPos: { value: Array.from({ length: HUB_COUNT }, () => new Vector3()) },
    uHubGlow: { value: new Array<number>(HUB_COUNT).fill(1) },
    uPulseClock: { value: new Array<number>(HUB_COUNT).fill(0) },
    uGate: { value: Array.from({ length: GATE_COUNT }, () => new Vector3()) },
    uStage: { value: new Array<number>(GATE_COUNT).fill(0) },
    uSegLit: { value: new Array<number>(GATE_COUNT - 1).fill(0) },
    uFlow: { value: new Vector2(1, 0) },
    uHalf: { value: new Vector2(6, 3.5) },
  };

  private readonly pulses: PulseSystem;
  private readonly disposables: { dispose(): void }[] = [];
  private active = -1;
  private burst = 0;
  private burstFired = false;
  private wave = -1;

  constructor(opts: ConstellationOptions) {
    this.u.uPixelRatio.value = opts.pixelRatio;
    const g = (this.graph = buildGraph(opts.nodeCount));
    const rnd = mulberry32(777);

    /** Per-vertex copies of every layout attribute for a list of node indices. */
    const nodeAttrs = (nodes: ArrayLike<number>, geo: BufferGeometry): void => {
      const n = nodes.length;
      const cl = new Float32Array(n * 4);
      const mo = new Float32Array(n * 3);
      const pp = new Float32Array(n * 4);
      const rl = new Float32Array(n * 3);
      const m2 = new Float32Array(n * 3);
      const lg = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) {
        const i = nodes[k];
        cl.set(g.cluster.subarray(i * 4, i * 4 + 4), k * 4);
        mo.set(g.morph.subarray(i * 3, i * 3 + 3), k * 3);
        pp.set(g.pipe.subarray(i * 4, i * 4 + 4), k * 4);
        rl.set(g.rail.subarray(i * 3, i * 3 + 3), k * 3);
        m2.set(g.morph2.subarray(i * 3, i * 3 + 3), k * 3);
        lg.set(g.logo.subarray(i * 4, i * 4 + 4), k * 4);
      }
      geo.setAttribute('aCluster', new BufferAttribute(cl, 4));
      geo.setAttribute('aMorph', new BufferAttribute(mo, 3));
      geo.setAttribute('aPipe', new BufferAttribute(pp, 4));
      geo.setAttribute('aRail', new BufferAttribute(rl, 3));
      geo.setAttribute('aMorph2', new BufferAttribute(m2, 3));
      geo.setAttribute('aLogo', new BufferAttribute(lg, 4));
    };
    const freePositions = (nodes: ArrayLike<number>): Float32Array => {
      const out = new Float32Array(nodes.length * 3);
      for (let k = 0; k < nodes.length; k++) out.set(g.positions.subarray(nodes[k] * 3, nodes[k] * 3 + 3), k * 3);
      return out;
    };
    const additive = (extra: ConstructorParameters<typeof ShaderMaterial>[0]) =>
      new ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, ...extra });

    /** One LineSegments for a list of node pairs. `hero` adds the intro draw-in delay. */
    const edgeSet = (pairs: ArrayLike<number>, frag: string, alpha: number, hero = false): void => {
      const m = pairs.length / 2;
      const aT = new Float32Array(m * 2);
      const aDelay = new Float32Array(m * 2);
      const aShade = new Float32Array(m * 2);
      for (let e = 0; e < m; e++) {
        aT[e * 2 + 1] = 1;
        aDelay[e * 2] = aDelay[e * 2 + 1] = hero ? g.edgeDelay[e] : 0;
        aShade[e * 2] = aShade[e * 2 + 1] = hero ? g.edgeShade[e] : 0.55 + rnd() * 0.45;
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(freePositions(pairs), 3));
      geo.setAttribute('aT', new BufferAttribute(aT, 1));
      geo.setAttribute('aDelay', new BufferAttribute(aDelay, 1));
      geo.setAttribute('aShade', new BufferAttribute(aShade, 1));
      nodeAttrs(pairs, geo);
      const mat = additive({
        vertexShader: EDGE_VERT,
        fragmentShader: frag,
        uniforms: {
          ...this.u,
          uColor: { value: vec(COLORS.signal) },
          uPaper: { value: vec(COLORS.paper) },
          uLight: { value: vec(COLORS.light) },
          uAlpha: { value: alpha },
        },
      });
      const lines = new LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 1;
      this.group.add(lines);
      this.disposables.push(geo, mat);
    };

    // ── four edge sets, one per layout ──
    edgeSet(g.edges, EDGE_FRAG_NET, 0.36, true);
    edgeSet(concat(g.spokes, g.rings), EDGE_FRAG_CLUSTER, 0.5);
    edgeSet(g.pipeEdges, EDGE_FRAG_PIPE, 0.55);
    edgeSet(g.rails, EDGE_FRAG_RAIL, 0.45);
    edgeSet(g.logoEdges, EDGE_FRAG_LOGO, 0.7);

    // ── nodes ──
    {
      const n = g.count;
      const aSize = new Float32Array(n);
      const aMix = new Float32Array(n);
      const aPhase = new Float32Array(n);
      const hubSet = new Set(g.hubs);
      for (let i = 0; i < n; i++) {
        const hub = hubSet.has(i);
        aSize[i] = hub ? 30 + rnd() * 4 : 12 + rnd() * 6;
        aMix[i] = hub ? 1 : rnd() < 0.28 ? 0.45 : 0;
        aPhase[i] = rnd() * Math.PI * 2;
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(g.positions, 3));
      geo.setAttribute('aSize', new BufferAttribute(aSize, 1));
      geo.setAttribute('aMix', new BufferAttribute(aMix, 1));
      geo.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
      geo.setAttribute('aDelay', new BufferAttribute(g.nodeDelay, 1));
      nodeAttrs(Array.from({ length: n }, (_, i) => i), geo);
      const mat = additive({
        vertexShader: NODE_VERT,
        fragmentShader: NODE_FRAG,
        uniforms: {
          ...this.u,
          uColorA: { value: vec(COLORS.signal) },
          uColorB: { value: vec(COLORS.light) },
          uPaper: { value: vec(COLORS.paper) },
        },
      });
      const pts = new Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 2;
      this.group.add(pts);
      this.disposables.push(geo, mat);
    }

    const pulseMaterial = (vertexShader: string) =>
      additive({
        vertexShader,
        fragmentShader: PULSE_FRAG,
        uniforms: { ...this.u, uColorA: { value: vec(COLORS.light) }, uPaper: { value: vec(COLORS.paper) } },
      });

    // ── hero pulses (CPU, hop along the web) ──
    {
      this.pulses = new PulseSystem(g, opts.pulseCount);
      const mat = pulseMaterial(PULSE_VERT);
      const pts = new Points(this.pulses.geometry, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 3;
      this.group.add(pts);
      this.disposables.push(this.pulses, mat);
    }

    // ── cluster pulses (GPU, run along spokes) ──
    {
      const perHub = Math.max(1, Math.round(opts.pulseCount / 6));
      const picked: number[] = [];
      const meta: number[] = []; // speed, phase, dir per pulse
      for (let hi = 0; hi < HUB_COUNT; hi++) {
        const pool = [...(g.members[hi] ?? [])];
        for (let k = 0; k < perHub && pool.length; k++) {
          const node = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
          picked.push(node);
          meta.push(0.8 + rnd() * 0.6, rnd(), k % 2 === 0 ? 1 : -1);
        }
      }
      const TRAIL = TRAIL_SCALE.length;
      const total = picked.length * TRAIL;
      const nodes = new Uint32Array(total);
      const aPulse = new Float32Array(total * 3);
      const aScale = new Float32Array(total);
      const aTrail = new Float32Array(total);
      picked.forEach((node, p) => {
        for (let k = 0; k < TRAIL; k++) {
          const v = p * TRAIL + k;
          nodes[v] = node;
          aPulse.set(meta.slice(p * 3, p * 3 + 3), v * 3);
          aScale[v] = TRAIL_SCALE[k];
          aTrail[v] = k;
        }
      });
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3)); // unused, sets draw count
      geo.setAttribute('aPulse', new BufferAttribute(aPulse, 3));
      geo.setAttribute('aScale', new BufferAttribute(aScale, 1));
      geo.setAttribute('aTrail', new BufferAttribute(aTrail, 1));
      nodeAttrs(nodes, geo);
      const mat = pulseMaterial(CLUSTER_PULSE_VERT);
      const pts = new Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 3;
      this.group.add(pts);
      this.disposables.push(geo, mat);
    }

    // ── pipeline packets: one scroll-driven comet + ambient flow ──
    {
      const ambient = Math.max(3, Math.round(opts.pulseCount * 0.6));
      const total = PACKET_SCALE.length + ambient * TRAIL_SCALE.length;
      const aPP = new Float32Array(total * 3);
      const aScale = new Float32Array(total);
      let v = 0;
      PACKET_SCALE.forEach((sc, k) => {
        aPP.set([0, 0, k], v * 3);
        aScale[v++] = sc;
      });
      for (let a = 0; a < ambient; a++) {
        const seed = (a + rnd() * 0.6) / ambient;
        TRAIL_SCALE.forEach((sc, k) => {
          aPP.set([1, seed, k], v * 3);
          aScale[v++] = sc;
        });
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3)); // unused, sets draw count
      geo.setAttribute('aPP', new BufferAttribute(aPP, 3));
      geo.setAttribute('aScale', new BufferAttribute(aScale, 1));
      const mat = pulseMaterial(PIPE_PULSE_VERT);
      const pts = new Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 4;
      this.group.add(pts);
      this.disposables.push(geo, mat);
    }

    // ── core finale: orbit lines, comets circling them, and the glow at the heart ──
    {
      const RINGS = 3;
      const SEG = 96;
      // thin orbit lines (position of each vertex comes from the shared ringPoint() in the shader)
      const aRingA = new Float32Array(RINGS * SEG * 2 * 2);
      let v = 0;
      for (let ri = 0; ri < RINGS; ri++) {
        for (let k = 0; k < SEG; k++) {
          for (let end = 0; end < 2; end++) aRingA.set([ri, ((k + end) / SEG) * Math.PI * 2], v++ * 2);
        }
      }
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(RINGS * SEG * 2 * 3), 3)); // unused, sets draw count
      lineGeo.setAttribute('aRingA', new BufferAttribute(aRingA, 2));
      const lineMat = additive({
        vertexShader: CORE_RING_VERT,
        fragmentShader: CORE_RING_FRAG,
        uniforms: { ...this.u, uColor: { value: vec(COLORS.light) }, uAlpha: { value: 0.22 } },
      });
      const lines = new LineSegments(lineGeo, lineMat);
      lines.frustumCulled = false;
      lines.renderOrder = 1;
      this.group.add(lines);
      this.disposables.push(lineGeo, lineMat);

      // comets: head + trail, evenly spread over each ring
      const perRing = opts.pulseCount >= 10 ? 2 : 1;
      const TRAIL = 9;
      const COMET_SCALE = [1, 0.82, 0.66, 0.52, 0.4, 0.3, 0.22, 0.16, 0.1];
      const total = RINGS * perRing * TRAIL;
      const aCom = new Float32Array(total * 3);
      const aScale = new Float32Array(total);
      let c = 0;
      for (let ri = 0; ri < RINGS; ri++) {
        for (let k = 0; k < perRing; k++) {
          const phase = (k + ri / RINGS) / perRing;
          for (let t = 0; t < TRAIL; t++) {
            aCom.set([ri, phase, t], c * 3);
            aScale[c++] = COMET_SCALE[t];
          }
        }
      }
      const cometGeo = new BufferGeometry();
      cometGeo.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3)); // unused, sets draw count
      cometGeo.setAttribute('aCom', new BufferAttribute(aCom, 3));
      cometGeo.setAttribute('aScale', new BufferAttribute(aScale, 1));
      const cometMat = pulseMaterial(CORE_COMET_VERT);
      const comets = new Points(cometGeo, cometMat);
      comets.frustumCulled = false;
      comets.renderOrder = 4;
      this.group.add(comets);
      this.disposables.push(cometGeo, cometMat);

      // glow: orange haze → light-orange body → white-hot heart
      const aK = new Float32Array([0.82, 0, 0.55, 0.4, 1, 0.95, 0.17, 2, 1.0]);
      const glowGeo = new BufferGeometry();
      glowGeo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
      glowGeo.setAttribute('aK', new BufferAttribute(aK, 3));
      const glowMat = additive({
        vertexShader: CORE_GLOW_VERT,
        fragmentShader: CORE_GLOW_FRAG,
        uniforms: {
          ...this.u,
          uColorA: { value: vec(COLORS.signal) },
          uColorB: { value: vec(COLORS.light) },
          uPaper: { value: vec(COLORS.paper) },
        },
      });
      const glow = new Points(glowGeo, glowMat);
      glow.frustumCulled = false;
      glow.renderOrder = 5;
      this.group.add(glow);
      this.disposables.push(glowGeo, glowMat);
    }
  }

  setPixelRatio(r: number): void {
    this.u.uPixelRatio.value = r;
  }

  /** Index (0..4) of the highlighted service, or -1 for none. */
  setActiveHub(i: number): void {
    this.active = i >= 0 && i < HUB_COUNT ? i : -1;
  }

  /** World-space anchor of each hub (screen-anchored to its card) and cluster radius. */
  setHubLayout(anchors: ArrayLike<{ x: number; y: number }>, radiusWorld: number, z = 0): void {
    for (let i = 0; i < HUB_COUNT; i++) this.u.uHubPos.value[i].set(anchors[i].x, anchors[i].y, z);
    this.u.uClusterR.value = radiusWorld;
  }

  /** World-space landmarks of the pipeline, its flow direction, gate radius and the view's half extents. */
  setPipelineLayout(
    gates: ArrayLike<{ x: number; y: number }>,
    flow: { x: number; y: number },
    gateRadiusWorld: number,
    halfW: number,
    halfH: number
  ): void {
    for (let i = 0; i < GATE_COUNT; i++) this.u.uGate.value[i].set(gates[i].x, gates[i].y, 0);
    this.u.uFlow.value.set(flow.x, flow.y);
    this.u.uGateR.value = gateRadiusWorld;
    this.u.uHalf.value.set(halfW, halfH);
  }

  /**
   * World-space centre and size of the core finale. `unitWorld` is the logo box size in world units
   * (the globe's radius is 0.8 of it); `corePx` is the globe radius in CSS px (sizes the central glow).
   */
  setLogoLayout(x: number, y: number, unitWorld: number, corePx: number): void {
    this.u.uLogoPos.value.set(x, y, 0);
    this.u.uLogoS.value = unitWorld;
    this.u.uCorePx.value = corePx;
  }

  /** 0..1 heartbeat of the core (CTA button hover / tap). */
  setLogoPulse(v: number): void {
    this.u.uLogoPulse.value = v;
  }

  /** Where the terminal → network wave starts (world xy). */
  setWaveOrigin(x: number, y: number): void {
    this.u.uWaveOrigin.value.set(x, y);
  }

  /** Send a light wave through the hero network. */
  triggerWave(): void {
    this.wave = 0;
  }

  update(time: number, dt: number, cameraZ: number, s: SceneProgress): void {
    const u = this.u;
    u.uTime.value = time;
    u.uMorph.value = s.morph;
    u.uPipe.value = s.pipe;
    u.uRecede.value = s.recede;
    u.uProg.value = s.prog;
    u.uLogo.value = s.logo;
    if (this.wave >= 0) {
      this.wave += dt / 1.9;
      if (this.wave > 1) this.wave = -1;
    }
    u.uWave.value = this.wave;
    u.uFogNear.value = cameraZ - 1;
    u.uFogFar.value = cameraZ + 9;

    // Pipeline visuals: weight, per-stage "reached" state, and the delivery flash.
    u.uPipeW.value = smooth(0.3, 0.9, s.pipe) * (1 - smooth(0.1, 0.6, s.recede));
    const p4 = s.prog * 4;
    for (let i = 0; i < GATE_COUNT; i++) u.uStage.value[i] = smooth(i - 0.35, i + 0.05, p4);
    for (let i = 0; i < GATE_COUNT - 1; i++) u.uSegLit.value[i] = clamp01(p4 - i);
    if (s.prog > 0.97 && !this.burstFired) {
      this.burstFired = true;
      this.burst = 1;
    } else if (s.prog < 0.9) {
      this.burstFired = false;
    }
    this.burst *= Math.exp(-dt * 2.2);
    u.uBurst.value = this.burst;

    // Cluster glow per hub: everything lit in the hero; while the clusters are on show the
    // hovered service shines and the others dim back.
    const k = 1 - Math.exp(-dt * 7);
    const m = smooth(0.5, 1, s.morph) * (1 - s.pipe);
    for (let h = 0; h < HUB_COUNT; h++) {
      const rest = this.active < 0 ? 0.65 : h === this.active ? 1 : 0.22;
      const target = 1 + (rest - 1) * m;
      const glow = u.uHubGlow.value[h];
      u.uHubGlow.value[h] = glow + (target - glow) * k;
      u.uPulseClock.value[h] += dt * (0.3 + 0.6 * u.uHubGlow.value[h]);
    }

    if (u.uIntro.value > 0.85 && s.morph < 0.3) this.pulses.update(dt);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

function concat(a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Uint32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
