/**
 * Fibre anisotropy as a constant diffusion tensor. Cardiac muscle conducts
 * two to three times faster along fibres than across; since CV scales with
 * √D, a conductivity ratio of 4 to 9 gives that. `ratio` = D_along / D_across
 * with D_along fixed at the preset's D, so the stability limit is unchanged.
 */

export interface Fibres {
  /** D_along / D_across, 1 = isotropic. */
  readonly ratio: number;
  /** Fibre direction, degrees from the x axis. */
  readonly angleDeg: number;
}

export interface Tensor {
  readonly dxx: number;
  readonly dxy: number;
  readonly dyy: number;
}

export const ISOTROPIC: Fibres = { ratio: 1, angleDeg: 0 };
export const MAX_RATIO = 9;

export function diffusionTensor(dAlong: number, fibres: Fibres): Tensor {
  const dAcross = dAlong / Math.max(1, fibres.ratio);
  const th = (fibres.angleDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return {
    dxx: dAlong * c * c + dAcross * s * s,
    dxy: (dAlong - dAcross) * s * c,
    dyy: dAlong * s * s + dAcross * c * c,
  };
}
