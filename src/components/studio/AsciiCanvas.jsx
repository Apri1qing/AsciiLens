import React, { forwardRef, useEffect, useRef, useImperativeHandle, useState } from 'react';

const CHAR_SETS = {
  standard: '@#S%?*+;:,. ',
  blocks: '█▓▒░ ',
  dots: '●◉○◌·  ',
};

function getCharSet(settings) {
  if (settings.charSet === 'custom' && settings.customChars && settings.customChars.trim().length > 0) {
    return settings.customChars + ' ';
  }
  return CHAR_SETS[settings.charSet] || CHAR_SETS.standard;
}

/**
 * @typedef {object} AsciiCanvasProps
 * @property {any} image
 * @property {any} settings
 * @property {(processing: boolean) => void} onProcessingChange
 * @property {(result: any) => void} onResult
 * @property {React.ReactNode} [children]
 */

/** @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<AsciiCanvasProps> & React.RefAttributes<any>>} */
const AsciiCanvas = forwardRef(function AsciiCanvas(
  /** @type {AsciiCanvasProps} */ props,
  ref,
) {
  const { image, settings, onProcessingChange, onResult, children } = props;
  const processCanvasRef = useRef(null);
  const outputRef = useRef(null);
  const animFrameRef = useRef(null);
  const [imgAspect, setImgAspect] = useState(null);

  useImperativeHandle(ref, () => ({
    download: () => {
      const canvas = outputRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'asciilens-art.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  }));

  useEffect(() => {
    if (!image) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    onProcessingChange(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgAspect(img.width / img.height);
      animFrameRef.current = requestAnimationFrame(() => {
        if (settings.mode === 'full') {
          renderFull(img, settings, processCanvasRef, outputRef, onResult);
        } else {
          renderOverlay(img, settings, processCanvasRef, outputRef, onResult);
        }
        onProcessingChange(false);
      });
    };
    img.src = image.url;

    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [image, settings]);

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ minHeight: '400px' }}>
      <canvas ref={processCanvasRef} className="hidden" />
      {/* Wrapper sized to exact image aspect ratio — selector overlays align perfectly */}
      <div
        className="relative"
        style={imgAspect
          ? {
              width: `min(100%, calc((100vh - 160px) * ${imgAspect}))`,
              aspectRatio: `${imgAspect}`,
              maxWidth: '100%',
            }
          : { position: 'relative', display: 'inline-block' }
        }
      >
        <canvas ref={outputRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        {children}
      </div>
    </div>
  );
});

export default AsciiCanvas;

// ─── Shared utilities ─────────────────────────────────────────────────────────

function getColor(colorMode, r, g, b, alpha) {
  if (colorMode === 'original') return `rgba(${r},${g},${b},${alpha})`;
  if (colorMode === 'gold')     return `rgba(255,215,100,${alpha})`;
  if (colorMode === 'white')    return `rgba(240,238,230,${alpha})`;
  if (colorMode === 'green')    return `rgba(80,255,120,${alpha})`;
  if (colorMode === 'neon')     return `rgba(80,200,255,${alpha})`;
  if (colorMode === 'cyan')     return `rgba(100,240,230,${alpha})`;
  return `rgba(240,238,230,${alpha})`;
}

function drawVignette(ctx, w, h, strength) {
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${strength / 130})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ─── Full ASCII rendering ─────────────────────────────────────────────────────
// Renders entire image as ASCII art on black background

function renderFull(img, settings, processCanvasRef, outputRef, onResult) {
  const { resolution, brightness, contrast, invertLight, vignetteStrength, glowStrength, colorMode } = settings;
  const chars = getCharSet(settings);

  const cols = Math.max(40, Math.min(200, Math.round(resolution)));
  const charAspect = 0.55;
  const rows = Math.round(cols / (img.width / img.height) * charAspect);

  // Downsample
  const pCanvas = processCanvasRef.current;
  pCanvas.width = cols;
  pCanvas.height = rows;
  const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
  pCtx.filter = `brightness(${0.5 + brightness / 100}) contrast(${0.5 + contrast / 100})`;
  pCtx.drawImage(img, 0, 0, cols, rows);
  const { data } = pCtx.getImageData(0, 0, cols, rows);

  // Output canvas
  const oCanvas = outputRef.current;
  oCanvas.width = img.width;
  oCanvas.height = img.height;
  const oCtx = oCanvas.getContext('2d');

  // Black background
  oCtx.fillStyle = '#080a0c';
  oCtx.fillRect(0, 0, img.width, img.height);

  const cellW = img.width / cols;
  const cellH = img.height / rows;
  const fontSize = Math.max(6, Math.min(cellW * 1.1, cellH * 1.0));
  oCtx.font = `bold ${fontSize}px "Space Mono", monospace`;
  oCtx.textBaseline = 'middle';
  oCtx.textAlign = 'center';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (invertLight) lum = 1 - lum;
      const charIndex = Math.floor(lum * (chars.length - 1));
      const ch = chars[Math.max(0, Math.min(chars.length - 1, charIndex))];
      if (ch === ' ') continue;

      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      const color = getColor(colorMode, r, g, b, 1);

      if (glowStrength > 0) {
        oCtx.shadowColor = color;
        oCtx.shadowBlur = glowStrength / 8;
      } else {
        oCtx.shadowBlur = 0;
      }
      oCtx.fillStyle = color;
      oCtx.fillText(ch, cx, cy);
    }
  }

  oCtx.shadowBlur = 0;
  if (vignetteStrength > 0) drawVignette(oCtx, img.width, img.height, vignetteStrength);
  onResult && onResult({ done: true });
}

// ─── Overlay rendering ────────────────────────────────────────────────────────
// Renders original image as BG, ASCII only on subject

function renderOverlay(img, settings, processCanvasRef, outputRef, onResult) {
  const {
    resolution, brightness, contrast, invertLight,
    vignetteStrength, glowStrength, colorMode, bgBlur, bgDim, selectionRect,
  } = settings;
  const chars = getCharSet(settings);

  const cols = Math.max(40, Math.min(160, Math.round(resolution)));
  const rows = Math.round(cols / (img.width / img.height) * 0.55);

  const pCanvas = processCanvasRef.current;
  pCanvas.width = cols;
  pCanvas.height = rows;
  const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
  pCtx.filter = `brightness(${0.5 + brightness / 100}) contrast(${0.5 + contrast / 100})`;
  pCtx.drawImage(img, 0, 0, cols, rows);
  const { data } = pCtx.getImageData(0, 0, cols, rows);

  // If no selection, render ASCII over full image; otherwise mask to selection
  const subjectMask = selectionRect
    ? generateSelectionMask(cols, rows, selectionRect)
    : null;

  const oCanvas = outputRef.current;
  oCanvas.width = img.width;
  oCanvas.height = img.height;
  const oCtx = oCanvas.getContext('2d');

  // Background
  oCtx.save();
  oCtx.filter = bgBlur > 0
    ? `blur(${bgBlur}px) brightness(${1 - bgDim / 200})`
    : `brightness(${1 - bgDim / 200})`;
  oCtx.drawImage(img, 0, 0, img.width, img.height);
  oCtx.restore();

  const cellW = img.width / cols;
  const cellH = img.height / rows;
  const fontSize = Math.max(6, Math.min(cellW * 1.1, cellH * 1.0));
  oCtx.font = `bold ${fontSize}px "Space Mono", monospace`;
  oCtx.textBaseline = 'middle';
  oCtx.textAlign = 'center';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // If mask exists, skip cells outside selection
      if (subjectMask && subjectMask[row * cols + col] < 0.5) continue;

      const idx = (row * cols + col) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (invertLight) lum = 1 - lum;

      const charIndex = Math.floor(lum * (chars.length - 1));
      const ch = chars[Math.max(0, Math.min(chars.length - 1, charIndex))];
      if (ch === ' ') continue;

      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      const color = getColor(colorMode, r, g, b, 1);

      if (glowStrength > 0) {
        oCtx.shadowColor = color;
        oCtx.shadowBlur = glowStrength / 10;
      } else {
        oCtx.shadowBlur = 0;
      }
      oCtx.fillStyle = color;
      oCtx.fillText(ch, cx, cy);
    }
  }

  oCtx.shadowBlur = 0;
  if (vignetteStrength > 0) drawVignette(oCtx, img.width, img.height, vignetteStrength);
  onResult && onResult({ done: true });
}

