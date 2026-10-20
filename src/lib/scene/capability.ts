/**
 * Decides whether (and how heavily) the 3D scene may run on this device.
 * Anything that returns tier "none" keeps the static SVG NetworkField.
 *
 * QA override: add ?scene=off | lite | mobile | full to the URL.
 * ?scene=debug keeps normal detection but shows a small HUD (fps, quality, GPU, act values) with a
 * "copy report" button; it also explains why the 3D is off when it is.
 */
export type Tier = 'none' | 'lite' | 'mobile' | 'full';

export interface Capability {
  tier: Tier;
  /** Why the tier is "none" (for console debugging). */
  reason?: string;
  maxDpr: number;
  nodeCount: number;
  pulseCount: number;
  fpsCap: number;
  /** Fine pointer available → enable mouse parallax. */
  pointer: boolean;
  /** ?scene=debug → mount the debug HUD. */
  debug: boolean;
}

const PRESETS: Record<Exclude<Tier, 'none'>, Omit<Capability, 'tier' | 'reason' | 'pointer' | 'debug'>> = {
  full: { maxDpr: 2, nodeCount: 140, pulseCount: 18, fpsCap: 60 },
  mobile: { maxDpr: 1.5, nodeCount: 70, pulseCount: 10, fpsCap: 60 },
  lite: { maxDpr: 1, nodeCount: 45, pulseCount: 6, fpsCap: 30 },
};

/** 'ok' = hardware WebGL2, 'software' = CPU-rendered WebGL (SwiftShader, llvmpipe …), 'none' = no WebGL2. */
function probeWebGL2(): 'ok' | 'software' | 'none' {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'none';
    let renderer = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    } catch {
      /* renderer name unavailable: treat as hardware */
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // WebGL drawn by the CPU runs the scene at a few fps and blocks the main thread
    // (GPU-blocklisted browsers, remote desktops, headless/lab browsers). Keep the SVG there.
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer) ? 'software' : 'ok';
  } catch {
    return 'none';
  }
}

function none(reason: string): Capability {
  return { tier: 'none', reason, maxDpr: 1, nodeCount: 0, pulseCount: 0, fpsCap: 60, pointer: false, debug: new URLSearchParams(location.search).get('scene') === 'debug' };
}

export function detectCapability(): Capability {
  const forced = new URLSearchParams(location.search).get('scene');
  if (forced === 'off') return none('forced-off');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return none('reduced-motion');

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData) return none('save-data');
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return none('slow-network');

  const gl = probeWebGL2();
  if (gl === 'none') return none('no-webgl2');
  if (gl === 'software' && forced !== 'lite' && forced !== 'mobile' && forced !== 'full') return none('software-renderer');

  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const narrow = window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches;
  const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;

  let tier: Exclude<Tier, 'none'> = lowEnd ? 'lite' : narrow ? 'mobile' : 'full';
  if (forced === 'lite' || forced === 'mobile' || forced === 'full') tier = forced;

  return { tier, pointer: pointer && !narrow, debug: forced === 'debug', ...PRESETS[tier] };
}
