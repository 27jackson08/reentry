export class ShaderCompileError extends Error {
  constructor(stage: string, log: string) {
    super(`${stage} shader failed to compile:\n${log}`);
    this.name = 'ShaderCompileError';
  }
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  stage: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no log)';
    gl.deleteShader(shader);
    throw new ShaderCompileError(stage, log);
  }
  return shader;
}

export interface Program {
  readonly handle: WebGLProgram;
  readonly uniform: (name: string) => WebGLUniformLocation | null;
}

export function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vert, 'vertex');
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag, 'fragment');
  const handle = gl.createProgram();
  if (!handle) throw new Error('createProgram returned null');
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(handle) ?? '(no log)';
    gl.deleteProgram(handle);
    throw new Error(`Program failed to link:\n${log}`);
  }
  const cache = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(handle, name));
    return cache.get(name) ?? null;
  };
  return { handle, uniform };
}

/** Draws the full-screen triangle produced by quad.vert. */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
