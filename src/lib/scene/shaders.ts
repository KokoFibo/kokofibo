/** Brand palette as linear-passthrough RGB (ShaderMaterial writes raw values). */
export const COLORS = {
  signal: [1.0, 0.353, 0.122] as const, // #FF5A1F
  light: [1.0, 0.635, 0.239] as const, // #FFA23D
  paper: [0.973, 0.965, 0.949] as const, // #F8F6F2
};

/** Reference camera depth: sprite sizes are authored in CSS px at this distance. */
const REF_DEPTH = '9.0';

/**
 * Shared by every vertex shader that follows nodes around.
 *
 * Each node has five homes, visited in scroll order:
 *   1. free      – its place in the hero constellation (attribute `position`, group space)
 *   2. cluster   – a slot in the halo around its service card          (uMorph  0→1)
 *   3. pipeline  – a gate ring / conduit / dust mote of the process pipe (uPipe   0→1)
 *   4. rail      – a bead on the left/right margin rails                (uRecede 0→1)
 *   5. core      – the "reactor core" finale in the CTA: a wireframe globe, orbit beads and a halo (uLogo 0→1)
 * Every transition is staggered per node and eased, and runs on the GPU.
 */
const MORPH_CHUNK = /* glsl */ `
attribute vec4 aCluster; // x angle, y radius 0..1, z z-jitter, w hub id
attribute vec3 aMorph;   // x delay 0..0.4, y arc lift, z orbit speed (rad/s)
attribute vec4 aPipe;    // x kind (0 ring, 1 conduit, 2 dust, 3 gate centre), y gate/segment, z param, w seed
attribute vec3 aRail;    // x side (-1/+1), y height -1..1, z jitter 0..1
attribute vec3 aMorph2;  // x pipe delay, y recede delay, z arc lift
attribute vec4 aLogo;    // x,y: globe = longitude + height -1..1 | ring bead = angle + jitter | halo = angle + radius; z part (0 globe, 1..3 ring, 4 halo); w delay
uniform float uLogo;
uniform float uLogoS;      // world size of the logo box (globe radius = 0.8 of it)
uniform float uLogoPulse;  // 0..1 heartbeat while the CTA button is hovered
uniform float uCorePx;     // globe radius in CSS px (sizes the central glow)
uniform vec3 uLogoPos;
uniform float uWave;       // 0..1 progress of the terminal → network wave, -1 = idle
uniform vec2 uWaveOrigin;
uniform float uTime;
uniform float uMorph;
uniform float uPipe;
uniform float uRecede;
uniform float uPipeW;    // 0..1 weight of "pipeline" visuals (lit/dim by stage)
uniform float uBurst;    // 0..1 flash when the packet is delivered
uniform float uClusterR;
uniform float uGateR;
uniform vec3 uHubPos[5];
uniform float uHubGlow[5];
uniform vec3 uGate[5];   // world position of the 4 stages + the "shipped" output
uniform float uStage[5]; // 0..1 how "reached" each landmark is
uniform float uSegLit[4];
uniform vec2 uFlow;      // unit flow direction of the pipeline (world xy)
uniform vec2 uHalf;      // half extents of the view at z = 0 (world units)

float ease3(float t) { return t * t * (3.0 - 2.0 * t); }

vec3 clusterWorld(vec4 cl, vec3 mo) {
  int h = int(cl.w + 0.5);
  float g = uHubGlow[h];
  float th = cl.x + uTime * mo.z;
  float R = uClusterR * (1.0 + 0.2 * g);
  return uHubPos[h] + vec3(cos(th) * cl.y * 1.15 * R, sin(th) * cl.y * R, cl.z);
}

vec3 morphWorld(vec3 p, vec4 cl, vec3 mo) {
  vec3 freeW = (modelMatrix * vec4(p, 1.0)).xyz;
  float t = ease3(clamp((uMorph - mo.x) / 0.6, 0.0, 1.0));
  vec3 w = mix(freeW, clusterWorld(cl, mo), t);
  w.y += sin(3.14159265 * t) * mo.y;
  return w;
}

vec3 pipeWorld(vec4 pp) {
  vec2 f = uFlow;
  vec2 q = vec2(-f.y, f.x);
  int idx = int(pp.y + 0.5);
  if (pp.x < 0.5) {
    // gate ring: an ellipse seen at an angle, slowly spinning
    float r = uGateR * pp.w;
    if (idx == 4) r *= 0.62 + uBurst * 1.5;
    float th = pp.z + uTime * ((idx % 2 == 0) ? 0.35 : -0.35);
    return uGate[idx] + vec3(f * (cos(th) * r * 0.4) + q * (sin(th) * r), cos(th) * r * 0.8);
  } else if (pp.x < 1.5) {
    // conduit: beads on a gently waving wire between two gates
    vec3 c = mix(uGate[idx], uGate[idx + 1], pp.z);
    float wob = sin(uTime * 0.9 + pp.w * 40.0 + pp.z * 6.2831) * uGateR * 0.1;
    return c + vec3(q * wob, 0.0);
  } else if (pp.x < 2.5) {
    // dust: ambient motes drifting around the whole pipe
    float u = clamp(pp.z, 0.0, 0.999) * 4.0;
    int s = int(u);
    vec3 c = mix(uGate[s], uGate[s + 1], u - float(s));
    float ang = pp.w * 45.8 + uTime * 0.05;
    float rr = uGateR * (1.1 + fract(pp.w * 91.7) * 1.7);
    return c + vec3(q * (cos(ang) * rr), sin(ang) * rr * 0.8);
  }
  return uGate[idx]; // gate centre
}

vec3 railWorld(vec3 ed) {
  float x = ed.x * uHalf.x * (0.95 - 0.12 * ed.z);
  float y = ed.y * uHalf.y * 1.05 + sin(uTime * 0.12 + ed.z * 40.0) * 0.25;
  return vec3(x, y, (ed.z - 0.5) * 3.0);
}

vec3 rotXYZ(vec3 p, vec3 a) {
  float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y), cz = cos(a.z), sz = sin(a.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  return vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
}

float coreScale() { return uLogoS * 0.8 * (1.0 + 0.02 * sin(uTime * 1.1) + 0.06 * uLogoPulse); }
float ringSpeed(int ri) { return ri == 0 ? 0.35 : (ri == 1 ? -0.28 : 0.22); }

/** A point on orbit ring ri (0..2) at angle ang. Shared by ring lines, beads and comets, so they never drift apart. */
vec3 ringPoint(int ri, float ang) {
  float rad = ri == 0 ? 1.3 : (ri == 1 ? 1.45 : 1.6);
  vec3 tilt = ri == 0 ? vec3(1.2217, 0.1745, 0.0) : (ri == 1 ? vec3(-0.4363, 0.3491, 0.6981) : vec3(0.2618, -0.6981, -0.5236));
  return uLogoPos + rotXYZ(vec3(cos(ang), sin(ang), 0.0) * rad, tilt) * coreScale();
}

vec3 logoWorld(vec4 lg) {
  float S = coreScale();
  if (lg.z > 3.5) {
    // halo: a loose cloud of motes slowly orbiting the core
    float ang = lg.x + uTime * 0.08;
    float rr = lg.y * S;
    return vec3(uLogoPos.xy + vec2(cos(ang) * rr * 1.15, sin(ang) * rr * 0.6), sin(ang * 2.0) * 0.4);
  }
  if (lg.z < 0.5) {
    // globe: Fibonacci lattice, slowly spinning, tilted toward the viewer
    float r = sqrt(max(0.0, 1.0 - lg.y * lg.y));
    float a = lg.x + uTime * 0.12;
    vec3 d = rotXYZ(vec3(r * cos(a), lg.y, r * sin(a)), vec3(0.384, 0.0, -0.21));
    return uLogoPos + d * S;
  }
  // orbit bead
  int ri = int(lg.z + 0.5) - 1;
  return ringPoint(ri, lg.x + uTime * ringSpeed(ri));
}

/** Brightness of a ring-shaped wave spreading from the hero terminal (hero state only). */
float waveBoost(vec3 w) {
  if (uWave < 0.0) return 0.0;
  float x = (length(w.xy - uWaveOrigin) - uWave * 18.0) / 1.3;
  return exp(-x * x) * (1.0 - uWave * 0.6) * (1.0 - smoothstep(0.0, 0.35, uMorph));
}

vec3 nodeWorld(vec3 p, vec4 cl, vec3 mo, vec4 pp, vec3 rl, vec3 m2, vec4 lg) {
  vec3 w = morphWorld(p, cl, mo);
  float tb = ease3(clamp((uPipe - m2.x) / 0.6, 0.0, 1.0));
  if (tb > 0.0) {
    w = mix(w, pipeWorld(pp), tb);
    w.y += sin(3.14159265 * tb) * m2.z;
  }
  float tc = ease3(clamp((uRecede - m2.y) / 0.6, 0.0, 1.0));
  if (tc > 0.0) {
    w = mix(w, railWorld(rl), tc);
    w.y += sin(3.14159265 * tc) * m2.z * 0.7;
  }
  float tl = ease3(clamp((uLogo - lg.w) / 0.6, 0.0, 1.0));
  if (tl > 0.0) {
    w = mix(w, logoWorld(lg), tl);
    w.y += sin(3.14159265 * tl) * m2.z * 0.6;
  }
  return w;
}

/** 0..1 brightness of a node: hovered service in the cluster state, reached stage in the pipeline. */
float nodeLit(vec4 cl, vec4 pp) {
  float gc = uHubGlow[int(cl.w + 0.5)];
  int idx = int(pp.y + 0.5);
  float gp = 0.5;
  if (pp.x < 0.5 || pp.x > 2.5) gp = uStage[idx];
  else if (pp.x < 1.5) gp = uSegLit[idx];
  return mix(gc, gp, uPipeW);
}`;

