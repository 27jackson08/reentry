# Results

Two experiments run by script against the deployed model (`scripts/experiments/`), plus the pacing findings. Every number here was produced by the code in this repository on the default 0.4 mm grid; the CSVs sit next to the figures in `docs/results/`.

Reproduce with a local preview server running:

```sh
npm run build && npm run preview -- --port 4173
node scripts/experiments/critical-mass.mjs http://localhost:4173 docs/results/critical-mass.csv
node scripts/experiments/defib-threshold.mjs http://localhost:4173 docs/results/defib-threshold.csv
node scripts/experiments/plot.mjs docs/results
```

The scripts open a headed Chromium so the real GPU is used; headless SwiftShader is about fifty times slower at 512².

## 1. Critical mass for reentry

**Question.** How large must a sheet be for reentry to sustain itself? Garrey (1914) cut strips from fibrillating hearts and found fibrillation stopped below a critical tissue mass. In a model the question becomes: how many wavelengths of tissue does a rotor need?

**Method.** For five parameter sets, square sheets from 5.1 to 20.5 cm (128 to 512 cells at 0.4 mm, so spacing and numerical error are the same in every run), identical S1-S2 induction, 8 s cap. Survival is the last time any probe cell exceeded u = 0.5; runs still active at 8 s are censored (open markers).

![Reentry survival versus sheet size](results/critical-mass.svg)

| Preset (APD90, wavelength ≈ CV×APD) | 5.1 cm    | 7.7 cm    | 10.2 cm   | 12.8 cm   | 15.4 cm   | 17.9 cm   | 20.5 cm   |
| ----------------------------------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| set1 (161 ms, 5.1 cm)               | sustained | sustained | sustained | sustained | sustained | sustained | sustained |
| set3 (268 ms, 8.4 cm)               | 0.6 s     | 1.0 s     | 1.6 s     | 2.5 s     | 6.2 s     | sustained | sustained |
| set8 (178 ms, 4.5 cm)               | 1.7 s     | 1.7 s     | 4.0 s     | 4.1 s     | 6.5 s     | sustained | sustained |
| set10 (171 ms, 8.3 cm)              | sustained | sustained | sustained | sustained | sustained | sustained | sustained |
| mlr1 (244 ms, 10.3 cm)              | 0.3 s     | sustained | 4.5 s     | sustained | sustained | sustained | sustained |

Wavelength uses the 0.4 mm conduction velocities from docs/validation.md. "Sustained" means still active at the 8 s cap.

**Reading.** Two regimes. Sets 1 and 10 have short action potentials and wavelengths near 5 to 8 cm, and a single rotor fits on even the 5 cm sheet: they sustained in every run. Sets 3 and 8 are the breakup sets. Their survival rises monotonically with size, from under a second on 5 cm to about 6 s on 15 cm, and only the 18 and 20 cm sheets (roughly two wavelengths for set 3) kept them going for the full 8 s, with 5 to 11 rotors present at the end. For these sets fibrillation is a finite-size phenomenon: wavelets need room to be born faster than they die at the edges, which is Garrey's observation in model form. MLR-I, with the longest wavelength, is the ragged case: sustained at 7.7 cm, dead at 10.2 cm, sustained from 12.8 cm up. With one rotor and one run per size, whether the tip drifts into an edge in the first seconds is a matter of its birthplace, so a single non-monotonic point is drift, not a threshold. Repeating with several S2 timings would smooth it.

## 2. Defibrillation threshold

**Question.** How strong does a uniform 5 ms current have to be to terminate reentry, and does fibrillation need more than a stable rotor?

**Method.** Shock amplitudes 0.01 to 0.6 (du/dt units, fine steps around the threshold), delivered at three timings a third of a cycle apart, to the set 1 rotor at 3 s and to set 3 fibrillation at 2.5 s. Terminated means no probe cell above u = 0.5 at 1.5 s after the shock. Runs where fibrillation had already self-terminated before the shock are excluded.

![Fraction of shocks that terminate versus amplitude](results/defib-threshold.svg)

| Amplitude            | 0.01 | 0.02 | 0.024 | 0.026 | 0.028 | 0.03 | 0.034 | 0.04 | 0.06 | 0.1 | 0.2 | 0.4 | 0.6 |
| -------------------- | ---- | ---- | ----- | ----- | ----- | ---- | ----- | ---- | ---- | --- | --- | --- | --- |
| stable rotor (set 1) | 0/3  | 0/3  | 0/3   | 0/3   | 0/3   | 0/3  | 1/3   | 3/3  | 3/3  | 3/3 | 3/3 | 3/3 | 3/3 |
| fibrillation (set 3) | 0/3  | 0/3  | 0/3   | 0/3   | 0/3   | 0/3  | 0/3   | 3/3  | 3/3  | 3/3 | 3/3 | 3/3 | 3/3 |

Entries are shocks that terminated out of three timings.

