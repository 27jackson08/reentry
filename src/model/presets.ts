import type { FkParams } from './fentonKarma';

export interface Preset {
  readonly id: string;
  readonly name: string;
  /**
   * What this implementation shows after S1-S2 induction on the default 20 cm
   * sheet at 0.4 mm, observed over 6 s. The 2002 paper's mechanism labels are
   * in docs/PHYSICS.md; several of its breakups need longer runs or 3D.
   */
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
    'Breaks up. The original Beeler-Reuter fit has steep restitution (APD90 98 → 268 ms across the table in docs/validation.md): the first rotor fragments into fibrillation within seconds, and in a bounded sheet it can extinguish itself.',
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
    'Set 1 · Modified BR (MBR)',
    'Stable rotor. Flat restitution: one spiral that keeps its period. The clean baseline.',
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
    'Stable rotor without a slow inward current: triangular action potentials and a broad repolarization gradient.',
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
    'Set 4',
    'Breaks up. The rotor sheds wavelets until the sheet is fibrillating.',
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
    'Set 5',
    'Breaks up into fine wavelets. Slow conduction and a long action potential.',
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
    'Set 6',
    'Multiple rotors. The first spiral spawns daughters; several coexist and compete.',
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
    'Set 7 · No slow inward current',
    'Stable rotor without a slow inward current: a large, slowly turning spiral.',
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
  preset('set8', 'Set 8', 'Stable rotor with a tight core and a long period.', FENTON2002, {
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
  }),
  preset(
    'set9',
    'Set 9',
    'Breaks up. Short action potentials; wavelets everywhere within two seconds.',
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
    'Set 10 · Guinea pig (GP)',
    'Stable rotor. The guinea-pig fit from 1998: fast conduction and a smooth spiral.',
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
    'Stable rotor with a long action potential and a large core. The classic 1998 MLR-I fit.',
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