// ───────────────────────── nodes ─────────────────────────
export const NODE_VERT = /* glsl */ `
attribute float aSize;
attribute float aMix;
attribute float aPhase;
attribute float aDelay;
uniform float uPixelRatio;
uniform float uIntro;
uniform float uFogNear;
uniform float uFogFar;
varying float vMix;
varying float vAlpha;
varying float vPaper;
${MORPH_CHUNK}
void main() {
  vec3 w = nodeWorld(position, aCluster, aMorph, aPipe, aRail, aMorph2, aLogo);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  float g = nodeLit(aCluster, aPipe);
  // core finale: globe nodes brighten toward the viewer, a radar sweep circles the globe every few seconds
  float lw = smoothstep(0.4, 1.0, uLogo);
  float part = aLogo.z;
  float sphereW = part < 0.5 ? lw : 0.0;
  float ringW = (part > 0.5 && part < 3.5) ? lw : 0.0;
  float haloW = part > 3.5 ? lw : 0.0;
  float cue = clamp(((w.z - uLogoPos.z) / (uLogoS * 0.8)) * 0.5 + 0.5, 0.0, 1.0);
  float sw = sin(0.5 * (aLogo.x + uTime * 0.12 - uTime * 1.1));
  float sweep = sphereW * exp(-sw * sw * 14.0);
  float wv = waveBoost(w);
  float burst = (aPipe.x < 0.5 && aPipe.y > 3.5) ? uBurst * uPipeW : 0.0;
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  float tw = 0.78 + 0.22 * sin(uTime * 1.4 + aPhase);
  float appear = smoothstep(aDelay, aDelay + 0.2, uIntro * 1.25);
  vAlpha = fog * tw * appear * mix(0.35, 1.0, g) * (1.0 + burst) * (1.0 + 1.6 * wv)
    * (1.0 - 0.5 * haloW) * (1.0 - sphereW * (0.65 - 0.65 * cue)) * (1.0 + sweep * 0.9 + uLogoPulse * 0.4 * lw);
  vMix = max(max(aMix, burst), max(max(wv * 0.9, sweep * 0.6), max(ringW * 0.8, sphereW * cue * 0.35)));
  vPaper = sweep * 0.5;
  float hubShrink = aSize > 25.0 ? mix(1.0, 0.55, lw) : 1.0; // the five big hubs melt into the K
  gl_PointSize = min(aSize * hubShrink * (0.9 + 0.25 * g + burst * 0.6) * (1.0 + 0.5 * wv)
    * (1.0 + 0.25 * uLogoPulse * lw) * (1.0 - sphereW * (0.45 - 0.45 * cue) - ringW * 0.3 - haloW * 0.35)
    * uPixelRatio * ${REF_DEPTH} / depth, 60.0);
  gl_Position = projectionMatrix * mv;
}`;

