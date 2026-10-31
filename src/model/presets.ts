import type { FkParams } from './fentonKarma';

export interface Preset {
  readonly id: string;
  readonly name: string;
  /** What the viewer should expect to see after S1-S2 induction. Observed, not asserted. */
  readonly description: string;
  readonly citation: string;
  readonly params: FkParams;
  readonly dt: number;
  readonly dx: number;
  /** cm²/ms */
  readonly diffusion: number;
}

const FK1998 = 'Fenton & Karma, Chaos 8:20 (1998), doi:10.1063/1.166311, Table I';
const FENTON2002 =
  'Fenton, Cherry, Hastings & Evans, Chaos 12:852 (2002), doi:10.1063/1.1504242, Table I';

/** Fenton 2002 used D = 0.001 cm²/ms with Δx = 0.025 cm for the 2D studies. */
const D = 0.001;
const DX = 0.025;
const DT = 0.1;

function preset(
  id: string,
  name: string,
  description: string,
  citation: string,
  params: FkParams,
  dt = DT,
): Preset {
  return { id, name, description, citation, params, dt, dx: DX, diffusion: D };
}

/*
 * Parameter sets 1-10 are transcribed from the 2002 Table I via the cardiax
 * transcription (github.com/epignatelli/cardiax) and cross-checked against the
 * Nektar++ FentonKarma.cpp sets (BR = set 3, MBR ≈ set 1, GP = set 10) and the
 * ibiblio MLR-I demo. Column order in the 2002 table is (τ_v1⁻, τ_v2⁻) =
 * (low-u value, high-u value), which is the opposite of the 1998 table.
 *
 * Known discrepancies, documented in docs/PHYSICS.md:
 *  - Set 1 u_v: cardiax lists 0.0055; we use 0.055 (Nektar++ MBR uses 0.04).
 *  - Set 10 u_v: cardiax lists 0.0025; Nektar++ GP gives 0.025, which we use.
 *  - Set 8 τ_v1⁻: cardiax lists 19.06; the parent BR value is 19.6, which we use.
 */
