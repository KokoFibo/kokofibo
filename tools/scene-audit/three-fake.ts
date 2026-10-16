// Real three.js, except the renderer: there is no GL in Node, so it only records what it is asked to do.
export * from 'three';
export class WebGLRenderer {
  static instances: WebGLRenderer[] = [];
  renders = 0; sizes: [number, number][] = []; dpr = 1; disposed = false; lostCtx = false; lastScene: any = null;
  constructor(public opts: any) { WebGLRenderer.instances.push(this); }
  info = { render: { calls: 12, points: 480, lines: 1900 } };
  getContext() { return { getExtension: () => null, getParameter: () => 'FAKE GPU', RENDERER: 1 }; }
  setClearColor() {} setPixelRatio(r: number) { this.dpr = r; } getPixelRatio() { return this.dpr; }
  setSize(w: number, h: number) { this.sizes.push([w, h]); }
  render(scene: any) { this.renders++; this.lastScene = scene; }
  dispose() { this.disposed = true; } forceContextLoss() { this.lostCtx = true; }
}
