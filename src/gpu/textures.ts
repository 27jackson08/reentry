export interface RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture returned null');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createFloatTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Float32Array | null = null,
): RenderTarget {
  const texture = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('createFramebuffer returned null');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Float framebuffer incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

export function uploadFloatTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  data: Float32Array,
): void {
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, data);
}

/** R8 normalizes bytes to [0, 1], so a 0/1 mask must be stored as 0/255 to read as 0.0/1.0. */
function toTextureBytes(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 255 : 0;
  return out;
}

/** Single-channel 8-bit texture used for the tissue mask (1 = tissue, 0 = scar). */
export function createMaskTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  mask: Uint8Array,
): WebGLTexture {
  const texture = createTexture(gl);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    width,
    height,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    toTextureBytes(mask),
  );
  return texture;
}

export function uploadMaskTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
  mask: Uint8Array,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    width,
    height,
    gl.RED,
    gl.UNSIGNED_BYTE,
    toTextureBytes(mask),
  );
}

/** 256x1 RGBA8 lookup texture with linear filtering, for colormaps. */
export function createLutTexture(gl: WebGL2RenderingContext, rgba: Uint8Array): WebGLTexture {
  const texture = createTexture(gl);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rgba.length / 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  return texture;
}

export class PingPong {
  private targets: readonly [RenderTarget, RenderTarget];
  private index = 0;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, initial: Float32Array) {
    this.targets = [
      createFloatTarget(gl, width, height, initial),
      createFloatTarget(gl, width, height, initial),
    ];
  }

  get read(): RenderTarget {
    return this.targets[this.index] as RenderTarget;
  }

  get write(): RenderTarget {
    return this.targets[1 - this.index] as RenderTarget;
  }

  swap(): void {
    this.index = 1 - this.index;
  }
}
