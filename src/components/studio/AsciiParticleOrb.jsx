import React, { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const FRAME_INTERVAL = 1000 / 32;
const GLYPHS = ['.', ':', '+', '*', '#', '%', '@'];

const SPECTRUM_BANDS = [
  { id: 'red', label: 'RED', chars: '@@@@####****++++::::....' },
  { id: 'pink', label: 'PINK', chars: '%%%%####****++++::::....' },
  { id: 'gold', label: 'GOLD', chars: '####****++++::::....' },
  { id: 'green', label: 'GREEN', chars: '****++++::::....' },
  { id: 'cyan', label: 'CYAN', chars: '++++::::....' },
  { id: 'blue', label: 'BLUE', chars: '::::....' },
  { id: 'violet', label: 'VIOLET', chars: '....::::++++' },
];

const PRISM_ART = [
  '              /\\',
  '             /::\\',
  '            /::::\\',
  '           /::..::\\',
  '          /::....::\\',
  '         /::......::\\',
  '        /____::::____\\',
].join('\n');

function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function buildParticles() {
  return Array.from({ length: 154 }, (_, index) => {
    const band = index % SPECTRUM_BANDS.length;
    return {
      band,
      progress: seededRandom(index + 11),
      drift: seededRandom(index + 31) * 0.8 + 0.35,
      phase: seededRandom(index + 51) * Math.PI * 2,
      glyph: GLYPHS[Math.floor(seededRandom(index + 71) * GLYPHS.length)],
      size: 7 + seededRandom(index + 91) * 4,
      alpha: 0.34 + seededRandom(index + 111) * 0.52,
    };
  });
}

function cssHsla(name, alpha) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const [h, s, l] = raw.split(/\s+/);
  return `hsla(${h}, ${s}, ${l}, ${alpha})`;
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

    const colors = {
      white: cssHsla('--spectrum-white', 0.9),
      red: 'rgba(255, 104, 126, 0.9)',
      pink: cssHsla('--primary', 0.92),
      gold: cssHsla('--secondary', 0.9),
      green: cssHsla('--spectrum-green', 0.88),
      cyan: 'rgba(142, 245, 255, 0.86)',
      blue: cssHsla('--accent', 0.82),
      violet: 'rgba(185, 167, 255, 0.84)',
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.3);
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
      const prismX = cssWidth * 0.42;
      const prismY = cssHeight * 0.52;
      const beamStartX = prismX + cssWidth * 0.07;
      const beamEndX = cssWidth * 0.92;

      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.globalCompositeOperation = 'lighter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      particles.forEach((particle, index) => {
        const band = SPECTRUM_BANDS[particle.band];
        const direction = particle.band - (SPECTRUM_BANDS.length - 1) / 2;
        const speed = reduceMotion ? 0 : elapsed * 0.03 * particle.drift;
        const progress = (particle.progress + speed) % 1;
        const x = beamStartX + (beamEndX - beamStartX) * progress;
        const slope = direction * cssHeight * 0.032;
        const wave = Math.sin(elapsed * 1.4 + particle.phase) * cssHeight * 0.006;
        const y = prismY + slope * progress * 3.2 + wave;
        const pulse = 0.72 + Math.sin(elapsed * 1.8 + particle.phase) * 0.28;

        ctx.font = `${particle.size}px "Space Mono", monospace`;
        ctx.shadowColor = colors[band.id];
        ctx.shadowBlur = 8;
        ctx.fillStyle = colors[band.id].replace(/[\d.]+\)$/u, `${particle.alpha * pulse})`);
        ctx.fillText(particle.glyph, x, y);

        if (index % 8 === 0) {
          ctx.font = `${particle.size + 1}px "Space Mono", monospace`;
          ctx.fillText('.', x - 11, y + 2);
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
    <div className="ascii-prism-scene" aria-hidden="true">
      <div className="ascii-prism-scene__halo" />
      <div className="ascii-prism-scene__input">
        <span>.............++++++++++++++==============</span>
      </div>
      <pre className="ascii-prism-scene__prism">{PRISM_ART}</pre>
      <div className="ascii-prism-scene__core" />
      <div className="ascii-prism-scene__spectrum">
        {SPECTRUM_BANDS.map((band, index) => (
          <pre
            key={band.id}
            className={`ascii-prism-scene__band ascii-prism-scene__band--${band.id}`}
            style={{ '--band-index': index - 3 }}
          >
            {band.chars}
          </pre>
        ))}
      </div>
      <canvas ref={canvasRef} className="ascii-prism-scene__particles" />
      <div className="ascii-prism-scene__caption">LIGHT / GLYPH / COLOR FIELD</div>
    </div>
  );
}