export const NODE_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uPaper;
varying float vMix;
varying float vAlpha;
varying float vPaper;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 0.32, d);
  float halo = pow(1.0 - d, 2.6) * 0.5;
  float a = clamp(core + halo, 0.0, 1.0) * vAlpha;
  vec3 col = mix(uColorA, uColorB, vMix);
  col = mix(col, uPaper, core * 0.45 * vMix);
  col = mix(col, uPaper, vPaper);
  gl_FragColor = vec4(col, a);
}`;

// ───────────────────────── edges (one vertex shader, four fragment variants) ─────────────────────────
export const EDGE_VERT = /* glsl */ `
attribute float aT;
attribute float aDelay;
attribute float aShade;
uniform float uFogNear;
uniform float uFogFar;
varying float vT;
varying float vDelay;
varying float vShade;
varying float vFog;
varying float vLit;
varying float vBoost;
varying float vPart;
varying float vCue;
${MORPH_CHUNK}
void main() {
  vec3 w = nodeWorld(position, aCluster, aMorph, aPipe, aRail, aMorph2, aLogo);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  vFog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  vLit = nodeLit(aCluster, aPipe);
  vBoost = waveBoost(w);
  vPart = aLogo.z;
  vCue = clamp(((w.z - uLogoPos.z) / (uLogoS * 0.8)) * 0.5 + 0.5, 0.0, 1.0);
  vT = aT;
  vDelay = aDelay;
  vShade = aShade;
  gl_Position = projectionMatrix * mv;
}`;

const EDGE_FRAG_HEAD = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uIntro;
uniform float uMorph;
uniform float uPipe;
uniform float uRecede;
uniform float uLogo;
uniform float uLogoPulse;
uniform vec3 uPaper;
uniform vec3 uLight;
varying float vT;
varying float vDelay;
varying float vShade;
varying float vFog;
varying float vLit;
varying float vBoost;
varying float vPart;
varying float vCue;
`;

