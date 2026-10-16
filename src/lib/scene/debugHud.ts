import type { SceneController, SceneStats } from './engine';

/**
 * Tiny on-screen readout for QA: add ?scene=debug to the URL.
 * Loaded only in that case, so normal visitors never download it.
 * The "Salin laporan" button copies everything needed to judge performance on a real device.
 */
export function mountDebugHud(ctrl: SceneController | null, offReason?: string): () => void {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', left: '8px', bottom: '8px', zIndex: '2147483000', maxWidth: '280px',
    font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', color: '#F8F6F2',
    background: 'rgba(10,10,12,0.86)', border: '1px solid #28282F', borderRadius: '8px',
    padding: '8px 10px', pointerEvents: 'none', whiteSpace: 'pre',
  } as Partial<CSSStyleDeclaration>);
  const text = document.createElement('div');
  const btn = document.createElement('button');
  btn.textContent = 'Salin laporan';
  Object.assign(btn.style, {
    pointerEvents: 'auto', marginTop: '6px', font: 'inherit', color: '#0A0A0C', background: '#FF5A1F',
    border: '0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
  } as Partial<CSSStyleDeclaration>);
  box.append(text, btn);
  document.body.append(box);

  const f2 = (v: number) => v.toFixed(2);
  const k = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
  const snapshot = (): SceneStats | null => (ctrl ? ctrl.stats() : null);

  const render = (): void => {
    const s = snapshot();
    if (!s) {
      text.textContent = `3D off\nreason: ${offReason ?? 'unknown'}\nUA: ${navigator.userAgent.slice(0, 60)}…`;
      return;
    }
    const status = s.lost ? '✗ context lost' : s.paused ? '⏸ paused (modal)' : s.running ? '● running' : '○ idle';
    text.textContent = [
      `3D ${status}  tier ${s.tier}  dpr ${s.dpr}`,
      `fps ${s.fps.toFixed(1)}  worst ${s.frameMsMax.toFixed(0)}ms  slow ${s.slowFrames}/${s.frames}`,
      `GPU ${s.gpu.slice(0, 34)}`,
      `draw ${s.drawCalls}  pts ${k(s.points)}  lines ${k(s.lines)}`,
      `canvas ${s.canvas[0]}×${s.canvas[1]}  scroll ${Math.round(s.scrollY)}/${Math.max(0, document.documentElement.scrollHeight - innerHeight)}`,
      `morph ${f2(s.state.morph)}  pipe ${f2(s.state.pipe)}  recede ${f2(s.state.recede)}`,
      `prog ${f2(s.state.prog)}  logo ${f2(s.state.logo)}  op ${f2(s.state.opacity)}${s.target.still ? '  still' : ''}`,
    ].join('\n');
  };

  btn.addEventListener('click', async () => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; saveData?: boolean } };
    const report = JSON.stringify(
      {
        when: new Date().toISOString(),
        ua: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        screenDpr: devicePixelRatio,
        cores: nav.hardwareConcurrency,
        memoryGB: nav.deviceMemory,
        network: nav.connection?.effectiveType,
        saveData: nav.connection?.saveData,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        pageHeight: document.documentElement.scrollHeight,
        scene: snapshot() ?? { off: offReason },
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(report);
      btn.textContent = 'Tersalin ✓';
    } catch {
      window.prompt('Salin laporan ini:', report);
    }
    setTimeout(() => (btn.textContent = 'Salin laporan'), 1500);
  });

  render();
  const timer = window.setInterval(render, 250);
  return () => {
    clearInterval(timer);
    box.remove();
  };
}
