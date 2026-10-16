/**
 * Deterministic "network" layout: nodes, edges and per-element intro timing.
 * Pure data — no three.js here, so later milestones can add more target
 * layouts (clusters, pipeline, logo) next to `positions` without touching rendering.
 */

export interface Graph {
  count: number;
  /** xyz per node (local space of the constellation group). */
  positions: Float32Array;
  /** Edge endpoints (a, b) per edge; `a` is the end nearer the intro origin. */
  edges: Uint32Array;
  edgeCount: number;
  edgeLen: Float32Array;
  /** 0..~0.6 — when each edge starts drawing during the intro. */
  edgeDelay: Float32Array;
  edgeShade: Float32Array;
  /** 0..~0.5 — when each node fades in during the intro. */
  nodeDelay: Float32Array;
  /** node index → list of incident edge indices. */
  adjacency: number[][];
  /** Five widely spread nodes — future hubs for the five services. */
  hubs: number[];
  origin: number;
  /** Mean x/y of all nodes — used to centre the layout on narrow screens. */
  centroid: [number, number];

  // ── "service clusters" layout (home page, scroll-driven morph) ──
  /** Per node ×4: angle, radius 0..1, z-jitter, hub id 0..4. */
  cluster: Float32Array;
  /** Per node ×3: morph delay 0..0.4, arc lift, orbit speed (rad/s). */
  morph: Float32Array;
  /** Edge pairs (hubNode, member): a subset of members are wired straight to their hub. */
  spokes: Uint32Array;
  /** Edge pairs linking neighbours around each cluster ring. */
  rings: Uint32Array;
  /** hub id → member node indices, ordered by ring angle. */
  members: number[][];

  // ── "process pipeline" layout ──
  /** Per node ×4: kind (0 ring, 1 conduit, 2 dust, 3 gate centre), gate/segment index, param, seed. */
  pipe: Float32Array;
  /** Edge pairs of the pipeline: gate rings, a few wheel spokes and the conduit wires. */
  pipeEdges: Uint32Array;

  // ── "margin rails" layout (portfolio / testimonials backdrop) ──
  /** Per node ×3: side (-1/+1), height -1..1, jitter 0..1. */
  rail: Float32Array;
  /** Edge pairs linking neighbours along each rail. */
  rails: Uint32Array;

  /** Per node ×3: pipeline delay, rail delay, arc lift (stagger for the two later morphs). */
  morph2: Float32Array;

  // ── CTA finale: the "reactor core" ──
  /**
   * Per node ×4: globe node = (longitude, height -1..1) | ring bead = (angle, jitter) | halo = (angle, radius),
   * part (0 globe, 1..3 orbit ring, 4 halo), delay 0..0.4.
   */
  logo: Float32Array;
  /** Edge pairs of the globe's wireframe. */
  logoEdges: Uint32Array;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const X0 = -8, X1 = 8;
const Y0 = -4.4, Y1 = 4.4;
const Z0 = -5, Z1 = 2.5;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Where nodes are welcome: denser to the right/top, sparse on the left (text side). */
function density(x: number, y: number): number {
  return (0.18 + 0.82 * smooth(-5, 2.5, x)) * (0.65 + 0.35 * smooth(-3, 3, y));
}

export function buildGraph(count: number, seed = 20261013): Graph {
  const rnd = mulberry32(seed);

  // 1) Nodes — best-candidate sampling gives an even, non-clumpy spread.
  const pts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    let best: [number, number, number] = [0, 0, 0];
    let bestScore = -1;
    for (let c = 0; c < 14; c++) {
      const x = X0 + rnd() * (X1 - X0);
      const y = Y0 + rnd() * (Y1 - Y0);
      const z = Z0 + rnd() * (Z1 - Z0);
      let dmin = 4;
      for (const p of pts) {
        const d = Math.hypot(x - p[0], y - p[1], z - p[2]);
        if (d < dmin) dmin = d;
      }
      const score = Math.min(dmin, 2.2) * density(x, y);
      if (score > bestScore) {
        bestScore = score;
        best = [x, y, z];
      }
    }
    pts.push(best);
  }

