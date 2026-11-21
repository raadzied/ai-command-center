import type { DustParticle } from './sand';

/** Drifting luminous sand-dune terrain across the lower-middle band. */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dust: DustParticle[],
  time: number,
  speedMult: number,
  halted: boolean,
): void {
  const rows = 30;
  const cols = 104;
  const baseY = height * 0.55;
  const spreadY = height * 0.24;

  for (let r = 0; r < rows; r += 1) {
    const depth = r / (rows - 1);
    const persp = 0.52 + depth * 1.02;
    const rowY = baseY + (depth - 0.36) * spreadY;
    const rowAlpha = Math.sin(depth * Math.PI) * 0.85;

    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      const nx = (u - 0.5) * 2;
      const x = u * width;

      const wave1 = Math.sin(nx * 5.6 + time * 0.5 * speedMult + depth * 4.2) * 28;
      const wave2 = Math.cos(nx * 11.4 - time * 0.38 * speedMult + depth * 6.4) * 14;
      const centerValley = 0.24 + 0.76 * Math.min(1, Math.abs(nx) * 1.4);
      const elevation = (wave1 + wave2) * centerValley * persp;
      const y = rowY - elevation;

      const amberVein = Math.sin(nx * 6.8 - depth * 4.8 + time * 0.34 * speedMult);
      const isAmber = !halted && amberVein > 0.65 && depth > 0.24;
      const dotSize = (0.8 + depth * 1.25) * (isAmber ? 1.35 : 1);

      if (halted) {
        ctx.fillStyle = `rgba(239, 68, 68, ${(rowAlpha * 0.28).toFixed(3)})`;
      } else if (isAmber) {
        ctx.fillStyle = `rgba(255, 185, 42, ${(rowAlpha * 0.92).toFixed(3)})`;
      } else {
        const bright = elevation > 12 ? 0.94 : 0.45;
        ctx.fillStyle = `rgba(56, 189, 248, ${(rowAlpha * bright).toFixed(3)})`;
      }
      ctx.fillRect(x - dotSize * 0.5, y - dotSize * 0.5, dotSize, dotSize);
    }
  }

  for (let i = 0; i < dust.length; i += 1) {
    const particle = dust[i];
    if (!particle) continue;
    const life = (time * particle.speed * speedMult * 6 + particle.phase) % 1;
    const alpha = Math.sin(life * Math.PI) * (halted ? 0.28 : 0.85);
    if (alpha <= 0.02) continue;
    const px = ((particle.x + time * particle.speed * 0.4) % 1) * width;
    const py = particle.y * height - life * 26;
    ctx.fillStyle = halted
      ? `rgba(239, 68, 68, ${alpha.toFixed(3)})`
      : particle.amber
        ? `rgba(255, 195, 55, ${alpha.toFixed(3)})`
        : `rgba(125, 211, 252, ${alpha.toFixed(3)})`;
    ctx.fillRect(px, py, particle.size, particle.size);
  }
}
