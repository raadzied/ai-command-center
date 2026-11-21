import { getBustWidth } from './silhouette';

export interface VeinPoint {
  x: number;
  v: number;
}

export interface Vein {
  pts: VeinPoint[];
  thickness: number;
  isAmber: boolean;
  phase: number;
  sparkSpeed: number;
}

interface TrunkSeed {
  x: number;
  v: number;
  ang: number;
  len: number;
  d: number;
  w: number;
  amber: boolean;
}

const TRUNK_SEEDS: TrunkSeed[] = [
  { x: 0.0, v: 0.98, ang: -Math.PI / 2, len: 0.24, d: 4, w: 2.2, amber: true },
  { x: -0.22, v: 0.98, ang: -Math.PI / 2 + 0.08, len: 0.23, d: 4, w: 1.9, amber: true },
  { x: 0.22, v: 0.98, ang: -Math.PI / 2 - 0.08, len: 0.23, d: 4, w: 1.9, amber: true },
  { x: -0.58, v: 0.96, ang: -Math.PI / 2 + 0.22, len: 0.25, d: 4, w: 1.85, amber: false },
  { x: 0.58, v: 0.96, ang: -Math.PI / 2 - 0.22, len: 0.25, d: 4, w: 1.85, amber: false },
  { x: -1.25, v: 0.97, ang: -Math.PI / 2 + 0.42, len: 0.24, d: 3, w: 1.7, amber: false },
  { x: 1.25, v: 0.97, ang: -Math.PI / 2 - 0.42, len: 0.24, d: 3, w: 1.7, amber: false },
  { x: -2.05, v: 0.96, ang: -Math.PI / 2 + 0.56, len: 0.22, d: 3, w: 1.5, amber: false },
  { x: 2.05, v: 0.96, ang: -Math.PI / 2 - 0.56, len: 0.22, d: 3, w: 1.5, amber: false },
  { x: -0.78, v: 0.44, ang: -Math.PI / 2 - 0.12, len: 0.19, d: 4, w: 1.65, amber: false },
  { x: 0.78, v: 0.44, ang: -Math.PI / 2 + 0.12, len: 0.19, d: 4, w: 1.65, amber: false },
  { x: -0.42, v: 0.49, ang: -Math.PI / 2 + 0.05, len: 0.18, d: 3, w: 1.5, amber: true },
  { x: 0.42, v: 0.49, ang: -Math.PI / 2 - 0.05, len: 0.18, d: 3, w: 1.5, amber: true },
  { x: -0.82, v: 0.24, ang: -Math.PI / 2 + 0.35, len: 0.15, d: 3, w: 1.4, amber: false },
  { x: 0.82, v: 0.24, ang: -Math.PI / 2 - 0.35, len: 0.15, d: 3, w: 1.4, amber: false },
];

/** Builds the branching organic root/vein skeleton that forms the core body. */
export function buildVeins(rand: () => number): Vein[] {
  const veins: Vein[] = [];

  const addRootBranch = (
    x0: number,
    v0: number,
    angle: number,
    length: number,
    depth: number,
    thickness: number,
    isAmber: boolean,
    sideSign: number,
  ): void => {
    if (depth <= 0 || length < 0.025) return;

    const steps = 10;
    const pts: VeinPoint[] = [{ x: x0, v: v0 }];
    let cx = x0;
    let cv = v0;
    let curAngle = angle;

    for (let i = 1; i <= steps; i += 1) {
      curAngle += (rand() - 0.5) * 0.34;
      const stepLen = length / steps;
      let nx = cx + Math.cos(curAngle) * stepLen * 1.55;
      let nv = cv + Math.sin(curAngle) * stepLen;

      nv = Math.max(0.015, Math.min(0.99, nv));
      const maxW = getBustWidth(nv) * 0.97;
      if (Math.abs(nx) > maxW) {
        nx = Math.sign(nx) * maxW;
        curAngle = nv > 0.5 ? -Math.PI * 0.5 + sideSign * 0.25 : -Math.PI * 0.5 - sideSign * 0.22;
      }

      pts.push({ x: nx, v: nv });
      cx = nx;
      cv = nv;

      if (i === 5 && depth > 1) {
        const forkAngle = curAngle + (rand() > 0.5 ? 1 : -1) * (0.35 + rand() * 0.32);
        addRootBranch(
          cx,
          cv,
          forkAngle,
          length * 0.62,
          depth - 1,
          thickness * 0.68,
          isAmber || (nv < 0.45 && Math.abs(cx) < 0.45),
          sideSign,
        );
      }
    }

    veins.push({ pts, thickness, isAmber, phase: rand() * Math.PI * 2, sparkSpeed: 0.35 + rand() * 0.65 });

    if (depth > 1) {
      addRootBranch(cx, cv, curAngle - (0.22 + rand() * 0.22), length * 0.72, depth - 1, thickness * 0.72, isAmber, sideSign);
      addRootBranch(cx, cv, curAngle + (0.22 + rand() * 0.22), length * 0.68, depth - 1, thickness * 0.66, isAmber, sideSign);
    }
  };

  TRUNK_SEEDS.forEach((seed: TrunkSeed): void => {
    addRootBranch(seed.x, seed.v, seed.ang, seed.len, seed.d, seed.w, seed.amber, seed.x < 0 ? -1 : 1);
  });

  [-1, 1].forEach((side: number): void => {
    for (let strand = 0; strand < 3; strand += 1) {
      const pts: VeinPoint[] = [];
      const inset = 1 - strand * 0.045;
      for (let i = 0; i <= 48; i += 1) {
        const v = i / 48;
        const jitter = Math.sin(v * 26 + strand * 2.1) * 0.025;
        pts.push({ x: side * getBustWidth(v) * (inset + jitter), v });
      }
      veins.push({
        pts,
        thickness: strand === 0 ? 1.85 : 1.05,
        isAmber: false,
        phase: strand * 1.4,
        sparkSpeed: 0.48 + strand * 0.15,
      });
    }
  });

  return veins;
}
