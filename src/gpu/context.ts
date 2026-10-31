export class GpuUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpuUnsupportedError';
  }
}

export interface GpuContext {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
}

/**
 * Acquire WebGL2 with float render targets. The solver stores u, v, w in
 * RGBA32F textures: half floats lose the ~1e-4 per-step gate increments.
 */
export function createContext(canvas: HTMLCanvasElement): GpuContext {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    throw new GpuUnsupportedError('WebGL2 is not available in this browser.');
  }
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new GpuUnsupportedError(
      'This GPU cannot render to floating-point textures (EXT_color_buffer_float), which the solver needs.',
    );
  }
  return { gl, canvas };
}