  const positions = new Float32Array(count * 3);
  pts.forEach((p, i) => positions.set(p, i * 3));

  // 2) Intro origin: node closest to the visual centre of the dense area.
  let origin = 0;
  let od = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - 2.8, p[1] - 0.8, p[2]);
    if (d < od) {
      od = d;
      origin = i;
    }
  });
  const originDist = pts.map((p) => Math.hypot(p[0] - pts[origin][0], p[1] - pts[origin][1], p[2] - pts[origin][2]));
  const maxOD = Math.max(...originDist, 1);

  // 3) Edges — each node links to its 2–3 nearest neighbours (deduped).
  const maxLen = 3.4 * Math.sqrt(140 / count);
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const ds: [number, number][] = [];
    for (let j = 0; j < count; j++) {
      if (j !== i) ds.push([j, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2])]);
    }
    ds.sort((p, q) => p[1] - q[1]);
    const k = 2 + (rnd() < 0.45 ? 1 : 0);
    for (let n = 0; n < k && n < ds.length; n++) {
      const [j, d] = ds[n];
      if (d > maxLen * 1.8 || (n > 0 && d > maxLen)) break;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = a * count + b;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }

  const edgeCount = pairs.length;
  const edges = new Uint32Array(edgeCount * 2);
  const edgeLen = new Float32Array(edgeCount);
  const edgeDelay = new Float32Array(edgeCount);
  const edgeShade = new Float32Array(edgeCount);
  const adjacency: number[][] = Array.from({ length: count }, () => []);

  pairs.forEach(([p, q], e) => {
    // Orient so the intro "grows" outward from the origin.
    const [a, b] = originDist[p] <= originDist[q] ? [p, q] : [q, p];
    edges[e * 2] = a;
    edges[e * 2 + 1] = b;
    edgeLen[e] = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2]);
    edgeDelay[e] = (originDist[a] / maxOD) * 0.55 + rnd() * 0.06;
    edgeShade[e] = 0.55 + rnd() * 0.45;
    adjacency[a].push(e);
    adjacency[b].push(e);
  });

  const nodeDelay = new Float32Array(count);
  for (let i = 0; i < count; i++) nodeDelay[i] = (originDist[i] / maxOD) * 0.5;

  // 4) Hubs — farthest-point sampling among nodes that sit on the visible side.
  const candidates = pts.map((p, i) => i).filter((i) => pts[i][0] > -3.5);
  const hubs: number[] = [origin];
  while (hubs.length < Math.min(5, candidates.length)) {
    let pick = -1;
    let pickD = -1;
    for (const i of candidates) {
      if (hubs.includes(i)) continue;
      let dmin = Infinity;
      for (const h of hubs) {
        dmin = Math.min(dmin, Math.hypot(pts[i][0] - pts[h][0], pts[i][1] - pts[h][1], pts[i][2] - pts[h][2]));
      }
      if (dmin > pickD) {
        pickD = dmin;
        pick = i;
      }
    }
    if (pick < 0) break;
    hubs.push(pick);
  }

  // 5) Service clusters — balanced, nearest-hub assignment (capacity-limited).
  const hubCount = hubs.length;
  const hubOf = new Int8Array(count).fill(-1);
  hubs.forEach((h, i) => (hubOf[h] = i));
  const memberNodes: number[] = [];
  for (let i = 0; i < count; i++) if (hubOf[i] < 0) memberNodes.push(i);
  const capacity = Math.ceil(memberNodes.length / hubCount);
  const load = new Array<number>(hubCount).fill(0);
  const owner = new Int8Array(count).fill(-1);
  const cand: [number, number, number][] = [];
  for (const i of memberNodes) {
    for (let hi = 0; hi < hubCount; hi++) {
      const h = hubs[hi];
      cand.push([Math.hypot(pts[i][0] - pts[h][0], pts[i][1] - pts[h][1], pts[i][2] - pts[h][2]), i, hi]);
    }
  }
  cand.sort((p, q) => p[0] - q[0]);
  for (const [, i, hi] of cand) {
    if (owner[i] >= 0 || load[hi] >= capacity) continue;
    owner[i] = hi;
    load[hi]++;
  }

  const cluster = new Float32Array(count * 4);
  const morph = new Float32Array(count * 3);
  const members: number[][] = Array.from({ length: hubCount }, () => []);
  const spokePairs: number[] = [];
  const ringPairs: number[] = [];

  for (let hi = 0; hi < hubCount; hi++) {
    const hubNode = hubs[hi];
    cluster.set([0, 0, 0, hi], hubNode * 4); // hub sits at the anchor itself
    morph.set([0, 0, 0], hubNode * 3);

    const mine = memberNodes.filter((i) => owner[i] === hi);
    // Keep each node's angular order close to where it comes from → fewer crossings during the flight.
    const ang = (i: number) => Math.atan2(pts[i][1] - pts[hubNode][1], pts[i][0] - pts[hubNode][0]);
    mine.sort((a, b) => ang(a) - ang(b));
    const m = mine.length;
    mine.forEach((i, j) => {
      const theta = ((j + rnd() * 0.5) / m) * Math.PI * 2;
      const rho = 0.3 + 0.7 * Math.sqrt(rnd());
      cluster.set([theta, rho, (rnd() - 0.5) * 1.6, hi], i * 4);
      morph.set([0.04 + rnd() * 0.36, (rnd() - 0.5) * 1.4, (rnd() < 0.5 ? -1 : 1) * (0.04 + 0.1 * (1 - rho))], i * 3);
      if (rnd() < 0.55) spokePairs.push(hubNode, i);
    });
    members[hi] = mine;
    if (m >= 3) for (let j = 0; j < m; j++) ringPairs.push(mine[j], mine[(j + 1) % m]);
  }

  // 6) Pipeline roles. Service cluster h becomes landmark h: clusters 0..3 turn into the four
  //    stage gates (ring + the conduit leading to the next gate), cluster 4 into the "shipped"
  //    output ring plus ambient dust. Keeping a cluster together keeps the flight short.
  const pipe = new Float32Array(count * 4);
  const pipeEdgePairs: number[] = [];
  for (let hi = 0; hi < hubCount; hi++) {
    const hubNode = hubs[hi];
    pipe.set([3, hi, 0, 0], hubNode * 4);
    const mine = members[hi];
    const m = mine.length;
    const ringN = hi < 4 ? Math.round(m * 0.63) : Math.round(m * 0.4);
    const shuffled = [...mine];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rnd() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const ringSet = new Set(shuffled.slice(0, ringN));
    const ring = mine.filter((i) => ringSet.has(i)); // keeps the cluster's angular order
    const rest = mine.filter((i) => !ringSet.has(i));

    ring.forEach((i, j) => {
      pipe.set([0, hi, ((j + rnd() * 0.4) / Math.max(ringN, 1)) * Math.PI * 2, 0.9 + rnd() * 0.2], i * 4);
      if (ringN >= 3) pipeEdgePairs.push(i, ring[(j + 1) % ringN]);
      if (j % 3 === 0) pipeEdgePairs.push(hubNode, i); // wheel spokes
    });

    if (hi < 4) {
      const c = rest.length;
      rest.forEach((i, j) => pipe.set([1, hi, (j + 0.5 + (rnd() - 0.5) * 0.4) / Math.max(c, 1), rnd()], i * 4));
      // wire: gate centre → beads → next gate centre
      const chain = [hubNode, ...rest, hubs[hi + 1]];
      for (let j = 0; j < chain.length - 1; j++) pipeEdgePairs.push(chain[j], chain[j + 1]);
    } else {
      rest.forEach((i) => pipe.set([2, 0, rnd(), rnd()], i * 4));
    }
  }

  // 7) Rails + stagger for the two later morphs.
  const rail = new Float32Array(count * 3);
  const morph2 = new Float32Array(count * 3);
  const bySide: Record<'-1' | '1', number[]> = { '-1': [], '1': [] };
  for (let i = 0; i < count; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    rail.set([side, rnd() * 2 - 1, rnd()], i * 3);
    morph2.set([rnd() * 0.4, rnd() * 0.4, (rnd() - 0.5) * 1.6], i * 3);
    bySide[String(side) as '-1' | '1'].push(i);
  }
  const railPairs: number[] = [];
  for (const list of Object.values(bySide)) {
    list.sort((a, b) => rail[a * 3 + 1] - rail[b * 3 + 1]);
    for (let j = 0; j < list.length - 1; j++) railPairs.push(list[j], list[j + 1]);
  }

  // 8) The "reactor core" finale: a Fibonacci-lattice globe (wireframe), three orbit rings of beads and a halo.
  const logo = new Float32Array(count * 4);
  const logoPairs: number[] = [];
  const order = Array.from({ length: count }, (_, i) => i);
  for (let j = order.length - 1; j > 0; j--) {
    const k = Math.floor(rnd() * (j + 1));
    [order[j], order[k]] = [order[k], order[j]];
  }
  const nSphere = Math.round(count * 0.56);
  const nRing = Math.round(count * 0.1);
  let cursor = 0;
  const take = (k: number) => order.slice(cursor, (cursor += k));

  const sphere = take(nSphere);
  const dirs: [number, number, number][] = sphere.map((i, j) => {
    const y = 1 - (2 * (j + 0.5)) / nSphere;
    const theta = j * GOLDEN_ANGLE;
    logo.set([theta, y, 0, rnd() * 0.4], i * 4);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    return [r * Math.cos(theta), y, r * Math.sin(theta)];
  });
  // wireframe: each globe node links to its 3 nearest neighbours (deduped, capped length)
  const maxChord = 1.8 * Math.sqrt((4 * Math.PI) / Math.max(nSphere, 1));
  const edgeSeen = new Set<number>();
  for (let a = 0; a < nSphere; a++) {
    const near: [number, number][] = [];
    for (let b2 = 0; b2 < nSphere; b2++) {
      if (b2 === a) continue;
      near.push([Math.hypot(dirs[a][0] - dirs[b2][0], dirs[a][1] - dirs[b2][1], dirs[a][2] - dirs[b2][2]), b2]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (const [d, b2] of near.slice(0, 3)) {
      if (d > maxChord) continue;
      const key = Math.min(a, b2) * nSphere + Math.max(a, b2);
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);
      logoPairs.push(sphere[a], sphere[b2]);
    }
  }
  // beads on the three orbit rings: part 1..3, x = angle
  for (let ri = 0; ri < 3; ri++) {
    take(nRing).forEach((i, j) => {
      logo.set([((j + rnd() * 0.4) / nRing) * Math.PI * 2, (rnd() - 0.5) * 2, 1 + ri, rnd() * 0.4], i * 4);
    });
  }
  // halo: whatever is left, a loose cloud around everything (part 4: x = angle, y = radius in globe radii)
  order.slice(cursor).forEach((i) => logo.set([rnd() * Math.PI * 2, 1.75 + rnd() * 0.6, 4, rnd() * 0.4], i * 4));

  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  const centroid: [number, number] = [cx / count, cy / count];

  return {
    count, positions, edges, edgeCount, edgeLen, edgeDelay, edgeShade, nodeDelay, adjacency, hubs, origin, centroid,
    cluster, morph, members,
    spokes: new Uint32Array(spokePairs),
    rings: new Uint32Array(ringPairs),
    pipe,
    pipeEdges: new Uint32Array(pipeEdgePairs),
    rail,
    rails: new Uint32Array(railPairs),
    morph2,
    logo,
    logoEdges: new Uint32Array(logoPairs),
  };
}
