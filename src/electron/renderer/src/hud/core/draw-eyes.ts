import type { CoreFrame } from '../types';
import { coreGeometry } from './silhouette';

/** Glowing eyes, anamorphic flare and shockwave rings. */
export function drawEyes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: CoreFrame,
): void {
  const { cx, headHalfW, eyeY, eyeOffsetX } = coreGeometry(width, height);
  const integrity = frame.integrity;
  if (integrity <= 0.15) return;

  const breath = Math.sin(frame.time * (frame.thinking ? 2.8 : frame.listening ? 5.2 : 1.5));
  const audioPulse = frame.listening
    ? 0.5 + 0.5 * Math.sin(frame.time * 11.5) * Math.cos(frame.time * 4.3)
    : 0;
  const intensity =
    (frame.halted ? 0.55 : frame.thinking ? 1.15 : frame.listening ? 1.05 + audioPulse * 0.45 : 0.92) *
    frame.flicker *
    frame.surge *
    integrity;
  const eyeW = headHalfW * 0.21;
  const eyeH = headHalfW * 0.068;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  [-1, 1].forEach((side: number): void => {
    const ex = cx + side * eyeOffsetX;
    const bloom = headHalfW * (0.52 + breath * 0.05 + audioPulse * 0.1) * frame.surge;
    const gradient = ctx.createRadialGradient(ex, eyeY, 1, ex, eyeY, bloom);

    if (frame.halted) {
      gradient.addColorStop(0, 'rgba(255, 220, 220, 0.9)');
      gradient.addColorStop(0.25, 'rgba(239, 68, 68, 0.8)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(255, 255, 235, 1.0)');
      gradient.addColorStop(0.18, `rgba(255, 210, 65, ${Math.min(1, 0.96 * intensity).toFixed(3)})`);
      gradient.addColorStop(0.45, `rgba(245, 130, 0, ${Math.min(1, 0.55 * intensity).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(217, 95, 2, 0)');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ex, eyeY, bloom, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = frame.halted ? '#fee2e2' : '#fffbeb';
    ctx.beginPath();
    ctx.moveTo(ex - side * eyeW * 0.95, eyeY + eyeH * 0.35);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.15, ex + side * eyeW, eyeY - eyeH * 0.45);
    ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.05, ex - side * eyeW * 0.95, eyeY + eyeH * 0.35);
    ctx.closePath();
    ctx.fill();
  });

  const flareWidth = headHalfW * (3.0 + breath * 0.35 + audioPulse * 0.65) * frame.surge;
  const flareHeight = Math.max(2.4, headHalfW * 0.052);
  const flare = ctx.createLinearGradient(cx - flareWidth, eyeY, cx + flareWidth, eyeY);

  if (frame.halted) {
    flare.addColorStop(0, 'rgba(239, 68, 68, 0)');
    flare.addColorStop(0.5, 'rgba(255, 235, 235, 0.9)');
    flare.addColorStop(1, 'rgba(239, 68, 68, 0)');
  } else {
    flare.addColorStop(0, 'rgba(255, 160, 0, 0)');
    flare.addColorStop(0.25, 'rgba(255, 180, 35, 0.62)');
    flare.addColorStop(0.5, 'rgba(255, 255, 235, 1.0)');
    flare.addColorStop(0.75, 'rgba(255, 180, 35, 0.62)');
    flare.addColorStop(1, 'rgba(255, 160, 0, 0)');
  }

  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.ellipse(cx, eyeY, flareWidth, flareHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!frame.halted && (frame.listening || frame.thinking || frame.surge > 1)) {
    const rings = frame.listening ? 3 : 2;
    for (let index = 0; index < rings; index += 1) {
      const progress = (frame.time * (frame.listening ? 1.15 : 0.48) + index / rings) % 1;
      const radius = headHalfW * (0.4 + progress * 1.75);
      const alpha = (1 - progress) * (frame.listening ? 0.65 : 0.26) * frame.surge * integrity;
      ctx.strokeStyle = `rgba(255, 195, 65, ${Math.min(0.85, alpha).toFixed(3)})`;
      ctx.lineWidth = frame.listening ? 1.8 : 1.15;
      ctx.beginPath();
      ctx.arc(cx, eyeY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
