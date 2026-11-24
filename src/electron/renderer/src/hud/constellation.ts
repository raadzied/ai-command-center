import type { ApexHudApi } from './types';
import { figureGeom } from './core/figure';

interface Anchor {
  x: number;
  y: number;
}

interface Paths {
  base: string[];
  pulses: string[];
}

function nodeAnchor(id: string, side: 'left' | 'right'): Anchor | null {
  const element = document.getElementById(`node-circle-${id}`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: side === 'left' ? rect.right + 4 : rect.left - 4,
    y: rect.top + rect.height / 2,
  };
}

function curve(from: Anchor, to: Anchor, side: 'left' | 'right'): string {
  const dx = side === 'left' ? from.x - to.x : to.x - from.x;
  const cp1x = side === 'left' ? from.x - dx * 0.46 : from.x + dx * 0.46;
  const cp1y = from.y + (to.y - from.y) * 0.08;
  const cp2x = side === 'left' ? to.x + dx * 0.42 : to.x - dx * 0.42;
  const cp2y = to.y;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

// الأسطر الهادئة هي الافتراض؛ النبض المتحرك يُرسم فقط للعقد النشطة فعلياً.
export function drawConstellationPaths(app: ApexHudApi): void {
  const pathsGroup = document.querySelector('#constellation-paths');
  const pulsesGroup = document.querySelector('#constellation-pulses');
  if (!pathsGroup || !pulsesGroup) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const fg = figureGeom(width, height);
  const anchorY = fg.top + fg.h * 0.34;
  const leftAnchor: Anchor = { x: fg.cx - fg.w * 0.185, y: anchorY };
  const rightAnchor: Anchor = { x: fg.cx + fg.w * 0.185, y: anchorY };

  const halted = app.state.coreStatus === 'HALTED';
  const burst = performance.now() < app.state.burstUntil;
  const result: Paths = { base: [], pulses: [] };

  app.agents.forEach((agent): void => {
    const to = nodeAnchor(agent.id, 'left');
    if (!to) return;
    const path = curve(leftAnchor, to, 'left');
    const active = agent.status === 'active' && !halted;
    const stroke = halted
      ? 'rgba(239, 68, 68, 0.25)'
      : active
        ? 'rgba(245, 158, 11, 0.58)'
        : agent.status === 'error'
          ? 'rgba(239, 68, 68, 0.38)'
          : agent.status === 'done'
            ? 'rgba(74, 222, 128, 0.3)'
            : 'rgba(148, 163, 184, 0.18)';
    result.base.push(
      `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${active ? '1.35' : '1'}" />`,
    );
    if (active) {
      result.pulses.push(
        `<path d="${path}" class="svg-pulse-amber is-active${burst ? ' svg-pulse-burst' : ''}" />`,
      );
    }
  });

  app.resources.forEach((resource): void => {
    const to = nodeAnchor(resource.id, 'right');
    if (!to) return;
    const path = curve(rightAnchor, to, 'right');
    const active = resource.status === 'active' && !halted;
    const stroke = halted
      ? 'rgba(239, 68, 68, 0.22)'
      : active
        ? 'rgba(56, 189, 248, 0.58)'
        : resource.status === 'error'
          ? 'rgba(239, 68, 68, 0.34)'
          : resource.status === 'done'
            ? 'rgba(74, 222, 128, 0.28)'
            : 'rgba(56, 189, 248, 0.18)';
    result.base.push(`<path d="${path}" fill="none" stroke="${stroke}" stroke-width="1" />`);
    if (active) {
      result.pulses.push(
        `<path d="${path}" class="svg-pulse-cyan is-active${burst ? ' svg-pulse-burst' : ''}" />`,
      );
    }
  });

  pathsGroup.innerHTML = result.base.join('');
  pulsesGroup.innerHTML = result.pulses.join('');
}
