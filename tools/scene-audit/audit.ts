import { Constellation } from '../../src/lib/scene/constellation';
import { buildGraph } from '../../src/lib/scene/graph';

const BUILTIN = new Set(['modelMatrix', 'modelViewMatrix', 'viewMatrix', 'projectionMatrix', 'normalMatrix', 'cameraPosition', 'position']);
const strip = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
let problems = 0;
const bad = (msg: string) => { problems++; console.log('  ✗', msg); };

function declared(src: string, kw: 'attribute' | 'uniform'): { name: string; type: string; len: number }[] {
  const out: { name: string; type: string; len: number }[] = [];
  const re = new RegExp(`${kw}\\s+(?:highp\\s+|mediump\\s+|lowp\\s+)?(\\w+)\\s+(\\w+)(?:\\[(\\d+)\\])?\\s*;`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(strip(src)))) out.push({ type: m[1], name: m[2], len: m[3] ? +m[3] : 0 });
  return out;
}
const comps: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

for (const n of [45, 70, 140, 200]) {
  console.log(`\n== Constellation n=${n}`);
  const c = new Constellation({ nodeCount: n, pulseCount: n >= 140 ? 18 : n >= 70 ? 10 : 6, pixelRatio: 1 });
  let idx = 0;
  for (const obj of c.group.children as any[]) {
    const geo = obj.geometry, mat = obj.material;
    const label = `#${idx++} ${obj.type}`;
    const attrs = declared(mat.vertexShader, 'attribute');
    const counts = new Set<number>();
    for (const [k, a] of Object.entries<any>(geo.attributes)) counts.add(a.count);
    if (counts.size !== 1) bad(`${label}: attribute counts differ ${[...counts]}`);
    const vsrc = strip(mat.vertexShader);
    const used = (name: string) => (vsrc.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length > 1; // >1 = more than its declaration
    for (const a of attrs) {
      if (BUILTIN.has(a.name)) continue;
      if (!used(a.name)) continue; // declared but never read: the compiler drops it, no buffer needed
      const g = geo.attributes[a.name];
      if (!g) { bad(`${label}: shader needs attribute ${a.name}, geometry has none`); continue; }
      if (g.itemSize !== comps[a.type]) bad(`${label}: ${a.name} itemSize ${g.itemSize} != ${a.type}`);
      for (let i = 0; i < g.array.length; i++) if (!Number.isFinite(g.array[i])) { bad(`${label}: ${a.name} has non-finite value at ${i}`); break; }
    }
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && !attrs.find((a) => a.name === name)) console.log(`  · ${label}: geometry attribute ${name} unused by shader`);
    const uni = [...declared(mat.vertexShader, 'uniform'), ...declared(mat.fragmentShader, 'uniform')];
    for (const u of uni) {
      if (BUILTIN.has(u.name)) continue;
      const entry = mat.uniforms[u.name];
      if (!entry) { bad(`${label}: uniform ${u.name} declared in shader but missing in material`); continue; }
      if (u.len && (!Array.isArray(entry.value) || entry.value.length !== u.len)) bad(`${label}: uniform ${u.name}[${u.len}] value length ${entry.value?.length}`);
    }
    const vcount = geo.attributes.position.count;
    console.log(`  ${label}  vertices=${vcount}  attributes=${Object.keys(geo.attributes).length}  uniforms=${uni.length}`);
  }
  // run the CPU side for a while through all five acts; every uniform must stay finite
  const st = { morph: 0, pipe: 0, recede: 0, prog: 0, logo: 0 };
  c.u.uIntro.value = 1;
  const anchors = Array.from({ length: 5 }, (_, i) => ({ x: i - 2, y: 0 }));
  for (let f = 0; f < 600; f++) {
    const p = f / 600;
    st.morph = Math.min(1, p * 5); st.pipe = Math.min(1, Math.max(0, p * 5 - 1)); st.prog = Math.min(1, Math.max(0, p * 5 - 1.5));
    st.recede = Math.min(1, Math.max(0, p * 5 - 2)); st.logo = Math.min(1, Math.max(0, p * 5 - 3));
    c.setHubLayout(anchors, 1);
    c.setPipelineLayout(anchors.concat([{ x: 3, y: 0 }]).slice(0, 5), { x: 1, y: 0 }, 0.4, 6, 3.5);
    c.setLogoLayout(0, 0, 1.2, 80);
    if (f === 100) c.triggerWave();
    if (f === 300) c.setActiveHub(2);
    c.update(f / 60, 1 / 60, 8.4, st);
  }
  const walk = (v: any, path: string) => {
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad(`uniform ${path} not finite`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const k of ['x', 'y', 'z']) if (k in v) walk(v[k], `${path}.${k}`);
  };
  for (const [k, u] of Object.entries<any>(c.u)) walk(u.value, k);
  c.dispose();
}

console.log('\n== Graph sanity');
for (const n of [30, 45, 70, 100, 140, 200]) {
  const g = buildGraph(n);
  const chk = (name: string, pairs: Uint32Array) => {
    for (let i = 0; i < pairs.length; i++) if (!(pairs[i] < n)) { bad(`n=${n} ${name}: index ${pairs[i]} out of range`); return; }
    if (pairs.length % 2) bad(`n=${n} ${name}: odd length`);
  };
  chk('edges', g.edges); chk('spokes', g.spokes); chk('rings', g.rings); chk('pipeEdges', g.pipeEdges); chk('rails', g.rails); chk('logoEdges', g.logoEdges);
  for (const [name, arr] of Object.entries({ positions: g.positions, cluster: g.cluster, morph: g.morph, pipe: g.pipe, rail: g.rail, morph2: g.morph2, logo: g.logo }))
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad(`n=${n} ${name}[${i}] not finite`); break; }
  // every node must have exactly one role in every layout
  let unassigned = 0;
  for (let i = 0; i < n; i++) { if (g.cluster[i * 4 + 3] < 0 || g.cluster[i * 4 + 3] > 4) unassigned++; }
  if (unassigned) bad(`n=${n}: ${unassigned} nodes without a valid hub`);
  const hubSizes = g.members.map((m) => m.length);
  console.log(`  n=${n}: hubs=${g.hubs.length} members=${hubSizes.join('/')} pipeEdges=${g.pipeEdges.length / 2} rails=${g.rails.length / 2} wire=${g.logoEdges.length / 2}`);
}
console.log(problems ? `\n${problems} PROBLEM(S)` : '\nALL CHECKS PASSED');
process.exit(problems ? 1 : 0);
