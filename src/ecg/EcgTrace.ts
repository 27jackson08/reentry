/** Phosphor-style scope strip drawing the pseudo-ECG ring buffer on a 2D canvas. */

export interface EcgSample {
  readonly t: number;
  readonly phi: number;
}

export class EcgTrace {
  private readonly ctx: CanvasRenderingContext2D;
  private samples: EcgSample[] = [];
  readonly windowMs: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    windowMs = 4000,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the ECG trace');
    this.ctx = ctx;
    this.windowMs = windowMs;
  }

  push(sample: EcgSample): void {
    const cutoff = sample.t - this.windowMs;
    const kept = this.samples.filter((s) => s.t >= cutoff);
    this.samples = [...kept, sample];
  }

  clear(): void {
    this.samples = [];
  }

  draw(color: string, gridColor: string): void {
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
    if (this.samples.length < 2) return;

    const last = this.samples[this.samples.length - 1]!;
    let peak = 1e-6;
    for (const s of this.samples) peak = Math.max(peak, Math.abs(s.phi));
    const gain = (h * 0.42) / peak;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const x = ((s.t - (last.t - this.windowMs)) / this.windowMs) * w;
      const y = h / 2 - s.phi * gain;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