// ─── Subject Mask generators ──────────────────────────────────────────────────

function generateSelectionMask(cols, rows, sel) {
  const mask = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const ny = (row + 0.5) / rows;
      let inside = false;

      if (sel.type === 'rect' || !sel.type) {
        // legacy rect support
        const s = sel;
        inside = nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h;

      } else if (sel.type === 'circle') {
        const rx = sel.rx ?? sel.r ?? 0;
        const ry = sel.ry ?? sel.r ?? 0;
        if (rx > 0 && ry > 0) {
          const dx = (nx - sel.cx) / rx;
          const dy = (ny - sel.cy) / ry;
          inside = dx * dx + dy * dy <= 1;
        }

      } else if (sel.type === 'freehand' && sel.points && sel.points.length >= 3) {
        inside = pointInPolygon(nx, ny, sel.points);
      }

      mask[row * cols + col] = inside ? 1 : 0;
    }
  }
  return mask;
}

// Ray casting algorithm — point in polygon
function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function generateSubjectMask(data, cols, rows, emphasisStrength) {
  const gray = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    gray[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }

  const edges = new Float32Array(cols * rows);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const gx = -gray[(y-1)*cols+(x-1)] + gray[(y-1)*cols+(x+1)] - 2*gray[y*cols+(x-1)] + 2*gray[y*cols+(x+1)] - gray[(y+1)*cols+(x-1)] + gray[(y+1)*cols+(x+1)];
      const gy = -gray[(y-1)*cols+(x-1)] - 2*gray[(y-1)*cols+x] - gray[(y-1)*cols+(x+1)] + gray[(y+1)*cols+(x-1)] + 2*gray[(y+1)*cols+x] + gray[(y+1)*cols+(x+1)];
      edges[y*cols+x] = Math.min(1, Math.sqrt(gx*gx + gy*gy) * 2.5);
    }
  }

  const blurred = gaussianBlur(edges, cols, rows, 5);

  const mask = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x / cols - 0.5) * 2;
      const cy = (y / rows - 0.5) * 2;
      const centerBias = Math.max(0, 1 - Math.sqrt(cx*cx + cy*cy) * 0.8);
      mask[y*cols+x] = Math.min(1, blurred[y*cols+x] * 1.8 + centerBias * 0.35 * emphasisStrength);
    }
  }

  let maxV = 0;
  for (let i = 0; i < mask.length; i++) maxV = Math.max(maxV, mask[i]);
  if (maxV > 0) for (let i = 0; i < mask.length; i++) mask[i] /= maxV;
  return mask;
}

function gaussianBlur(data, width, height, radius) {
  const kernelSize = radius * 2 + 1;
  const sigma = radius / 2;
  const kernel = [];
  let kernelSum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const v = Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma));
    kernel.push(v);
    kernelSum += v;
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= kernelSum;

  const tmp = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        sum += data[y * width + Math.max(0, Math.min(width-1, x+k-radius))] * kernel[k];
      }
      tmp[y * width + x] = sum;
    }
  }

  const result = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        sum += tmp[Math.max(0, Math.min(height-1, y+k-radius)) * width + x] * kernel[k];
      }
      result[y * width + x] = sum;
    }
  }
  return result;
}
