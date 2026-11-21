import type { CoreFrame } from '../types';
import type { SandParticle } from './sand';
import { coreGeometry, getBustWidth, lerp } from './silhouette';
import type { Vein } from './veins';

/** Occlusion body, aura, branching roots and sand-grain neutrons. */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  veins: Vein[],
  sand: SandParticle[],
  frame: CoreFrame,
): void {
  const geo = coreGeometry(width, height);
  const { cx, bustHeight, bustTopY, headHalfW, eyeY } = geo;
  const integrity = frame.integrity;

  if (integrity > 0.08) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const v = i / 64;
      const x = cx + getBustWidth(v) * headHalfW * 1.01;
      const y = bustTopY + v * bustHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = 64; i >= 0; i -= 1) {
      const v = i / 64;
      ctx.lineTo(cx - getBustWidth(v) * headHalfW * 1.01, bustTopY + v * bustHeight);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(2, 8, 18, ${(0.86 * integrity).toFixed(3)})`;
    ctx.fill();
    ctx.restore();
  }

  const aura = frame.halted ? '239, 68, 68' : '0, 229, 255';
  const breath = Math.sin(frame.time * (frame.thinking ? 2.8 : frame.listening ? 5.2 : 1.5));
  const halo = (0.28 + 0.08 * breath) * frame.flicker * frame.surge * (0.25 + 0.75 * integrity);
  const haloGradient = ctx.createRadialGradient(
    cx,
    eyeY + headHalfW * 0.15,
    headHalfW * 0.25,
    cx,
    eyeY + headHalfW * 0.15,
    headHalfW * 2.6,
  );
  haloGradient.addColorStop(0, `rgba(${aura}, ${Math.min(0.6, halo).toFixed(3)})`);
  haloGradient.addColorStop(0.5, `rgba(${aura}, ${(halo * 0.28).toFixed(3)})`);
  haloGradient.addColorStop(1, `rgba(${aura}, 0)`);
  ctx.fillStyle = haloGradient;
  ctx.beginPath();
  ctx.arc(cx, eyeY + headHalfW * 0.15, headHalfW * 2.6, 0, Math.PI * 2);
  ctx.fill();

  if (integrity > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < veins.length; i += 1) {
      const vein = veins[i];
      if (!vein) continue;
      const points = vein.pts;
      const pulse = 0.68 + 0.32 * Math.sin(frame.time * 2.4 * frame.speedMult + vein.phase);
      const alpha = (vein.isAmber ? 0.72 : 0.56) * pulse * integrity * frame.flicker;

      ctx.beginPath();
      for (let j = 0; j < points.length; j += 1) {
        const point = points[j];
        if (!point) continue;
        const sway =
          Math.sin(frame.time * 1.4 * frame.speedMult + point.v * 9 + vein.phase) *
          (frame.listening ? 2.4 : 0.85);
        const px = cx + point.x * headHalfW + sway;
        const py = bustTopY + point.v * bustHeight;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      if (frame.halted) {
        ctx.strokeStyle = `rgba(239, 68, 68, ${(alpha * 0.65).toFixed(3)})`;
      } else if (vein.isAmber) {
        ctx.strokeStyle = `rgba(255, 175, 32, ${Math.min(0.95, alpha * frame.surge).toFixed(3)})`;
      } else {
        ctx.strokeStyle = `rgba(34, 211, 238, ${Math.min(0.9, alpha * frame.surge).toFixed(3)})`;
      }
      ctx.lineWidth = vein.thickness;
      ctx.stroke();

      if (!frame.halted && i % 2 === 0 && points.length > 2) {
        const sparkT = (frame.time * vein.sparkSpeed * frame.speedMult + vein.phase) % 1;
        const position = sparkT * (points.length - 1);
        const index = Math.floor(position);
        const next = Math.min(points.length - 1, index + 1);
        const fraction = position - index;
        const from = points[index];
        const to = points[next];
        if (!from || !to) continue;
        const sx = cx + lerp(from.x, to.x, fraction) * headHalfW;
        const sy = bustTopY + lerp(from.v, to.v, fraction) * bustHeight;
        const sparkAlpha = Math.sin(sparkT * Math.PI) * integrity;
        ctx.fillStyle = vein.isAmber
          ? `rgba(255, 250, 210, ${sparkAlpha.toFixed(3)})`
          : `rgba(224, 252, 255, ${sparkAlpha.toFixed(3)})`;
        ctx.fillRect(sx - 1.3, sy - 1.3, 2.6, 2.6);
      }
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const scatterRadius = headHalfW * 2.8;

  for (let i = 0; i < sand.length; i += 1) {
    const particle = sand[i];
    if (!particle) continue;

    const cycle = (particle.cyclePos + frame.time * particle.cycleSpeed * frame.speedMult) % 1;
    let launchDistance = 0;
    let lifeAlpha: number;

    if (particle.isLauncher && !frame.halted) {
      if (cycle > 0.42) {
        const t = (cycle - 0.42) / 0.58;
        launchDistance = Math.pow(t, 1.65) * headHalfW * (0.85 + (frame.surge - 1) * 1.4);
        lifeAlpha = Math.max(0, 1 - Math.pow(t, 1.35));
      } else {
        lifeAlpha = Math.min(1, cycle / 0.08);
      }
    } else {
      lifeAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(frame.time * particle.twinkleFreq + particle.twinklePhase));
    }

    const totalDisplacement = launchDistance + frame.disperse * scatterRadius * (0.4 + particle.cyclePos * 0.9);
    const swirl = frame.disperse * 2.4 * (particle.hx < 0 ? -1 : 1);
    const cos = Math.cos(swirl);
    const sin = Math.sin(swirl);

    const baseX = particle.hx * headHalfW;
    const baseY = (particle.hv - 0.34) * bustHeight;
    const rotatedX = baseX * cos - baseY * sin;
    const rotatedY = baseX * sin + baseY * cos;

    const px = cx + rotatedX + particle.vx * totalDisplacement;
    const py = bustTopY + 0.34 * bustHeight + rotatedY + particle.vy * totalDisplacement;

    const twinkle = 0.65 + 0.35 * Math.sin(frame.time * particle.twinkleFreq + particle.twinklePhase);
    const finalAlpha =
      lifeAlpha * twinkle * (frame.halted ? Math.max(0.05, 1 - frame.disperse * 0.85) : 1);
    if (finalAlpha <= 0.04) continue;

    if (frame.halted) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(finalAlpha * 0.75).toFixed(3)})`;
    } else if (particle.isAmber) {
      ctx.fillStyle = `rgba(255, 200, 75, ${Math.min(1, finalAlpha * 0.95).toFixed(3)})`;
    } else {
      ctx.fillStyle = `rgba(110, 235, 255, ${Math.min(1, finalAlpha * 0.92).toFixed(3)})`;
    }

    const size = particle.size * (launchDistance > 4 ? 0.85 : 1);
    ctx.fillRect(px - size * 0.5, py - size * 0.5, size, size);
  }
  ctx.restore();
}
