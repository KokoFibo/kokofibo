import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import type { Graph } from './graph';

/** Each packet is a bright head plus a short fading trail. */
const TRAIL = 4;
const TRAIL_STEP = 0.22; // world units between trail points
const TRAIL_SCALE = [1, 0.62, 0.42, 0.26];

interface Pulse {
  edge: number;
  dir: 1 | -1; // +1 = a→b, -1 = b→a
  t: number; // 0..1 along the current edge
  speed: number; // world units / second
  hops: number; // edges left before it respawns elsewhere
  age: number; // seconds since (re)spawn; negative = waiting
}

/**
 * Data packets that hop from edge to edge through the graph — the visual
 * proof that "the system is running". CPU-driven (≈70 points) so later
 * milestones can keep them glued to morphing node layouts.
 */
export class PulseSystem {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly posAttr: BufferAttribute;
  private readonly alphaAttr: BufferAttribute;
  private readonly pulses: Pulse[] = [];

  constructor(private readonly graph: Graph, count: number) {
    const n = count * TRAIL;
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const scale = new Float32Array(n);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < TRAIL; k++) scale[i * TRAIL + k] = TRAIL_SCALE[k];
      const p: Pulse = { edge: 0, dir: 1, t: 0, speed: 1, hops: 0, age: 0 };
      this.respawn(p);
      p.age = -Math.random() * 4; // stagger the first appearance
      this.pulses.push(p);
    }
    this.posAttr = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    this.alphaAttr = new BufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aScale', new BufferAttribute(scale, 1));
    this.write(); // valid buffers from the very first frame
  }

  private respawn(p: Pulse): void {
    p.edge = Math.floor(Math.random() * this.graph.edgeCount);
    p.dir = Math.random() < 0.7 ? 1 : -1; // mostly "outward" flow
    p.t = Math.random() * 0.3;
    p.speed = 0.9 + Math.random() * 0.9;
    p.hops = 4 + Math.floor(Math.random() * 5);
    p.age = 0;
  }

  private advance(p: Pulse): void {
    const { edges, adjacency } = this.graph;
    const node = p.dir > 0 ? edges[p.edge * 2 + 1] : edges[p.edge * 2];
    p.hops--;
    if (p.hops <= 0) {
      this.respawn(p);
      return;
    }
    const options = adjacency[node].filter((e) => e !== p.edge);
    if (options.length === 0) {
      p.dir = (p.dir > 0 ? -1 : 1) as 1 | -1; // dead end → bounce back
    } else {
      p.edge = options[Math.floor(Math.random() * options.length)];
      p.dir = edges[p.edge * 2] === node ? 1 : -1;
    }
    p.t = 0;
  }

  update(dt: number): void {
    for (const p of this.pulses) {
      p.age += dt;
      if (p.age < 0) continue;
      p.t += (p.speed * dt) / this.graph.edgeLen[p.edge];
      if (p.t >= 1) this.advance(p);
    }
    this.write();
  }

  private write(): void {
    const { positions, edges, edgeLen } = this.graph;
    this.pulses.forEach((p, i) => {
      const live = p.age >= 0;
      const a = p.dir > 0 ? edges[p.edge * 2] : edges[p.edge * 2 + 1];
      const b = p.dir > 0 ? edges[p.edge * 2 + 1] : edges[p.edge * 2];
      const len = edgeLen[p.edge];
      const env = smooth(0, 0.18, p.t) * smooth(1, 0.82, p.t);
      const life = live ? Math.min(p.age / 0.8, 1) : 0;
      for (let k = 0; k < TRAIL; k++) {
        const tk = Math.max(0, p.t - (k * TRAIL_STEP) / len);
        const o = (i * TRAIL + k) * 3;
        for (let c = 0; c < 3; c++) {
          const va = positions[a * 3 + c];
          const vb = positions[b * 3 + c];
          this.pos[o + c] = va + (vb - va) * tk;
        }
        this.alpha[i * TRAIL + k] = env * life * (1 - k / TRAIL) * 0.95;
      }
    });
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
