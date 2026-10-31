#version 300 es
// One explicit time step of the Fenton-Karma model on a masked sheet.
// Mirrors src/model/fentonKarma.ts and src/model/cpuSolver.ts exactly.
precision highp float;
precision highp sampler2D;

uniform sampler2D uState; // r = u, g = v, b = w, a = mask (1 tissue, 0 scar) as of last step
uniform sampler2D uMask;  // r = 1 tissue, 0 scar; authoritative, propagated into alpha each step
uniform vec2 uTexel;      // 1 / grid size
uniform float uDt;        // ms
uniform float uDiffOverDx2; // D / dx²

// Rates (1/τ). A disabled current or gate has rate 0.
uniform float invTauVPlus, invTauVMinusLow, invTauVMinusHigh;
uniform float invTauWPlus, invTauWMinus;
uniform float invTauD, invTau0, invTauR, invTauSi;
uniform float kSi, uCsi, uC, uV;

// Stimulus: kind 0 none, 1 rectangle (x0, y0, x1, y1), 2 ellipse (cx, cy, rx, ry), in uv.
uniform int uStimKind;
uniform vec4 uStimShape;
uniform float uStimCurrent;
// Uniform transmembrane current pulse applied everywhere (defibrillation shock).
uniform float uShockCurrent;

in vec2 vUv;
out vec4 outState;

const vec4 SCAR = vec4(0.0, 1.0, 1.0, 0.0);

float neighbour(vec2 offset, float centre) {
  // One fetch per neighbour: the mask rides in alpha. CLAMP_TO_EDGE returns the
  // centre texel outside the domain, so the difference is zero there: a no-flux
  // boundary for free. Scar is masked out explicitly, which is the same no-flux
  // condition at an internal wall.
  vec4 n = texture(uState, vUv + offset * uTexel);
  return n.a < 0.5 ? 0.0 : n.r - centre;
}

bool inStimulus() {
  if (uStimKind == 1) {
    return all(greaterThanEqual(vUv, uStimShape.xy)) && all(lessThanEqual(vUv, uStimShape.zw));
  }
  if (uStimKind == 2) {
    vec2 d = (vUv - uStimShape.xy) / uStimShape.zw;
    return dot(d, d) <= 1.0;
  }
  return false;
}

void main() {
  if (texture(uMask, vUv).r < 0.5) {
    outState = SCAR;
    return;
  }
  vec3 s = texture(uState, vUv).rgb;
  float u = s.r;
  float v = s.g;
  float w = s.b;

  float edges = neighbour(vec2(1.0, 0.0), u) + neighbour(vec2(-1.0, 0.0), u)
              + neighbour(vec2(0.0, 1.0), u) + neighbour(vec2(0.0, -1.0), u);
  float corners = neighbour(vec2(1.0, 1.0), u) + neighbour(vec2(-1.0, 1.0), u)
                + neighbour(vec2(1.0, -1.0), u) + neighbour(vec2(-1.0, -1.0), u);
  float lap = uDiffOverDx2 * (4.0 * edges + corners) / 6.0;

  bool above = u >= uC;
  float jfi = above ? -v * invTauD * (1.0 - u) * (u - uC) : 0.0;
  float jso = above ? invTauR : u * invTau0;
  float jsi = -w * 0.5 * invTauSi * (1.0 + tanh(kSi * (u - uCsi)));
  float stim = inStimulus() ? uStimCurrent : 0.0;

  float uNew = u + uDt * (-(jfi + jso + jsi) + stim + uShockCurrent + lap);

  float target = above ? 0.0 : 1.0;
  float invTauV = above ? invTauVPlus : (u >= uV ? invTauVMinusHigh : invTauVMinusLow);
  float invTauW = above ? invTauWPlus : invTauWMinus;
  float vNew = target + (v - target) * exp(-uDt * invTauV);
  float wNew = target + (w - target) * exp(-uDt * invTauW);

  outState = vec4(uNew, vNew, wNew, 1.0);
}
