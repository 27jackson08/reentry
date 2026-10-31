/** Phosphor-style scope strip drawing the pseudo-ECG ring buffer on a 2D canvas. */

export interface EcgSample {
  readonly t: number;
  readonly phi: number;
}

export class EcgTrace {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly windowMs: number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the ECG trace');
    this.ctx = ctx;
  }

  draw(samples: readonly EcgSample[], color: string, gridColor: string): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      const x = (w * k) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    if (samples.length < 2) return;

    const last = samples[samples.length - 1]!;
    let peak = 1e-6;
    for (const s of samples) peak = Math.max(peak, Math.abs(s.phi));
    const gain = (h * 0.42) / peak;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = ((s.t - (last.t - this.windowMs)) / this.windowMs) * w;
      const y = h / 2 - s.phi * gain;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
