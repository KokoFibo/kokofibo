// Offline checks for the 3D scene (no browser / GPU needed). Run: npm run audit:scene
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.out');
mkdirSync(out, { recursive: true });
let failed = 0;
const section = (t) => console.log(`\n━━━ ${t} ━━━`);

section('1/5  TypeScript (strict) on src/lib/scene');
const tsc = spawnSync('npx', ['tsc', '-p', resolve(here, 'tsconfig.json')], { stdio: 'inherit', shell: true });
if (tsc.status !== 0) failed++;

const fakeThree = resolve(here, 'three-fake.ts');
// Everything imports a three.js whose renderer is fake; the fake file itself re-exports the real one.
const plugin = {
  name: 'fake-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, async (args) => {
      if (args.pluginData?.real) return undefined; // second pass: normal resolution
      if (args.importer === fakeThree) return b.resolve('three', { resolveDir: args.resolveDir, kind: args.kind, pluginData: { real: true } });
      return { path: fakeThree };
    });
  },
};
async function run(title, file, { fake = false } = {}) {
  section(title);
  const outfile = resolve(out, file.replace('.ts', '.mjs'));
  await build({ entryPoints: [resolve(here, file)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', external: ['gsap', ...(fake ? [] : ['three'])], plugins: fake ? [plugin] : [] });
  const r = spawnSync('node', [outfile], { stdio: 'inherit', cwd: resolve(here, '../..') });
  if (r.status !== 0) failed++;
}
await run('2/5  Shader inputs: every attribute/uniform each shader needs is provided; graph data is sane', 'audit.ts');
await run('3/5  Scroll timeline on a realistic desktop + phone page', 'sim.ts');
await run('4/5  Engine smoke test (fake renderer): loop, pause, still zone, resize, fallback', 'engine-smoke.ts', { fake: true });

section('5/5  GLSL compile check (needs glslangValidator; skipped if missing)');
const has = spawnSync('glslangValidator', ['--version'], { shell: true });
if (has.status !== 0) console.log('  (glslangValidator not installed: apt install glslang-tools — skipped)');
else {
  const dump = resolve(here, 'validate-shaders.mjs');
  const r = spawnSync('node', [dump], { stdio: 'inherit', cwd: resolve(here, '../..') });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n✗ ${failed} step(s) failed` : '\n✓ all offline checks passed');
process.exit(failed ? 1 : 0);