/** Hero web: draws itself in, then dissolves while its nodes fly to the service cards. */
export const EDGE_FRAG_NET = /* glsl */ `${EDGE_FRAG_HEAD}
void main() {
  float p = clamp((uIntro * 1.4 - vDelay) / 0.4, 0.0, 1.0);
  if (vT > p) discard;
  float net = 1.0 - smoothstep(0.0, 0.35, uMorph);
  gl_FragColor = vec4(uColor, uAlpha * vShade * vFog * net * (1.0 + 2.5 * vBoost));
}`;

/** Spokes + rings around each service card. */
export const EDGE_FRAG_CLUSTER = /* glsl */ `${EDGE_FRAG_HEAD}
void main() {
  float p = clamp((uMorph - 0.55) / 0.4, 0.0, 1.0);
  if (vT > p) discard;
  float gate = p * (1.0 - smoothstep(0.0, 0.3, uPipe));
  gl_FragColor = vec4(uColor, uAlpha * gate * vShade * vFog * mix(0.25, 1.0, vLit));
}`;

/** Gate rings + conduit wires of the process pipeline; stages light up as the packet passes. */
export const EDGE_FRAG_PIPE = /* glsl */ `${EDGE_FRAG_HEAD}
void main() {
  float p = clamp((uPipe - 0.55) / 0.4, 0.0, 1.0);
  if (vT > p) discard;
  float gate = p * (1.0 - smoothstep(0.0, 0.3, uRecede));
  gl_FragColor = vec4(uColor, uAlpha * gate * vShade * vFog * mix(0.3, 1.0, vLit));
}`;

/** Beaded rails along the page margins (portfolio / testimonials backdrop). */
export const EDGE_FRAG_RAIL = /* glsl */ `${EDGE_FRAG_HEAD}
void main() {
  float p = clamp((uRecede - 0.55) / 0.4, 0.0, 1.0);
  if (vT > p) discard;
  gl_FragColor = vec4(uColor, uAlpha * p * vShade * vFog * (1.0 - smoothstep(0.0, 0.3, uLogo)));
}`;

