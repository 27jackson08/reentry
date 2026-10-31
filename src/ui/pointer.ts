import type { AppController } from '../app/controller';

/**
 * Pointer input on the tissue. In stimulate mode a tap fires a point
 * stimulus; in scar/erase mode dragging paints strokes spaced by half a brush.
 */
export function bindPointer(canvas: HTMLCanvasElement, app: AppController): void {
  let painting = false;
  let last: { x: number; y: number } | null = null;

  const toUv = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: 1 - (e.clientY - rect.top) / rect.height };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = toUv(e);
    app.paint(p.x, p.y);
    if (app.tool === 'stimulate') return;
    painting = true;
    last = p;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!painting || !last) return;
    const p = toUv(e);
    const spacing = app.brushRadius * 0.5;
    if (Math.hypot(p.x - last.x, p.y - last.y) < spacing) return;
    app.paint(p.x, p.y);
    last = p;
  });

  const stop = () => {
    painting = false;
    last = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}
