# Physics and numerics

This document states exactly what Reentry simulates, how it is discretized, what was checked, and where the model stops being a heart.

## 1. The model

Reentry solves the three-variable Fenton-Karma model (Fenton & Karma, _Chaos_ 8:20, 1998, doi:10.1063/1.166311) on a two-dimensional monodomain sheet:

```
∂u/∂t = D ∇²u − (J_fi + J_so + J_si) + I_stim + I_shock
∂v/∂t = (1 − p)(1 − v)/τ_v⁻(u) − p·v/τ_v⁺
∂w/∂t = (1 − p)(1 − w)/τ_w⁻    − p·w/τ_w⁺

p = H(u − u_c),  q = H(u − u_v)
τ_v⁻(u) = q·τ_v⁻(high) + (1 − q)·τ_v⁻(low)

J_fi = −(v/τ_d)·p·(1 − u)(u − u_c)            fast inward (sodium-like)
J_so =  (u/τ_0)(1 − p) + p/τ_r                 slow outward (potassium-like)
J_si = −(w/(2τ_si))·(1 + tanh(k(u − u_c^si)))  slow inward (calcium-like)
```

- `u` is a dimensionless membrane voltage (0 at rest, about 1 at the plateau; some sets overshoot). Time is in milliseconds, space in centimetres.
- `v` and `w` are inactivation gates of the fast and slow inward currents.
- `D = 0.001 cm²/ms` is the diffusion coefficient used throughout the 1998 and 2002 papers.
- The two values of τ_v⁻ are named by the voltage range they apply to (`tauVMinusLow` for u < u_v, `tauVMinusHigh` for u ≥ u_v) because the 1998 and 2002 papers index them in opposite orders.

The equations are written once in TypeScript (`src/model/fentonKarma.ts`) and once in GLSL (`src/gpu/shaders/step.frag`). A Playwright test runs both on the same initial condition and requires the mean absolute difference in `u` after 400 steps to be below 2×10⁻³, with fewer than 2 % of cells differing by more than 0.02 (a few wavefront cells cross the threshold on different steps in float32 and float64).

## 2. Parameter sets

| Id           | Name               | Source                                                                         |
| ------------ | ------------------ | ------------------------------------------------------------------------------ |
| set1 … set10 | Table I, sets 1–10 | Fenton, Cherry, Hastings & Evans, _Chaos_ 12:852 (2002), doi:10.1063/1.1504242 |
| set3         | identical to BR    | Fenton & Karma 1998                                                            |
| set10        | identical to GP    | Fenton & Karma 1998                                                            |
| mlr1         | MLR-I              | Fenton & Karma 1998                                                            |

Values were transcribed from the cardiax transcription of the 2002 table and cross-checked against the Nektar++ `FentonKarma.cpp` sets (BR, MBR, MLR-I, GP) and the ibiblio MLR-I demo. Three entries disagree between sources and were resolved as follows:

| Set | Parameter | Sources                           | Used  | Reason                                                |
| --- | --------- | --------------------------------- | ----- | ----------------------------------------------------- |
| 1   | u_v       | cardiax 0.0055; Nektar++ MBR 0.04 | 0.055 | cardiax shows a 10× pattern also in set 10            |
| 10  | u_v       | cardiax 0.0025; Nektar++ GP 0.025 | 0.025 | Nektar++ GP matches the 1998 table                    |
| 8   | τ_v⁻(low) | cardiax 19.06                     | 19.6  | parent BR value; difference is dynamically negligible |

Sets 2 and 7 have no slow inward current (τ_si = ∞, τ_w± = ∞). They are stored with `Infinity` and passed to the shader as a rate of zero.

Sets with τ_d < 0.2 ms (set 10, MLR-I) run at dt = 0.05 ms; the rest at 0.1 ms.

## 3. Numerics

| Quantity       | Value                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Grid           | 512 × 512 by default (256 and 1024 selectable)                                                                     |
| Spacing Δx     | 0.04 cm default (20.5 cm sheet); 0.025 cm selectable (reference resolution of the papers)                          |
| Time step      | 0.1 ms, or 0.05 ms when τ_d < 0.2 ms                                                                               |
| Voltage update | forward Euler                                                                                                      |
| Gate update    | Rush-Larsen: exact exponential relaxation toward the gate's target for the current `p`, which is stable for any dt |
| Laplacian      | 9-point isotropic stencil, (4·Σedges + Σcorners − 20u)/(6Δx²)                                                      |
| Boundaries     | no-flux. Outside the sheet, `CLAMP_TO_EDGE` sampling returns the centre cell, so the difference term vanishes      |
| Scar           | a mask. Scar cells are held at rest and excluded from their neighbours' Laplacian, which is a no-flux wall         |
| Storage        | RGBA32F textures, ping-pong. Half floats lose the ~10⁻⁴ per-step gate increments                                   |

`checkStability()` refuses any (dt, Δx, D) with dt > 0.8·Δx²/(4D) or dt > τ_d/2.

### Cost of the coarser default grid

The papers use Δx = 0.025 cm. A 512² sheet at that spacing is 12.8 cm, about one wavelength for most sets, and rotors hit the edges and die. The default is therefore Δx = 0.04 cm (20.5 cm), with the finer spacing one click away. The price is conduction velocity, measured on a 6 cm cable:

| Spacing  | CV, set 3 | CV, set 10 | CV, MLR-I |
| -------- | --------- | ---------- | --------- |
| 0.025 cm | 33.7 cm/s | 52.4 cm/s  | 45.2 cm/s |
| 0.035 cm | 32.1      | 49.8       | 43.2      |
| 0.04 cm  | 31.4      | 48.6       | 42.4      |
| 0.05 cm  | 29.9      | 45.9       | 40.5      |