export const PRESETS: readonly Preset[] = [
  preset(
    'set3',
    'Set 3 · Beeler-Reuter (BR)',
    'Stable spiral: the original 1998 fit. A single rotor that holds its period. Baseline.',
    `${FENTON2002}; identical to BR in ${FK1998}`,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 19.6,
      tauVMinusHigh: 1250,
      tauWPlus: 870,
      tauWMinus: 41,
      tauD: 0.25,
      tau0: 12.5,
      tauR: 33.33,
      tauSi: 29,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.04,
    },
  ),
  preset(
    'set1',
    'Set 1 · Steep APD restitution',
    'Breakup far from the core: alternans along the arm tears the wave into fibrillation.',
    FENTON2002,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 19.6,
      tauVMinusHigh: 1000,
      tauWPlus: 667,
      tauWMinus: 11,
      tauD: 0.25,
      tau0: 8.3,
      tauR: 50,
      tauSi: 45,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.055,
    },
  ),
  preset(
    'set2',
    'Set 2 · No slow inward current',
    'Short action potentials, fast meandering rotor. Slow inward current switched off.',
    FENTON2002,
    {
      tauVPlus: 10,
      tauVMinusLow: 10,
      tauVMinusHigh: 10,
      tauWPlus: Infinity,
      tauWMinus: Infinity,
      tauD: 0.25,
      tau0: 10,
      tauR: 190,
      tauSi: Infinity,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.0,
    },
  ),
  preset(
    'set4',
    'Set 4 · Biphasic restitution',
    'Rotor with a large meander; the tip traces a flower pattern around the core.',
    FENTON2002,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 15.6,
      tauVMinusHigh: 5,
      tauWPlus: 350,
      tauWMinus: 80,
      tauD: 0.407,
      tau0: 9,
      tauR: 34,
      tauSi: 26.5,
      k: 15,
      uCsi: 0.45,
      uC: 0.15,
      uV: 0.04,
    },
  ),
  preset(
    'set5',
    'Set 5 · Bistability',
    'Low excitability: tip can detach and reattach; wave fronts fail intermittently.',
    FENTON2002,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 12,
      tauVMinusHigh: 2,
      tauWPlus: 1000,
      tauWMinus: 100,
      tauD: 0.362,
      tau0: 5,
      tauR: 33.33,
      tauSi: 29,
      k: 15,
      uCsi: 0.7,
      uC: 0.13,
      uV: 0.04,
    },
  ),
  preset(
    'set6',
    'Set 6 · Tip bistability',
    'A rotor whose tip alternates between attached and detached rotation.',
    FENTON2002,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 9,
      tauVMinusHigh: 8,
      tauWPlus: 250,
      tauWMinus: 60,
      tauD: 0.395,
      tau0: 9,
      tauR: 33.33,
      tauSi: 29,
      k: 15,
      uCsi: 0.5,
      uC: 0.13,
      uV: 0.04,
    },
  ),
  preset(
    'set7',
    'Set 7 · Hypermeander',
    'No slow inward current and a wandering tip that never settles into a circle.',
    FENTON2002,
    {
      tauVPlus: 10,
      tauVMinusLow: 7,
      tauVMinusHigh: 7,
      tauWPlus: Infinity,
      tauWMinus: Infinity,
      tauD: 0.25,
      tau0: 12,
      tauR: 100,
      tauSi: Infinity,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.0,
    },
  ),
  preset(
    'set8',
    'Set 8 · Slow excitability recovery',
    'Breakup near the core: the front catches its own refractory tail and fragments.',
    FENTON2002,
    {
      tauVPlus: 13.03,
      tauVMinusLow: 19.6,
      tauVMinusHigh: 1250,
      tauWPlus: 800,
      tauWMinus: 40,
      tauD: 0.45,
      tau0: 12.5,
      tauR: 33.25,
      tauSi: 29,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.04,
    },
  ),
  preset(
    'set9',
    'Set 9 · Supernormal excitability',
    'Waves speed up just after repolarization; rotors drift and collide.',
    FENTON2002,
    {
      tauVPlus: 3.33,
      tauVMinusLow: 15,
      tauVMinusHigh: 2,
      tauWPlus: 670,
      tauWMinus: 61,
      tauD: 0.25,
      tau0: 12.5,
      tauR: 28,
      tauSi: 29,
      k: 10,
      uCsi: 0.45,
      uC: 0.13,
      uV: 0.05,
    },
  ),
  preset(
    'set10',
    'Set 10 · Guinea pig (GP), Doppler breakup',
    'A meandering rotor whose Doppler-shifted arms break up into fibrillation.',
    `${FENTON2002}; GP set in ${FK1998}`,
    {
      tauVPlus: 10,
      tauVMinusLow: 40,
      tauVMinusHigh: 333,
      tauWPlus: 1000,
      tauWMinus: 65,
      tauD: 0.115,
      tau0: 12.5,
      tauR: 25,
      tauSi: 22.22,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.025,
    },
    0.05,
  ),
  preset(
    'mlr1',
    'MLR-I · Modified Luo-Rudy',
    'Long action potential, stable rotor with a large core. The classic 1998 MLR-I fit.',
    FK1998,
    {
      tauVPlus: 10,
      tauVMinusLow: 18.2,
      tauVMinusHigh: 18.2,
      tauWPlus: 1020,
      tauWMinus: 80,
      tauD: 1 / 5.8,
      tau0: 12.5,
      tauR: 130,
      tauSi: 127,
      k: 10,
      uCsi: 0.85,
      uC: 0.13,
      uV: 0.0,
    },
    0.05,
  ),
];

export const DEFAULT_PRESET_ID = 'set3';

export function presetById(id: string): Preset {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown preset: ${id}`);
  return found;
}