**Reading.** A step, not a curve. Every shock of 0.04 or more terminated both the rotor and the fibrillation at every timing; nothing at 0.030 or below did; 0.034 terminated the rotor once in three. Fibrillation needed no more than the rotor. Failed shocks were not harmless: the 0.02 shock left the set 1 rotor fragmented into seven tips at one timing, the re-induction effect of a sub-threshold shock. The threshold is where it has to be. During the 5 ms pulse a resting cell obeys du/dt = I − u/τ₀, so it reaches u = I·τ₀·(1 − e^(−5/τ₀)) = 3.75·I for set 1 (τ₀ = 8.3 ms). Reaching the excitation threshold u_c = 0.13 therefore needs I = 0.035, which is exactly where the sweep crosses (0.034 marginal, 0.04 certain). For set 3 (τ₀ = 12.5 ms) the same arithmetic gives 0.032, and partially recovered cells with a low fast-gate value need a little more, which is why 0.034 still fails there. So in a monodomain model with a uniform field, the defibrillation threshold is the excitation threshold of recovered tissue, independent of timing and of whether the arrhythmia is a rotor or fibrillation: the shock simply excites everything excitable at once, and the fronts have nowhere to go. Real hearts are not like this. Clinical defibrillation thresholds are an order of magnitude above pacing thresholds and depend on waveform, timing and electrode geometry, because a real shock polarizes tissue non-uniformly through the bidomain (virtual electrodes) and can launch new wavefronts of its own. That gap between this table and the clinic is the clearest demonstration in the project of what the monodomain simplification leaves out.

## 3. Antitachycardia pacing

**Question.** Can a burst of fast pacing, what an ICD tries before it shocks, terminate the reentry?

**Method.** Ten 2 ms beats from a site near the top-left corner, cycle lengths 200 to 390 ms, delivered to the set 1 rotor at 3 s (free rotor, period 395 ms) and to the same rotor anchored on a 1.2 cm scar at (0.40, 0.50) (anatomical reentry, period 232 ms). Activity and rotor count read 2.5 to 4 s after the burst.

| Site                                    | Cycle length | 10 beats                               | 20 beats                               |
| --------------------------------------- | ------------ | -------------------------------------- | -------------------------------------- |
| far: (0.20, 0.80), ~9 cm from the scar  | 160 ms       | continues (activity 0.65, 0 free tips) | continues (activity 0.66, 0 free tips) |
| far: (0.20, 0.80), ~9 cm from the scar  | 180 ms       | continues (activity 0.59, 0 free tips) | continues (activity 0.59, 0 free tips) |
| far: (0.20, 0.80), ~9 cm from the scar  | 200 ms       | continues (activity 0.63, 0 free tips) | continues (activity 0.64, 0 free tips) |
| far: (0.20, 0.80), ~9 cm from the scar  | 215 ms       | continues (activity 0.63, 0 free tips) | continues (activity 0.64, 0 free tips) |
| far: (0.20, 0.80), ~9 cm from the scar  | 230 ms       | continues (activity 0.65, 0 free tips) | continues (activity 0.63, 0 free tips) |
| near: (0.25, 0.50), ~2 cm from the scar | 160 ms       | continues (activity 0.65, 3 free tips) | continues (activity 0.67, 4 free tips) |
| near: (0.25, 0.50), ~2 cm from the scar | 180 ms       | continues (activity 0.66, 0 free tips) | continues (activity 0.66, 0 free tips) |
| near: (0.25, 0.50), ~2 cm from the scar | 200 ms       | continues (activity 0.65, 0 free tips) | continues (activity 0.65, 0 free tips) |
| near: (0.25, 0.50), ~2 cm from the scar | 215 ms       | continues (activity 0.63, 0 free tips) | continues (activity 0.65, 0 free tips) |
| near: (0.25, 0.50), ~2 cm from the scar | 230 ms       | continues (activity 0.65, 0 free tips) | continues (activity 0.63, 0 free tips) |

The free rotor (no scar, period 395 ms) was swept separately at 200, 240, 280, 320 and 360 ms with ten beats from the far site: activity continued in every case (0.62 to 0.71 after the burst), and 280 ms left six free tips, i.e. the burst broke the rotor into wavelets rather than ending it.

**Reading.** No condition terminated either form of reentry: not the free rotor, and not the anchored circuit at cycle lengths from 69 % to 99 % of its 232 ms period, from near or far, with ten or twenty beats. The anchored runs end with zero free tips, meaning the circulating wave is still the one around the scar. This is the textbook failure mode of antitachycardia pacing, entrainment without termination. A paced wave that reaches the circuit annihilates the circulating front antidromically and continues orthodromically, becoming the new circulating wave: the rhythm is reset, not stopped. Termination needs the orthodromic wave to block as well, which requires it to arrive while the tissue ahead is still refractory, i.e. a narrow excitable gap. Around a 1.2 cm obstacle in homogeneous tissue the gap is wide (232 ms cycle, 161 ms action potential), so there is always room for the wave to keep going. Clinically, ATP succeeds on reentry through slow-conducting scar isthmuses, where the gap is small and the circuit is long; it is known to fail on fast, functional rotors and on fibrillation. The model reproduces the failure modes faithfully. Reproducing the success would need a slow-conduction channel through the scar, which the mask (conducting or not, nothing in between) cannot express. That is the obvious next experiment: a mask with a reduced-diffusion isthmus.

## Caveats

- One run per condition. The induction is deterministic, so repeats would be identical unless the timing or site were varied; the three shock timings are the only replication.
- The 0.4 mm grid slows conduction by about 7 % relative to the papers' 0.25 mm (docs/PHYSICS.md §3), which shortens wavelengths slightly and so lowers the critical size a little.
- Survival is capped at 8 s. A rotor that would have died at 12 s counts as sustained.
- Monodomain shock: see docs/PHYSICS.md §4.
