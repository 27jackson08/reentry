#version 300 es
// Box-filter the state down to a small grid the CPU reads back each frame.
// r = mean u, g = max u, b = mean v, a = unused.
precision highp float;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uMask;
uniform int uBlock; // source texels per probe texel along each axis
uniform vec2 uTexel;

in vec2 vUv;
out vec4 outProbe;

void main() {
  vec2 origin = floor(vUv / (uTexel * float(uBlock))) * float(uBlock);
  float sumU = 0.0;
  float maxU = 0.0;
  float sumV = 0.0;
  float count = 0.0;
  for (int j = 0; j < 64; j++) {
    if (j >= uBlock) break;
    for (int i = 0; i < 64; i++) {
      if (i >= uBlock) break;
      vec2 uv = (origin + vec2(float(i), float(j)) + 0.5) * uTexel;
      if (texture(uMask, uv).r < 0.5) continue;
      vec3 s = texture(uState, uv).rgb;
      sumU += s.r;
      maxU = max(maxU, s.r);
      sumV += s.g;
      count += 1.0;
    }
  }
  float inv = count > 0.0 ? 1.0 / count : 0.0;
  outProbe = vec4(sumU * inv, maxU, sumV * inv, count);
}
