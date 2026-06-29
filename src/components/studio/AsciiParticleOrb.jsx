import React, { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const FRAME_INTERVAL = 1000 / 32;
const PRISM_BLOCKS = ['░', '▒', '▓', '█'];
const PARTICLE_GLYPHS = PRISM_BLOCKS;

const SPECTRUM_BANDS = [
  { id: 'red', color: 'rgba(224, 72, 82, 0.82)', chars: '█▓▒░▒▓' },
  { id: 'orange', color: 'rgba(226, 122, 74, 0.78)', chars: '▓█▓▒░▒' },
  { id: 'gold', color: 'rgba(228, 197, 92, 0.76)', chars: '▒▓█▓▒░' },
  { id: 'green', color: 'rgba(135, 190, 104, 0.72)', chars: '░▒▓█▓▒' },
  { id: 'cyan', color: 'rgba(105, 187, 199, 0.72)', chars: '▒░▒▓█▓' },
  { id: 'blue', color: 'rgba(92, 115, 198, 0.7)', chars: '▓▒░▒▓█' },
  { id: 'violet', color: 'rgba(152, 134, 198, 0.7)', chars: '█▒░▒▓▒' },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function buildParticles() {
  return Array.from({ length: 96 }, (_, index) => {
    const band = index % SPECTRUM_BANDS.length;
    return {
      band,
      progress: seededRandom(index + 11),
      drift: seededRandom(index + 31) * 0.7 + 0.3,
      phase: seededRandom(index + 51) * Math.PI * 2,
      glyph: PARTICLE_GLYPHS[Math.floor(seededRandom(index + 71) * PARTICLE_GLYPHS.length)],
      size: 5.5 + seededRandom(index + 91) * 2.8,
      alpha: 0.16 + seededRandom(index + 111) * 0.3,
    };
  });
}

function cssHsla(name, alpha) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const [h, s, l] = raw.split(/\s+/);
  return `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

function colorWithAlpha(color, alpha) {
  return color.replace(/[\d.]+\)$/u, `${clamp(alpha, 0, 1)})`);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function beamEdgeFade(progress) {
  return smoothstep(0.03, 0.18, progress) * (1 - smoothstep(0.82, 0.98, progress));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointOnLine(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function expandPointFromCenter(point, center, amount) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: point.x + (dx / distance) * amount,
    y: point.y + (dy / distance) * amount,
  };
}

function clipFrameWithoutPrism(ctx, frame, prism, margin) {
  const center = {
    x: (prism.apex.x + prism.left.x + prism.right.x) / 3,
    y: (prism.apex.y + prism.left.y + prism.right.y) / 3,
  };
  const apex = expandPointFromCenter(prism.apex, center, margin);
  const left = expandPointFromCenter(prism.left, center, margin);
  const right = expandPointFromCenter(prism.right, center, margin);

  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.size, frame.size);
  ctx.moveTo(apex.x, apex.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.clip('evenodd');
}

function drawBand(ctx, layout, fontSize, elapsed, reduceMotion, alphaScale = 1) {
  const pulse = reduceMotion
    ? 0.62
    : 0.58
      + Math.sin(elapsed * 0.37 + layout.index * 0.7) * 0.035
      + Math.sin(elapsed * 0.19 + layout.index * 1.6) * 0.025;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(layout.start.x, layout.start.y);
  ctx.rotate(layout.angle);
  ctx.font = `700 ${fontSize}px "Space Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = layout.band.color;
  ctx.shadowBlur = 7;

  const glyphStep = fontSize * 1.04;
  const glyphCount = Math.max(5, Math.ceil(layout.length / glyphStep));
  const laneCount = Math.max(2, Math.round(layout.width / (fontSize * 0.58)));

  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneOffset = (lane - (laneCount - 1) / 2) * fontSize * 0.5;
    const laneAlpha = pulse * alphaScale * (lane === Math.floor(laneCount / 2) ? 0.78 : 0.52);
    const streamSeed = seededRandom(layout.index * 61 + lane * 17 + 3) * glyphStep * 19;
    const rawFlow = reduceMotion
      ? streamSeed
      : streamSeed + elapsed * fontSize * (0.34 + layout.index * 0.012 + lane * 0.006);
    const flowCell = Math.floor(rawFlow / glyphStep);
    const flow = rawFlow - flowCell * glyphStep;

    for (let glyphIndex = -1; glyphIndex < glyphCount + 1; glyphIndex += 1) {
      const jitter = (seededRandom(layout.index * 1000 + lane * 97 + glyphIndex * 13) - 0.5) * fontSize * 0.24;
      const offset = glyphIndex * glyphStep + ((lane + layout.index) % 3) * fontSize * 0.16 - flow;
      const worldIndex = glyphIndex + flowCell + lane * 17 + layout.index * 31;
      const char = layout.band.chars[Math.floor(seededRandom(worldIndex + 19) * layout.band.chars.length)];
      const wave = Math.sin(glyphIndex * 0.7 + lane + elapsed * 0.29) * fontSize * 0.08;
      const grain = 0.72 + seededRandom(worldIndex + lane * 37) * 0.28;
      ctx.fillStyle = colorWithAlpha(layout.band.color, laneAlpha * grain);
      ctx.fillText(char, offset + jitter, laneOffset + wave);
    }
  }

  ctx.restore();
}