/** The globe's wireframe: edges on the far side recede, the near side glows. */
export const EDGE_FRAG_LOGO = /* glsl */ `${EDGE_FRAG_HEAD}
void main() {
  float p = clamp((uLogo - 0.55) / 0.4, 0.0, 1.0);
  if (vT > p) discard;
  gl_FragColor = vec4(uColor, uAlpha * p * vShade * vFog * (0.2 + 0.8 * vCue) * (1.0 + uLogoPulse * 0.8));
}`;

// ───────────────────────── hero pulses (data packets on the web) ─────────────────────────
export const PULSE_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aScale;
uniform float uPixelRatio;
uniform float uIntro;
uniform float uMorph;
uniform float uFogNear;
uniform float uFogFar;
varying float vAlpha;
varying float vHead;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mv.z, 0.1);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  float net = 1.0 - smoothstep(0.0, 0.3, uMorph);
  vAlpha = aAlpha * fog * smoothstep(0.85, 1.0, uIntro) * net;
  vHead = aScale;
  gl_PointSize = min(16.0 * aScale * uPixelRatio * ${REF_DEPTH} / depth, 48.0);
  gl_Position = projectionMatrix * mv;
}`;

export const PULSE_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uPaper;
varying float vAlpha;
varying float vHead;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 0.3, d);
  float halo = pow(1.0 - d, 2.2) * 0.65;
  float a = clamp(core + halo, 0.0, 1.0) * vAlpha;
  vec3 col = mix(uColorA, uPaper, core * vHead * 0.8);
  gl_FragColor = vec4(col, a);
}`;

// ───────────────────────── cluster pulses (packets running along spokes) ─────────────────────────
// Pure GPU: position is a function of a per-hub clock, so the active hub can
// speed up smoothly without jumps.
export const CLUSTER_PULSE_VERT = /* glsl */ `
attribute vec3 aPulse;   // x speed, y phase, z direction (+1 hub→node, -1 node→hub)
attribute float aScale;  // head 1 … tail 0.26
attribute float aTrail;  // 0 = head, 1.. = trail index
uniform float uPixelRatio;
uniform float uIntro;
uniform float uFogNear;
uniform float uFogFar;
uniform float uPulseClock[5];
varying float vAlpha;
varying float vHead;
${MORPH_CHUNK}
void main() {
  int h = int(aCluster.w + 0.5);
  float g = uHubGlow[h];
  float u = fract(uPulseClock[h] * aPulse.x + aPulse.y) - aTrail * 0.08;
  float vis = step(0.0, u);
  u = clamp(u, 0.0, 1.0);
  vec3 hubP = uHubPos[h];
  vec3 nodeP = clusterWorld(aCluster, aMorph);
  vec3 a = aPulse.z > 0.0 ? hubP : nodeP;
  vec3 b = aPulse.z > 0.0 ? nodeP : hubP;
  vec3 w = mix(a, b, u);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  float gate = smoothstep(0.8, 1.0, uMorph) * (1.0 - smoothstep(0.0, 0.3, uPipe)) * smoothstep(0.85, 1.0, uIntro);
  vAlpha = sin(3.14159265 * u) * vis * gate * fog * mix(0.3, 1.0, g) * (1.0 - aTrail * 0.22);
  vHead = aScale;
  gl_PointSize = min(15.0 * aScale * (0.9 + 0.25 * g) * uPixelRatio * ${REF_DEPTH} / depth, 48.0);
  gl_Position = projectionMatrix * mv;
}`;

