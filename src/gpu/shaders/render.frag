#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uMask;
uniform sampler2D uVoltageLut; // 256x1
uniform sampler2D uPhaseLut;   // 256x1
uniform int uView;             // 0 voltage, 1 phase, 2 gates
uniform vec2 uResolution;      // canvas pixels, for the scar hatch

in vec2 vUv;
out vec4 outColor;

const vec3 SCAR_BASE = vec3(0.16, 0.17, 0.20);
const vec3 SCAR_HATCH = vec3(0.22, 0.23, 0.27);

vec3 scar() {
  vec2 px = vUv * uResolution;
  float stripe = step(0.5, fract((px.x + px.y) / 10.0));
  return mix(SCAR_BASE, SCAR_HATCH, stripe);
}

void main() {
  if (texture(uMask, vUv).r < 0.5) {
    outColor = vec4(scar(), 1.0);
    return;
  }
  vec3 s = texture(uState, vUv).rgb;
  vec3 color;
  if (uView == 1) {
    // Phase in the (u, v) plane around a point inside the limit cycle.
    float phase = atan(s.g - 0.5, s.r - 0.45) / 6.2831853 + 0.5;
    color = texture(uPhaseLut, vec2(phase, 0.5)).rgb;
  } else if (uView == 2) {
    color = vec3(clamp(s.r, 0.0, 1.0), s.g * 0.85, s.b * 0.85);
  } else {
    color = texture(uVoltageLut, vec2(clamp(s.r, 0.0, 1.0), 0.5)).rgb;
  }
  outColor = vec4(color, 1.0);
}
