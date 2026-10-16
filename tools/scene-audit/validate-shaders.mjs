// Compiles every shader pair with glslangValidator, using the same prefix three.js adds (WebGL2 / GLSL ES 3.00).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '.out/glsl');
mkdirSync(dir, { recursive: true });
const bundled = resolve(here, '.out/shaders.mjs');
await build({ entryPoints: [resolve(here, '../../src/lib/scene/shaders.ts')], bundle: true, format: 'esm', outfile: bundled, logLevel: 'error' });
const S = await import(bundled);
const vPre = `#version 300 es\n#define attribute in\n#define varying out\nprecision highp float;\nprecision highp int;\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 viewMatrix;\nuniform mat4 projectionMatrix;\nin vec3 position;\n`;
const fPre = `#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\nprecision highp float;\nprecision highp int;\n`;
const pairs = {
  node: ['NODE_VERT', 'NODE_FRAG'], edgeNet: ['EDGE_VERT', 'EDGE_FRAG_NET'], edgeCluster: ['EDGE_VERT', 'EDGE_FRAG_CLUSTER'],
  edgePipe: ['EDGE_VERT', 'EDGE_FRAG_PIPE'], edgeRail: ['EDGE_VERT', 'EDGE_FRAG_RAIL'], edgeCore: ['EDGE_VERT', 'EDGE_FRAG_LOGO'],
  heroPulse: ['PULSE_VERT', 'PULSE_FRAG'], clusterPulse: ['CLUSTER_PULSE_VERT', 'PULSE_FRAG'], pipePulse: ['PIPE_PULSE_VERT', 'PULSE_FRAG'],
  coreRing: ['CORE_RING_VERT', 'CORE_RING_FRAG'], coreComet: ['CORE_COMET_VERT', 'PULSE_FRAG'], coreGlow: ['CORE_GLOW_VERT', 'CORE_GLOW_FRAG'],
};
let bad = 0;
for (const [name, [v, f]] of Object.entries(pairs)) {
  for (const [stage, src, pre] of [['vert', S[v], vPre], ['frag', S[f], fPre]]) {
    const file = resolve(dir, `${name}.${stage}`);
    writeFileSync(file, pre + src);
    const r = spawnSync('glslangValidator', ['-S', stage, file], { encoding: 'utf8' });
    if (r.status !== 0) { bad++; console.log(`  ✗ ${name}.${stage}\n${r.stdout}${r.stderr}`); }
  }
}
console.log(bad ? `  ${bad} shader stage(s) failed to compile` : `  ✓ ${Object.keys(pairs).length * 2} shader stages compile`);
process.exit(bad ? 1 : 0);
