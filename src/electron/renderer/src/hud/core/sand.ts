import { getBustWidth } from './silhouette';

export interface SandParticle {
  hx: number;
  hv: number;
  cyclePos: number;
  cycleSpeed: number;
  isLauncher: boolean;
  vx: number;
  vy: number;
  size: number;
  twinklePhase: number;
  twinkleFreq: number;
  isAmber: boolean;
}

export interface DustParticle {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  amber: boolean;
}

/** Sand-grain neutrons distributed over the bust, biased to rim and face core. */
export function createSandParticles(count: number): SandParticle[] {
  const particles: SandParticle[] = [];

  for (let i = 0; i < count; i += 1) {
    const v = Math.pow(Math.random(), 0.92) * 0.985;
    const maxW = getBustWidth(v);
    const rimBias = Math.random();
    let nx: number;

    if (rimBias < 0.42) {
      const side = Math.random() < 0.5 ? -1 : 1;
      nx = side * maxW * (0.84 + Math.random() * 0.19);
    } else if (rimBias < 0.72) {
      nx = (Math.random() * 2 - 1) * maxW * 0.88;
    } else {
      nx = (Math.random() - 0.5) * maxW * 0.65;
    }

    const outAngle = Math.atan2(v - 0.34, nx) + (Math.random() - 0.5) * 0.9;
    const launchSpeed = 0.35 + Math.random() * 1.15;

    particles.push({
      hx: nx,
      hv: v,
      cyclePos: Math.random(),
      cycleSpeed: 0.14 + Math.random() * 0.34,
      isLauncher: Math.random() < 0.58,
      vx: Math.cos(outAngle) * launchSpeed,
      vy: Math.sin(outAngle) * launchSpeed - 0.22,
      size: 0.8 + Math.random() * 1.65,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleFreq: 4 + Math.random() * 10,
      isAmber:
        (v > 0.18 && v < 0.42 && Math.abs(nx) < 0.55) ||
        (Math.abs(nx) < 0.25 && v > 0.48 && Math.random() < 0.55) ||
        Math.random() < 0.16,
    });
  }

  return particles;
}

/** Ambient glowing dust drifting across the lower terrain band. */
export function createDust(count: number): DustParticle[] {
  const dust: DustParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    dust.push({
      x: Math.random(),
      y: 0.38 + Math.random() * 0.54,
      size: 0.7 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.015 + Math.random() * 0.04,
      amber: Math.random() < 0.38,
    });
  }
  return dust;
}