// ───────────────────────── pipeline packets ─────────────────────────
// kind 0: the scroll-driven packet (position = scroll progress through the process section)
// kind 1: ambient packets that keep flowing through the pipe on their own
export const PIPE_PULSE_VERT = /* glsl */ `
attribute vec3 aPP;      // x kind, y seed, z trail index
attribute float aScale;
uniform float uPixelRatio;
uniform float uIntro;
uniform float uFogNear;
uniform float uFogFar;
uniform float uProg;
varying float vAlpha;
varying float vHead;
${MORPH_CHUNK}
void main() {
  float kind = aPP.x;
  float seed = aPP.y;
  float k = aPP.z;
  float u = kind < 0.5
    ? uProg * 4.0 - k * 0.07
    : fract(uTime * 0.06 * (0.6 + seed) + seed * 7.3) * 4.0 - k * 0.05;
  float vis = step(0.0, u) * step(u, 4.0);
  u = clamp(u, 0.0, 3.999);
  int s = int(u);
  vec3 w = mix(uGate[s], uGate[s + 1], u - float(s));
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  float base = kind < 0.5 ? 1.0 : 0.55 * sin(3.14159265 * (u / 4.0));
  vAlpha = vis * uPipeW * base * fog * smoothstep(0.85, 1.0, uIntro) * (1.0 - k * 0.22);
  vHead = aScale;
  float size = kind < 0.5 ? 22.0 : 14.0;
  gl_PointSize = min(size * aScale * uPixelRatio * ${REF_DEPTH} / depth, 52.0);
  gl_Position = projectionMatrix * mv;
}`;

// ───────────────────────── core: orbit lines, comets, central glow ─────────────────────────
/** The three orbit rings as thin lines. Vertex = (ring index, angle); position comes from ringPoint(). */
export const CORE_RING_VERT = /* glsl */ `
attribute vec2 aRingA; // x ring index, y angle
uniform float uFogNear;
uniform float uFogFar;
varying float vAlpha;
${MORPH_CHUNK}
void main() {
  vec3 w = ringPoint(int(aRingA.x + 0.5), aRingA.y);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  vAlpha = smoothstep(0.7, 1.0, uLogo) * fog * (0.5 + 0.5 * uLogoPulse);
  gl_Position = projectionMatrix * mv;
}`;

export const CORE_RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * vAlpha);
}`;

/** Data packets circling the orbit rings (comet = bright head + fading trail). */
export const CORE_COMET_VERT = /* glsl */ `
attribute vec3 aCom;     // x ring index, y phase 0..1, z trail index
attribute float aScale;
uniform float uPixelRatio;
uniform float uFogNear;
uniform float uFogFar;
varying float vAlpha;
varying float vHead;
${MORPH_CHUNK}
void main() {
  int ri = int(aCom.x + 0.5);
  float spd = ringSpeed(ri);
  float ang = aCom.y * 6.2831853 + uTime * spd * 1.6 * (1.0 + 0.6 * uLogoPulse) - aCom.z * 0.07 * sign(spd);
  vec3 w = ringPoint(ri, ang);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = max(-mv.z, 0.1);
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
  vAlpha = smoothstep(0.75, 1.0, uLogo) * fog * (1.0 - aCom.z * 0.1);
  vHead = aScale;
  gl_PointSize = min(20.0 * aScale * (1.0 + 0.3 * uLogoPulse) * uPixelRatio * ${REF_DEPTH} / depth, 52.0);
  gl_Position = projectionMatrix * mv;
}`;

/** Three stacked glows at the centre of the globe: orange haze, light-orange body, white-hot heart. */
export const CORE_GLOW_VERT = /* glsl */ `
attribute vec3 aK; // x size relative to the globe radius, y colour (0 signal, 1 light, 2 paper), z alpha
uniform float uPixelRatio;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uPaper;
varying float vAlpha;
varying vec3 vCol;
${MORPH_CHUNK}
void main() {
  vCol = aK.y < 0.5 ? uColorA : (aK.y < 1.5 ? uColorB : uPaper);
  vAlpha = aK.z * smoothstep(0.6, 1.0, uLogo);
  float breathe = 1.0 + 0.08 * sin(uTime * 1.5) + 0.5 * uLogoPulse;
  gl_PointSize = min(aK.x * uCorePx * breathe * uPixelRatio, 200.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(uLogoPos, 1.0);
}`;

export const CORE_GLOW_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 0.32, d);
  float halo = pow(1.0 - d, 2.6) * 0.5;
  gl_FragColor = vec4(vCol, clamp(core + halo, 0.0, 1.0) * vAlpha);
}`;
