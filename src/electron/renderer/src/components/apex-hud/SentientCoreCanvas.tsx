import React, { useEffect, useRef } from 'react';
import type { ApexCoreState } from './useApexTelemetry';

interface SentientCoreCanvasProps {
  audioLevel?: number;
  state: ApexCoreState;
}

interface Particle {
  angle: number;
  phase: number;
  radius: number;
  speed: number;
}

const PARTICLE_COUNT = 168;

function colourFor(state: ApexCoreState): string {
  if (state === 'ERROR') return '#EF4444';
  if (state === 'THINKING') return '#F59E0B';
  return '#38BDF8';
}

export function SentientCoreCanvas({
  audioLevel = 0,
  state,
}: SentientCoreCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const audioLevelRef = useRef(audioLevel);

  useEffect(() => {
    stateRef.current = state;
    audioLevelRef.current = Math.max(0, Math.min(audioLevel, 1));
  }, [audioLevel, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
      angle: (Math.PI * 2 * index) / PARTICLE_COUNT,
      phase: Math.random() * Math.PI * 2,
      radius: 0.24 + Math.random() * 0.68,
      speed: 0.28 + Math.random() * 0.58,
    }));
    let frame = 0;
    let animationFrame = 0;
    let width = 1;
    let height = 1;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (time: number): void => {
      const current = stateRef.current;
      const level = audioLevelRef.current;
      const colour = colourFor(current);
      const now = time / 1000;
      const centerX = width / 2;
      const centerY = height / 2;
      const base = Math.min(width, height) * 0.285;
      const contraction = current === 'LISTENING' ? 0.7 - level * 0.16 : 1;
      const swirl = current === 'THINKING' ? 2.5 : 0.78;

      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, base * 1.25);
      glow.addColorStop(0, current === 'THINKING' ? 'rgba(245, 158, 11, 0.74)' : 'rgba(56, 189, 248, 0.42)');
      glow.addColorStop(0.26, 'rgba(56, 189, 248, 0.13)');
      glow.addColorStop(1, 'rgba(4, 8, 16, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, centerY, base * 1.25, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = colour;
      context.globalAlpha = current === 'ERROR' ? 0.95 : 0.64;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, base * (0.72 + Math.sin(now * 1.4) * 0.015), 0, Math.PI * 2);
      context.stroke();

      particles.forEach((particle, index) => {
        const wobble = Math.sin(now * particle.speed * swirl + particle.phase) * base * 0.075;
        const orbit = particle.angle + now * particle.speed * swirl;
        const radius = (particle.radius * base + wobble) * contraction;
        const x = centerX + Math.cos(orbit) * radius;
        const y = centerY + Math.sin(orbit * 1.18 + particle.phase) * radius * 0.82;
        const size = index % 9 === 0 ? 2.1 : 1.05;
        context.globalAlpha = 0.3 + particle.radius * 0.7;
        context.fillStyle = index % 13 === 0 && current === 'THINKING' ? '#F8FAFC' : colour;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      });

      if (current === 'SPEAKING' || current === 'ERROR') {
        const waveProgress = (now * (current === 'ERROR' ? 1.9 : 1.25)) % 1;
        for (let ring = 0; ring < 3; ring++) {
          const progress = (waveProgress + ring / 3) % 1;
          context.globalAlpha = (1 - progress) * (current === 'ERROR' ? 0.65 : 0.36);
          context.strokeStyle = colour;
          context.beginPath();
          context.arc(centerX, centerY, base * (0.84 + progress * 0.75), 0, Math.PI * 2);
          context.stroke();
        }
      }

      context.globalAlpha = 1;
      frame += 1;
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas aria-label="نواة المساعد الحية" className="apex-core-canvas" ref={canvasRef} role="img" />;
}
