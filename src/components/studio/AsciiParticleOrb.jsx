import React, { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const GLYPHS = ['.', '.', '.', 'o', '*', '+', '@', '#'];
const FRAME_INTERVAL = 1000 / 42;

function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function buildParticles() {
  const particles = [];
  const sphereCount = 240;
  const innerCount = 78;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < sphereCount; i += 1) {
    const y = 1 - (i / (sphereCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    particles.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      layer: 'surface',
      glyph: GLYPHS[Math.floor(seededRandom(i + 1) * GLYPHS.length)],
      size: 7 + seededRandom(i + 11) * 4,
      phase: seededRandom(i + 21) * Math.PI * 2,
      drift: 0.018 + seededRandom(i + 31) * 0.026,
    });
  }

  for (let i = 0; i < innerCount; i += 1) {
    const a = seededRandom(i + 101) * Math.PI * 2;
    const z = seededRandom(i + 201) * 2 - 1;
    const r = Math.cbrt(seededRandom(i + 301)) * 0.82;
    const xy = Math.sqrt(1 - z * z);
    particles.push({
      x: Math.cos(a) * xy * r,
      y: Math.sin(a) * xy * r,
      z: z * r,
      layer: 'core',
      glyph: seededRandom(i + 401) > 0.72 ? '*' : '.',
      size: 4.5 + seededRandom(i + 501) * 3.5,
      phase: seededRandom(i + 601) * Math.PI * 2,
      drift: 0.03 + seededRandom(i + 701) * 0.05,
    });
  }

  return particles;
}

export default function AsciiParticleOrb() {
  const canvasRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const particles = useMemo(() => buildParticles(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: true });
    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let start = performance.now();
    let lastDraw = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      if (!reduceMotion && now - lastDraw < FRAME_INTERVAL) {
        frameId = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;

      const elapsed = reduceMotion ? 0 : (now - start) / 1000;
      const cssWidth = width / dpr;
      const cssHeight = height / dpr;
      const cx = cssWidth / 2;
      const cy = cssHeight / 2;
      const radius = Math.min(cssWidth, cssHeight) * 0.43;
      const rotY = elapsed * 0.28;
      const rotX = -0.23 + Math.sin(elapsed * 0.18) * 0.05;

      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.globalCompositeOperation = 'source-over';

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 1.38);
      glow.addColorStop(0, 'rgba(255, 253, 253, 0.16)');
      glow.addColorStop(0.46, 'rgba(255, 165, 198, 0.10)');
      glow.addColorStop(1, 'rgba(255, 165, 198, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.42, 0, Math.PI * 2);
      ctx.fill();

      const projected = particles.map((particle, index) => {
        const wave = Math.sin(elapsed * (0.8 + particle.drift) + particle.phase);
        const drift = particle.layer === 'core' ? wave * 0.075 : wave * 0.022;
        const x0 = particle.x + Math.cos(particle.phase) * drift;
        const y0 = particle.y + Math.sin(particle.phase * 1.7) * drift;
        const z0 = particle.z + Math.sin(particle.phase + elapsed * 0.62) * drift;

        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const x1 = x0 * cosY - z0 * sinY;
        const z1 = x0 * sinY + z0 * cosY;

        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const y2 = y0 * cosX - z1 * sinX;
        const z2 = y0 * sinX + z1 * cosX;

        const perspective = 1.9 / (2.45 - z2);
        const depth = (z2 + 1.15) / 2.3;
        return {
          index,
          x: cx + x1 * radius * perspective,
          y: cy + y2 * radius * perspective,
          z: z2,
          alpha: Math.max(0.08, Math.min(0.9, 0.18 + depth * 0.72)),
          scale: Math.max(0.46, perspective * (0.75 + depth * 0.68)),
          glyph: particle.glyph,
          size: particle.size,
          layer: particle.layer,
          pulse: 0.5 + Math.sin(elapsed * 1.4 + particle.phase) * 0.5,
        };
      }).sort((a, b) => a.z - b.z);

      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 0;

      projected.forEach((point) => {
        const fontSize = point.size * point.scale;
        const alpha = point.layer === 'core'
          ? point.alpha * (0.78 + point.pulse * 0.35)
          : point.alpha;
        const dotSize = point.layer === 'core'
          ? Math.max(1.05, fontSize * 0.2)
          : Math.max(0.72, fontSize * 0.14);

        ctx.beginPath();
        ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 253, 253, ${alpha * 0.82})`;
        ctx.fill();
      });

      projected.forEach((point) => {
        const shouldDrawGlyph = point.layer === 'core'
          ? point.index % 3 === 0
          : point.index % 5 === 0;
        if (!shouldDrawGlyph) return;

        const fontSize = point.size * point.scale;
        const alpha = point.layer === 'core'
          ? point.alpha * (0.52 + point.pulse * 0.22)
          : point.alpha * 0.48;

        ctx.font = `${fontSize}px "Space Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 253, 253, 0.55)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = `rgba(255, 253, 253, ${alpha})`;
        ctx.fillText(point.glyph, point.x, point.y);
      });

      projected.forEach((point) => {
        if (point.layer === 'core' && point.pulse > 0.82 && point.index % 4 === 0) {
          const fontSize = point.size * point.scale;
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(0.8, fontSize * 0.2), 0, Math.PI * 2);
          ctx.shadowBlur = 6;
          ctx.fillStyle = `rgba(255, 253, 253, ${point.alpha * 0.28})`;
          ctx.fill();
        }
      });

      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      if (!reduceMotion) frameId = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameId = requestAnimationFrame((now) => {
      start = now;
      draw(now);
    });

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [particles, reduceMotion]);

  return (
    <div className="ascii-orb-showpiece" aria-hidden="true">
      <div className="ascii-orb-showpiece__halo" />
      <canvas ref={canvasRef} className="ascii-orb-showpiece__canvas" />
      <div className="ascii-orb-showpiece__scan" />
    </div>
  );
}
