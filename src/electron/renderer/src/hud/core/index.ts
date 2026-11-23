import { byId } from '../dom';
import type { CoreController, CoreFrame, CoreStatus } from '../types';
import { drawFigureCore } from './figure';
import { createDust } from './sand';
import { drawTerrain } from './terrain';

const DUST_COUNT = 240;

const noop = (): void => {
  /* no canvas available */
};

/** Boots the 60fps sentient-core canvas and returns its assemble/disperse controls. */
export function startCoreCanvas(
  getStatus: () => CoreStatus,
  getBurstUntil: () => number,
): CoreController {
  const canvas = byId<HTMLCanvasElement>('core-canvas');
  const context = canvas?.getContext('2d', { alpha: false }) ?? null;
  if (!canvas || !context) {
    console.error('[apex-core] canvas unavailable');
    return { disperse: noop, assemble: noop, pulse: noop };
  }

  const surface = canvas;
  const ctx = context;
  const dust = createDust(DUST_COUNT);

  let width = 0;
  let height = 0;
  let disperse = 0;
  let target = 0;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    surface.width = Math.floor(width * dpr);
    surface.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const frame = (now: number): void => {
    const time = now * 0.001;
    const status = getStatus();
    const halted = status === 'HALTED';
    const listening = status === 'LISTENING';
    const thinking = status === 'THINKING';
    const burst = now < getBurstUntil();
    const speedMult = halted ? 0.12 : burst ? 1.85 : thinking ? 1.25 : listening ? 1.55 : 0.68;

    disperse += (target - disperse) * (halted ? 0.045 : 0.065);

    const coreFrame: CoreFrame = {
      time,
      speedMult,
      halted,
      listening,
      thinking,
      surge: burst ? 1.42 : 1.0,
      flicker: 0.84 + 0.16 * Math.sin(time * 24.0) * Math.cos(time * 13.7),
      integrity: Math.max(0, 1 - disperse * 1.15),
      disperse,
    };

    const background = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      20,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.7,
    );
    background.addColorStop(0, halted ? '#1a070b' : '#07192e');
    background.addColorStop(0.52, '#030a15');
    background.addColorStop(1, '#02060d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    drawTerrain(ctx, width, height, dust, time, speedMult, halted);
    drawFigureCore(ctx, width, height, coreFrame);

    window.requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  resize();
  window.requestAnimationFrame(frame);

  return {
    disperse: (): void => {
      target = 1;
    },
    assemble: (): void => {
      disperse = 1;
      target = 0;
    },
    pulse: (): void => {
      disperse = Math.min(1, disperse + 0.32);
      target = 0;
    },
  };
}