About 7 % slow at the default. Action potential duration is unaffected (it is a single-cell property). See `docs/validation.md` for every preset.

## 4. Protocols

**S1-S2 cross-field induction.** S1 is a 2 ms, 0.3 current pulse in a strip on the left edge, launching a plane wave rightward. A probe on the S2 boundary (x = 0.5, y = 0.25) watches the mean voltage in a 64×64 downsample of the sheet. When that voltage first drops below 0.5 (the wave back has reached the boundary), S2 fires the same pulse into the lower-left quadrant. While the protocol is waiting, the sheet is stepped in 2 ms chunks with a synchronous probe after each, so S2 timing does not depend on playback speed (a 10 ms late S2 moves the rotor's birthplace enough to change whether it drifts into an edge). Tissue to the right of the boundary is still at plateau and blocks; tissue to the left repolarized earlier and conducts; the free end of the S2 front at the corner curls into a rotor. The same timing rule induces reentry in all eleven presets on the default sheet (`scripts/survey.mjs`).

**Antitachycardia pacing.** A burst of point stimuli (default ten, 2 ms, current 0.3) at a chosen cycle length from a site near the top-left corner, scheduled inside the GPU step loop so each beat lands on the time step. Pacing faster than the arrhythmia entrains tissue outward from the site; termination requires the paced front to enter the reentrant circuit's excitable gap and collide with the rotor. In this model a free (functional) rotor was not terminated at any cycle length tried (200–360 ms, ten beats, see docs/RESULTS.md); it is pushed and drifts. Reentry anchored on a scar is the classical ATP target and is tested there too.

**Defibrillation.** A uniform transmembrane current for 5 ms, amplitude set by the slider. In a monodomain model a uniform field cannot create the virtual electrodes that real shocks rely on (those need the bidomain), so this is the standard teaching simplification: the shock excites every cell that can be excited, leaving nothing for the fronts to invade. Weak shocks excite only recovered tissue and can fail or even re-induce; strong shocks terminate. The Playwright suite checks both outcomes.

**ECG rhythm readout.** The dominant cycle length is the earliest strong peak of the autocorrelation of the last 2.5 s of pseudo-ECG (harmonics at 2T and 3T are as tall as the peak at T, so the earliest within 85 % of the tallest wins). Regularity is the autocorrelation at that lag; at or above 0.65 the label reads "regular". Measured on this implementation: set 1's rotor scores 0.85–0.9 at 395 ms; set 3's fibrillation scores 0.2–0.65 with a wandering cycle length.

**Rotor tips.** Phase singularities are counted on the 64×64 probe grid using a time-delay embedding of voltage, θ = atan2(u(t − 40 ms) − 0.45, u(t) − 0.45), the construction used for optical-mapping data (Bray & Wikswo 2002). Around each 2×2 plaquette the wrapped phase differences sum to ±2π at a tip and 0 elsewhere. Singularities within 2.5 cells merge: opposite charges annihilate, equal charges collapse to one, because a rotor core on a 3 mm grid often registers as a tip plus a spurious pair. The delay and origin were chosen on recorded probes: stable rotors (sets 1 and 10) count exactly one in every snapshot; set 3's fibrillation counts 6 to 17. Rings on the sheet mark each tip; the tick shows the sense of rotation.

**Pseudo-ECG.** φ(r_e) = −∫ ∇u · ∇(1/|r − r_e|) dA over tissue, with the electrode 2 cm above the sheet centre, evaluated on the 64×64 downsample each frame (Plonsey & Barr). It is unscaled; the scope auto-gains. Unit tests check zero for uniform tissue, sign reversal with electrode position, and linearity.

## 5. Experiments

Two experiments are run by scripts in `scripts/experiments/` against the deployed model; the CSVs, figures and discussion are in `docs/RESULTS.md`.

- **Critical mass.** For five parameter sets, sheets of 5 to 20 cm at fixed 0.4 mm spacing, induced identically, survival time of activity (8 s cap).
- **Defibrillation threshold.** Shock amplitude 0.02 to 0.6 at three timings, for the stable set 1 rotor and set 3 fibrillation; termination is activity zero 1.5 s after the shock.

## 6. Observed behaviour

Each preset was induced on the default sheet and run for 6 s of simulated time. Descriptions in the preset menu report what happened, not what the 2002 paper's section headings promise. Several of the paper's breakup mechanisms need longer runs, larger sheets, specific τ_d sweeps, or three dimensions, and were not reproduced here.

| Preset      | Observed at 6 s                                                         |
| ----------- | ----------------------------------------------------------------------- |
| Set 1 (MBR) | stable single rotor                                                     |
| Set 2       | stable rotor, broad repolarization gradient                             |
| Set 3 (BR)  | breakup into fibrillation; self-terminated between 4 and 6 s in one run |
| Set 4       | breakup, many wavelets                                                  |
| Set 5       | breakup, fine wavelets                                                  |
| Set 6       | several coexisting rotors                                               |
| Set 7       | stable rotor                                                            |
| Set 8       | stable rotor, tight core                                                |
| Set 9       | breakup                                                                 |
| Set 10 (GP) | stable rotor                                                            |
| MLR-I       | stable rotor, large core                                                |

## 7. What this is not

- Not a heart. A flat, homogeneous sheet with at most one uniform fibre direction, no thickness, no anatomy, no Purkinje system, no autonomic input.
- Not a cell. Three variables stand in for dozens of ionic currents; the model is fit to reproduce action potential shape, restitution and conduction velocity of specific ionic models, nothing else.
- Not a bidomain. Shocks are a uniform current, see above.
- Not at the papers' resolution by default. See section 3.
- Not clinical. Nothing here should inform the treatment of a person.