function drawAsciiRay(ctx, start, end, fontSize, elapsed, reduceMotion, color, alphaScale = 1) {
  const angle = Math.atan2(end.y - start.y, Math.max(1, end.x - start.x));
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const glyphStep = fontSize * 1.15;
  const glyphCount = Math.max(6, Math.ceil(length / glyphStep));
  const rawFlow = reduceMotion ? 0 : elapsed * fontSize * 0.28;
  const flowCell = Math.floor(rawFlow / glyphStep);
  const flow = rawFlow - flowCell * glyphStep;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);
  ctx.font = `700 ${fontSize * 0.78}px "Space Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;

  for (let glyphIndex = -1; glyphIndex < glyphCount + 2; glyphIndex += 1) {
    const offset = glyphIndex * glyphStep - flow;
    const worldIndex = glyphIndex + flowCell;
    const char = PRISM_BLOCKS[Math.abs(worldIndex) % PRISM_BLOCKS.length];
    const progress = clamp(offset / Math.max(1, length), 0, 1);
    const pulse = 0.45 + Math.sin(elapsed * 0.31 + worldIndex * 0.5) * 0.12;
    const fade = beamEdgeFade(progress);
    ctx.fillStyle = colorWithAlpha(color, pulse * alphaScale * fade);
    ctx.fillText(char, offset, Math.sin(glyphIndex * 0.8 + elapsed * 0.26) * fontSize * 0.08);
  }

  ctx.restore();
}

function drawFloatingParticles(ctx, layouts, particles, fontSize, elapsed, reduceMotion, options = {}) {
  const {
    alphaScale = 1,
    progressOffset = 0,
    speedScale = 1,
    driftScale = 1,
  } = options;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  particles.forEach((particle, index) => {
    const layout = layouts[particle.band];
    const speed = reduceMotion ? 0 : elapsed * 0.018 * particle.drift * speedScale;
    const rawProgress = particle.progress + progressOffset + speed;
    const progress = rawProgress - Math.floor(rawProgress);
    const fade = beamEdgeFade(progress);
    const normalX = -Math.sin(layout.angle);
    const normalY = Math.cos(layout.angle);
    const drift = Math.sin(elapsed * 0.47 + particle.phase) * layout.width * 0.42 * driftScale;
    const x = lerp(layout.start.x, layout.end.x, progress) + normalX * drift;
    const y = lerp(layout.start.y, layout.end.y, progress) + normalY * drift;
    const pulse = 0.42 + Math.sin(elapsed * 0.53 + particle.phase) * 0.2;

    ctx.font = `${clamp(particle.size, 5.5, fontSize + 0.8)}px "Space Mono", monospace`;
    ctx.shadowColor = layout.band.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = colorWithAlpha(layout.band.color, particle.alpha * pulse * alphaScale * fade);
    ctx.fillText(particle.glyph, x, y);

    if (index % 14 === 0) {
      ctx.font = `${particle.size + 0.9}px "Space Mono", monospace`;
      ctx.fillStyle = colorWithAlpha(layout.band.color, particle.alpha * 0.6 * alphaScale * fade);
      ctx.fillText(PRISM_BLOCKS[(index / 14) % PRISM_BLOCKS.length], x - normalX * 7, y - normalY * 7);
    }
  });

  ctx.restore();
}

function drawPrism(ctx, prism, fontSize, elapsed, reduceMotion, colors) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(prism.apex.x, prism.apex.y);
  ctx.lineTo(prism.right.x, prism.right.y);
  ctx.lineTo(prism.left.x, prism.left.y);
  ctx.closePath();

  const glass = ctx.createLinearGradient(prism.apex.x, prism.apex.y, prism.right.x, prism.right.y);
  glass.addColorStop(0, 'rgba(255, 253, 253, 0.05)');
  glass.addColorStop(0.48, 'rgba(108, 199, 207, 0.06)');
  glass.addColorStop(1, 'rgba(255, 253, 253, 0.02)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.clip();

  ctx.font = `${fontSize * 0.92}px "Space Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(132, 211, 222, 0.28)';
  ctx.shadowBlur = 6;

  const rows = 10;
  for (let row = 0; row < rows; row += 1) {
    const t = (row + 1) / (rows + 1);
    const leftEdge = pointOnLine(prism.apex, prism.left, t);
    const rightEdge = pointOnLine(prism.apex, prism.right, t);
    const y = leftEdge.y;
    const usable = rightEdge.x - leftEdge.x;
    const cols = Math.max(1, Math.floor(usable / (fontSize * 0.9)));

    for (let col = 0; col < cols; col += 1) {
      const x = leftEdge.x + usable * ((col + 0.5) / cols);
      const block = PRISM_BLOCKS[(row + col) % PRISM_BLOCKS.length];
      const shimmer = reduceMotion ? 0 : Math.sin(elapsed * 0.7 + row * 0.8 + col) * 0.04;
      ctx.fillStyle = `rgba(218, 244, 246, ${0.2 + t * 0.18 + shimmer})`;
      ctx.fillText(block, x, y);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(prism.apex.x, prism.apex.y);
  ctx.lineTo(prism.right.x, prism.right.y);
  ctx.lineTo(prism.left.x, prism.left.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(245, 253, 253, 0.82)';
  ctx.lineWidth = prism.outlineWidth;
  ctx.shadowColor = 'rgba(132, 211, 222, 0.45)';
  ctx.shadowBlur = 9;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(prism.entry.x, prism.entry.y);
  ctx.lineTo(prism.exit.x, prism.exit.y);
  ctx.strokeStyle = colorWithAlpha(colors.white, 0.38);
  ctx.lineWidth = Math.max(1, prism.outlineWidth * 0.58);
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();
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
      white: cssHsla('--spectrum-white', 0.86),
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
      const frameSize = clamp(Math.min(cssWidth * 0.72, cssHeight * 0.82), 148, 320);
      const frameX = (cssWidth - frameSize) / 2;
      const frameY = (cssHeight - frameSize) / 2 + cssHeight * 0.01;
      const frameBorder = clamp(frameSize * 0.036, 7, 12);
      const innerPad = frameBorder * 1.65;
      const inner = {
        x: frameX + innerPad,
        y: frameY + innerPad,
        width: frameSize - innerPad * 2,
        height: frameSize - innerPad * 2,
      };
      const fontSize = clamp(frameSize * 0.032, 7, 11.5);
      const prismSide = frameSize * 0.31;
      const prismHeight = prismSide * Math.sqrt(3) / 2;
      const prismCenterY = frameY + frameSize * 0.51;
      const prism = {
        apex: { x: frameX + frameSize * 0.5, y: prismCenterY - prismHeight / 2 },
        left: { x: frameX + frameSize * 0.5 - prismSide / 2, y: prismCenterY + prismHeight / 2 },
        right: { x: frameX + frameSize * 0.5 + prismSide / 2, y: prismCenterY + prismHeight / 2 },
        outlineWidth: clamp(frameSize * 0.006, 1.2, 2),
      };
      prism.entry = {
        x: frameX + frameSize * 0.445,
        y: frameY + frameSize * 0.47,
      };
      prism.exit = pointOnLine(prism.apex, prism.right, 0.55);
      const frame = { x: frameX, y: frameY, size: frameSize };

      const slopeY = frameSize * 0.105;
      const bandWidth = clamp(frameSize * 0.019, 4.4, 7);
      const frameRight = frameX + frameSize;
      const innerRight = frameRight;
      const externalRightStartX = frameRight;
      const externalRightEndX = Math.min(cssWidth * 0.98, frameX + frameSize * 1.46);
      const spectrumHeight = bandWidth * (SPECTRUM_BANDS.length - 1);
      const externalOffsetY = spectrumHeight * 0.5;

      const innerBands = SPECTRUM_BANDS.map((band, index) => {
        const direction = index - (SPECTRUM_BANDS.length - 1) / 2;
        const start = pointOnLine(prism.apex, prism.right, 0.53 + direction * 0.007);
        start.x += direction * 0.18;
        start.y += direction * bandWidth * 0.82;
        const end = {
          x: innerRight,
          y: start.y + slopeY,
        };
        return {
          band,
          index,
          direction,
          start,
          end,
          angle: Math.atan2(end.y - start.y, Math.max(1, end.x - start.x)),
          length: Math.hypot(end.x - start.x, end.y - start.y),
          width: bandWidth,
        };
      });

      const externalBands = innerBands.map((layout) => {
        const start = {
          x: externalRightStartX,
          y: layout.end.y + externalOffsetY + layout.direction * 0.4,
        };
        const end = {
          x: externalRightEndX,
          y: start.y + slopeY * 0.8,
        };
        return {
          ...layout,
          start,
          end,
          angle: Math.atan2(end.y - start.y, Math.max(1, end.x - start.x)),
          length: Math.hypot(end.x - start.x, end.y - start.y),
          width: bandWidth * 1.35,
        };
      });

      const leftExternalStart = {
        x: frameX - frameSize * 0.48,
        y: frameY + frameSize * 0.7,
      };
      const leftExternalEnd = {
        x: frameX,
        y: frameY + frameSize * 0.58,
      };
      const leftInnerStart = {
        x: frameX,
        y: frameY + frameSize * 0.545,
      };

      ctx.clearRect(0, 0, cssWidth, cssHeight);

      ctx.save();
      ctx.beginPath();
      ctx.rect(frameRight, 0, Math.max(0, cssWidth - frameRight), cssHeight);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      externalBands.forEach((layout) => drawBand(ctx, layout, fontSize, elapsed, reduceMotion, 0.95));
      drawFloatingParticles(ctx, externalBands, particles, fontSize, elapsed, reduceMotion, {
        alphaScale: 0.72,
        progressOffset: 0.24,
        speedScale: 0.78,
        driftScale: 0.68,
      });
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, frameX, cssHeight);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      drawAsciiRay(ctx, leftExternalStart, leftExternalEnd, fontSize, elapsed, reduceMotion, colors.white, 0.35);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(frameX, frameY, frameSize, frameSize);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(frameX, frameY, frameSize, frameSize);
      ctx.clip();

      drawAsciiRay(ctx, leftInnerStart, prism.entry, fontSize, elapsed, reduceMotion, colors.white, 0.74);

      ctx.save();
      clipFrameWithoutPrism(ctx, frame, prism, Math.max(2, prism.outlineWidth + fontSize * 0.25));
      innerBands.forEach((layout) => drawBand(ctx, layout, fontSize, elapsed, reduceMotion, 1));
      drawFloatingParticles(ctx, innerBands, particles, fontSize, elapsed, reduceMotion, {
        alphaScale: 1.08,
        driftScale: 0.82,
      });
      ctx.restore();

      drawPrism(ctx, prism, fontSize, elapsed, reduceMotion, colors);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 253, 253, 0.92)';
      ctx.lineWidth = frameBorder;
      ctx.shadowColor = 'rgba(255, 253, 253, 0.14)';
      ctx.shadowBlur = 6;
      ctx.strokeRect(
        frameX + frameBorder / 2,
        frameY + frameBorder / 2,
        frameSize - frameBorder,
        frameSize - frameBorder,
      );
      ctx.strokeStyle = 'rgba(255, 253, 253, 0.18)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.strokeRect(inner.x, inner.y, inner.width, inner.height);
      ctx.restore();

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
      <canvas ref={canvasRef} className="ascii-prism-scene__particles" />
    </div>
  );
}
