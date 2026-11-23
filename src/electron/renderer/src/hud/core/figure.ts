// Sentient figure: replaces the procedurally drawn bust with
// sentient-figure.webp while keeping the living halo, core glow,
// golden neural sparks and state rings.
import type { CoreFrame } from '../types';
import figureUrl from './sentient-figure.webp';

export const FIG_W = 585;
export const FIG_H = 542;

const SPARK_COUNT = 14;
const GOLDEN = 0.61803398874;
const TWO_PI = Math.PI * 2;

export interface FigureGeom {
  readonly w: number;
  readonly h: number;
  readonly top: number;
  readonly cx: number;
}

/** Fits the figure near the top of the viewport at its native 585:542 ratio. */
export function figureGeom(width: number, height: number): FigureGeom {
  const fw = Math.min(height * 0.92 * (FIG_W / FIG_H), width * 0.56);
  return { w: fw, h: fw * (FIG_H / FIG_W), top: height * 0.09, cx: width * 0.5 };
}

const figureImage = new Image();
let figNormal: HTMLCanvasElement | null = null;
let figHalted: HTMLCanvasElement | null = null;

/** Bakes the webp offscreen: optional red tint + soft bottom fade (0.80 -> 1.0). */
function bakeFigure(tint: string | null): HTMLCanvasElement | null {
  if (!figureImage.complete || figureImage.naturalWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = FIG_W;
  canvas.height = FIG_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(figureImage, 0, 0, FIG_W, FIG_H);
  if (tint !== null) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, FIG_W, FIG_H);
  }
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, FIG_H * 0.8, 0, FIG_H);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, FIG_W, FIG_H);
  return canvas;
}

figureImage.addEventListener('load', (): void => {
  figNormal = bakeFigure(null);
  figHalted = bakeFigure('rgba(239, 68, 68, 0.62)');
});
figureImage.src = figureUrl;

function breathOf(frame: CoreFrame): number {
  return Math.sin(frame.time * (frame.thinking ? 2.8 : frame.listening ? 5.2 : 1.5));
}

/** Background halo behind the figure (cyan, red while halted). */
function drawHalo(ctx: CanvasRenderingContext2D, g: FigureGeom, frame: CoreFrame): void {
  const color = frame.halted ? '239, 68, 68' : '56, 189, 248';
  const alpha = (0.2 + 0.06 * breathOf(frame)) * frame.flicker * frame.surge;
  const cy = g.top + g.h * 0.42;
  const radius = g.w * 0.95;
  const gradient = ctx.createRadialGradient(g.cx, cy, g.w * 0.08, g.cx, cy, radius);
  gradient.addColorStop(0, `rgba(${color}, ${Math.min(0.5, alpha).toFixed(3)})`);
  gradient.addColorStop(0.55, `rgba(${color}, ${(alpha * 0.3).toFixed(3)})`);
  gradient.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(g.cx, cy, radius, 0, TWO_PI);
  ctx.fill();
}

/** Living orange core glow at 30% of the figure height. */
function drawCoreGlow(ctx: CanvasRenderingContext2D, g: FigureGeom, frame: CoreFrame): void {
  const cy = g.top + g.h * 0.3;
  const audio = frame.listening
    ? 0.5 + 0.5 * Math.sin(frame.time * 11.5) * Math.cos(frame.time * 4.3)
    : 0;
  const radius = Math.max(1, g.w * (0.15 + breathOf(frame) * 0.02 + audio * 0.03) * frame.surge);
  const intensity = (frame.halted ? 0.45 : 1) * frame.flicker;
  const gradient = ctx.createRadialGradient(g.cx, cy, 1, g.cx, cy, radius);
  if (frame.halted) {
    gradient.addColorStop(0, 'rgba(255, 224, 224, 0.92)');
    gradient.addColorStop(0.3, 'rgba(239, 68, 68, 0.72)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
  } else {
    gradient.addColorStop(0, `rgba(255, 246, 224, ${Math.min(1, 0.95 * intensity).toFixed(3)})`);
    gradient.addColorStop(0.25, `rgba(255, 172, 44, ${Math.min(1, 0.8 * intensity).toFixed(3)})`);
    gradient.addColorStop(0.6, `rgba(245, 120, 0, ${Math.min(1, 0.34 * intensity).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(217, 95, 2, 0)');
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(g.cx, cy, radius, 0, TWO_PI);
  ctx.fill();
}

/** 14 golden neural sparks drifting upward around the figure. */
function drawSparks(ctx: CanvasRenderingContext2D, g: FigureGeom, frame: CoreFrame): void {
  if (frame.halted) return;
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const seed = (i * GOLDEN) % 1;
    const cycle = (frame.time * 0.15 * frame.speedMult + seed) % 1;
    const sway = Math.sin(seed * TWO_PI + frame.time * (0.4 + seed * 0.8));
    const sx = g.cx + sway * g.w * (0.08 + 0.3 * cycle);
    const sy = g.top + g.h * (0.95 - cycle * 0.9);
    const alpha = Math.sin(cycle * Math.PI) * 0.9 * frame.flicker * frame.surge;
    if (alpha <= 0.04) continue;
    const size = 1.3 + seed * 2;
    ctx.fillStyle = `rgba(255, 214, 102, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
  }
}

/** Expanding rings while listening, thinking or surging. */
function drawRings(ctx: CanvasRenderingContext2D, g: FigureGeom, frame: CoreFrame): void {
  if (frame.halted || (!frame.listening && !frame.thinking && frame.surge <= 1)) return;
  const cy = g.top + g.h * 0.3;
  const count = frame.listening ? 3 : 2;
  for (let i = 0; i < count; i += 1) {
    const progress = (frame.time * (frame.listening ? 1.15 : 0.48) + i / count) % 1;
    const radius = g.w * (0.12 + progress * 0.52);
    const alpha = (1 - progress) * (frame.listening ? 0.6 : 0.26) * frame.surge;
    ctx.strokeStyle = `rgba(255, 195, 65, ${Math.min(0.85, alpha).toFixed(3)})`;
    ctx.lineWidth = frame.listening ? 1.8 : 1.15;
    ctx.beginPath();
    ctx.arc(g.cx, cy, radius, 0, TWO_PI);
    ctx.stroke();
  }
}

/** Draws halo + figure + living glow. Called once per animation frame. */
export function drawFigureCore(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: CoreFrame,
): void {
  const g = figureGeom(width, height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawHalo(ctx, g, frame);

  const source = frame.halted ? figHalted : figNormal;
  if (source) {
    const visible = Math.max(0, 1 - frame.disperse);
    ctx.globalAlpha = visible * (frame.halted ? 0.92 : 0.86 + 0.14 * Math.sin(frame.time * 1.5));
    const lift = frame.disperse * g.h * 0.1;
    const grow = 1 + frame.disperse * 0.12;
    ctx.drawImage(source, g.cx - (g.w * grow) / 2, g.top - lift, g.w * grow, g.h * grow);
    ctx.globalAlpha = 1;
  }

  drawCoreGlow(ctx, g, frame);
  drawSparks(ctx, g, frame);
  drawRings(ctx, g, frame);
  ctx.restore();
}
