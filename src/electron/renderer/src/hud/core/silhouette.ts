/** Anatomical silhouette maths for the sentient core. */

export interface CoreGeometry {
  cx: number;
  bustHeight: number;
  bustTopY: number;
  headHalfW: number;
  eyeY: number;
  eyeOffsetX: number;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalized half-width of the bust: v = 0 crown, v = 1 chest. */
export function getBustWidth(v: number): number {
  if (v < 0.16) {
    const t = v / 0.16;
    return Math.pow(1 - Math.pow(1 - t, 2.2), 0.5) * 0.98;
  }
  if (v < 0.25) return lerp(0.98, 1.0, smoothstep(0.16, 0.25, v));
  if (v < 0.38) {
    const base = lerp(1.0, 0.91, smoothstep(0.25, 0.38, v));
    const earT = (v - 0.26) / 0.11;
    const earBump = earT > 0 && earT < 1 ? Math.pow(Math.sin(earT * Math.PI), 1.3) * 0.12 : 0;
    return base + earBump;
  }
  if (v < 0.5) {
    const t = smoothstep(0.38, 0.5, v);
    const jawAngle = Math.exp(-Math.pow((v - 0.415) / 0.032, 2)) * 0.095;
    return lerp(0.91, 0.65, t) + jawAngle;
  }
  if (v < 0.64) {
    const trapSlope = Math.pow(smoothstep(0.53, 0.64, v), 1.35) * 0.78;
    return 0.65 + trapSlope;
  }
  const shoulderCurve = smoothstep(0.64, 0.78, v) * 1.18;
  const deltoidCap = smoothstep(0.74, 0.92, v) * 0.54;
  return 1.43 + shoulderCurve + deltoidCap;
}

export function coreGeometry(width: number, height: number): CoreGeometry {
  const bustHeight = Math.min(height * 0.86, width * 0.62);
  const bustTopY = height * 0.13;
  const headHalfW = bustHeight * 0.185;
  return {
    cx: width * 0.5,
    bustHeight,
    bustTopY,
    headHalfW,
    eyeY: bustTopY + bustHeight * 0.275,
    eyeOffsetX: headHalfW * 0.34,
  };
}

/** Deterministic pseudo-random generator so the root network is stable. */
export function createRng(seed: number): () => number {
  let value = seed;
  return (): number => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
