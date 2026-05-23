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
  const containerRef = useRef(null);
  const [imgAspect, setImgAspect] = useState(null);
  const [stageSize, setStageSize] = useState(null);

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      const canvas = outputRef.current;
      if (!canvas) return { ok: false, error: 'missing_canvas' };

      try {
        const blob = await canvasToBlob(canvas);
        const fileName = 'asciilens-art.png';
        const file = typeof File === 'function'
          ? new File([blob], fileName, { type: blob.type || 'image/png' })
          : null;

        if (file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'AsciiLens',
              text: 'Exported with AsciiLens',
            });
            return { ok: true, method: 'share' };
          } catch (error) {
            if (error?.name === 'AbortError') return { ok: true, method: 'share_cancelled' };
            throw error;
          }
        }

        const objectUrl = URL.createObjectURL(blob);
        if (isLikelyMobileWebKit()) {
          openPreview(objectUrl);
          return { ok: true, method: 'preview' };
        }

        const downloadStarted = triggerBlobDownload(objectUrl, fileName);
        if (downloadStarted) {
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
          return { ok: true, method: 'download' };
        }

        openPreview(objectUrl);
        return { ok: true, method: 'preview' };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'export_failed',
        };
      }
    },
  }));

  useEffect(() => {
    if (!image) {
      onProcessingChange(false);
      onResult(null);
      return;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    let cancelled = false;
    onProcessingChange(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      setImgAspect(img.width / img.height);
      animFrameRef.current = requestAnimationFrame(() => {
        if (cancelled || !processCanvasRef.current || !outputRef.current) {
          onProcessingChange(false);
          return;
        }
        if (settings.mode === 'full') {
          renderFull(img, settings, processCanvasRef, outputRef, onResult);
        } else {
          renderOverlay(img, settings, processCanvasRef, outputRef, onResult);
        }
        onProcessingChange(false);
      });
    };
    img.onerror = () => {
      if (cancelled) return;
      onProcessingChange(false);
      onResult(null);
    };
    img.src = image.url;

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      onProcessingChange(false);
    };
  }, [image, settings]);

  useEffect(() => {
    if (!imgAspect || !containerRef.current) return;

    const updateStageSize = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;
      const availableWidth = rect.width;
      const availableHeight = rect.height;
      const availableAspect = availableWidth / availableHeight;

      const nextSize = availableAspect > imgAspect
        ? { width: availableHeight * imgAspect, height: availableHeight }
        : { width: availableWidth, height: availableWidth / imgAspect };

      setStageSize({
        width: Math.max(1, Math.floor(nextSize.width)),
        height: Math.max(1, Math.floor(nextSize.height)),
      });
    };

    updateStageSize();
    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [imgAspect]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-0 flex items-center justify-center">
      <canvas ref={processCanvasRef} className="hidden" />
      {/* Wrapper sized to exact image aspect ratio so selector overlays align perfectly. */}
      <div
        className="relative"
        style={imgAspect && stageSize
          ? {
              width: `${stageSize.width}px`,
              height: `${stageSize.height}px`,
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

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas.width || !canvas.height) {
      reject(new Error('empty_canvas'));
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('blob_export_failed'));
    }, 'image/png');
  });
}

function triggerBlobDownload(objectUrl, fileName) {
  const link = document.createElement('a');
  if (typeof link.download !== 'string') return false;

  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function isLikelyMobileWebKit() {
  const userAgent = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function openPreview(objectUrl) {
  const previewWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (previewWindow) return;
  window.location.href = objectUrl;
}

function hexToRgb(hex) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#fffdfd';
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getColor(colorMode, r, g, b, alpha, monoColor = '#fffdfd') {
  if (colorMode === 'original') return `rgba(${r},${g},${b},${alpha})`;
  if (colorMode === 'mono') {
    const mono = hexToRgb(monoColor);
    return `rgba(${mono.r},${mono.g},${mono.b},${alpha})`;
  }
  if (colorMode === 'lime') return `rgba(255,165,198,${alpha})`;
  if (colorMode === 'white') return `rgba(255,253,253,${alpha})`;
  if (colorMode === 'green') return `rgba(139,214,67,${alpha})`;
  if (colorMode === 'neon' || colorMode === 'cyan') return `rgba(0,0,238,${alpha})`;
  if (colorMode === 'coral') return `rgba(255,244,194,${alpha})`;
  return `rgba(255,253,253,${alpha})`;
}

function drawVignette(ctx, w, h, strength) {
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${strength / 130})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ─── Full ASCII rendering ─────────────────────────────────────────────────────
// Renders entire image as ASCII art on an ink background.

function renderFull(img, settings, processCanvasRef, outputRef, onResult) {
  const { resolution, brightness, contrast, invertLight, vignetteStrength, glowStrength, colorMode, monoColor } = settings;
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

  // Ink background
  oCtx.fillStyle = '#000000';
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
      const color = getColor(colorMode, r, g, b, 1, monoColor);

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
    vignetteStrength, selectionRect, selectionShapes, activeSelectionId,
  } = settings;
  const selections = Array.isArray(selectionShapes) && selectionShapes.length > 0
    ? selectionShapes
    : selectionRect
      ? [selectionRect]
      : [];
  const orderedSelections = [...selections].sort((a, b) => {
    if (a.id === activeSelectionId) return 1;
    if (b.id === activeSelectionId) return -1;
    return 0;
  });

  const oCanvas = outputRef.current;
  oCanvas.width = img.width;
  oCanvas.height = img.height;
  const oCtx = oCanvas.getContext('2d');

  drawOverlayBackground(img, settings, processCanvasRef, oCtx);

  orderedSelections.forEach(selection => {
    drawAsciiOverlaySelection(img, selection, { ...settings, ...(selection.settings || {}) }, processCanvasRef, oCtx);
  });

  oCtx.shadowBlur = 0;
  if (vignetteStrength > 0) drawVignette(oCtx, img.width, img.height, vignetteStrength);
  onResult && onResult({ done: true });
}

function drawOverlayBackground(img, settings, processCanvasRef, oCtx) {
  const {
    bgBlur = 0,
    bgDim = 20,
    imageFilterMode = 'original',
    imageFilterColor = '#fffdfd',
  } = settings;
  const filterMode = imageFilterMode === 'mono' || imageFilterMode === 'bw' ? 'mono' : 'original';
  const brightnessFilter = `brightness(${1 - bgDim / 200})`;
  const baseFilter = bgBlur > 0 ? `blur(${bgBlur}px) ${brightnessFilter}` : brightnessFilter;

  if (filterMode === 'original') {
    oCtx.save();
    oCtx.filter = baseFilter;
    oCtx.drawImage(img, 0, 0, img.width, img.height);
    oCtx.restore();
    return;
  }

  const pCanvas = processCanvasRef.current;
  pCanvas.width = img.width;
  pCanvas.height = img.height;
  const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
  pCtx.clearRect(0, 0, img.width, img.height);
  pCtx.filter = baseFilter;
  pCtx.drawImage(img, 0, 0, img.width, img.height);
  pCtx.filter = 'none';

  const imageData = pCtx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;
  const mono = hexToRgb(imageFilterColor);

  for (let i = 0; i < pixels.length; i += 4) {
    const lum = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
    pixels[i] = clampChannel(mono.r * lum);
    pixels[i + 1] = clampChannel(mono.g * lum);
    pixels[i + 2] = clampChannel(mono.b * lum);
  }

  pCtx.putImageData(imageData, 0, 0);
  oCtx.drawImage(pCanvas, 0, 0);
}

function drawAsciiOverlaySelection(img, selection, style, processCanvasRef, oCtx) {
  const {
    resolution, brightness, contrast, invertLight, glowStrength, colorMode, monoColor,
  } = style;
  const chars = getCharSet(style);
  const cols = Math.max(30, Math.min(200, Math.round(resolution)));
  const rows = Math.round(cols / (img.width / img.height) * 0.55);

  const pCanvas = processCanvasRef.current;
  pCanvas.width = cols;
  pCanvas.height = rows;
  const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
  pCtx.clearRect(0, 0, cols, rows);
  pCtx.filter = `brightness(${0.5 + brightness / 100}) contrast(${0.5 + contrast / 100})`;
  pCtx.drawImage(img, 0, 0, cols, rows);
  const { data } = pCtx.getImageData(0, 0, cols, rows);

  const cellW = img.width / cols;
  const cellH = img.height / rows;
  const fontSize = Math.max(6, Math.min(cellW * 1.1, cellH * 1.0));
  oCtx.font = `bold ${fontSize}px "Space Mono", monospace`;
  oCtx.textBaseline = 'middle';
  oCtx.textAlign = 'center';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const ny = (row + 0.5) / rows;
      if (selection && !pointInSelection(nx, ny, selection)) continue;

      const idx = (row * cols + col) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (invertLight) lum = 1 - lum;

      const charIndex = Math.floor(lum * (chars.length - 1));
      const ch = chars[Math.max(0, Math.min(chars.length - 1, charIndex))];
      if (ch === ' ') continue;

      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      const color = getColor(colorMode, r, g, b, 1, monoColor);

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
}

// ─── Subject Mask generators ──────────────────────────────────────────────────

function pointInSelection(nx, ny, sel) {
  const point = applyInverseSelectionRotation(nx, ny, sel);

  if (sel.type === 'rect' || !sel.type) {
    return point.x >= sel.x && point.x <= sel.x + sel.w && point.y >= sel.y && point.y <= sel.y + sel.h;
  }

  if (sel.type === 'circle') {
    const rx = sel.rx ?? sel.r ?? 0;
    const ry = sel.ry ?? sel.r ?? 0;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (point.x - sel.cx) / rx;
    const dy = (point.y - sel.cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  if (sel.type === 'freehand' && sel.points && sel.points.length >= 3) {
    return pointInPolygon(point.x, point.y, sel.points);
  }

  return false;
}

function applyInverseSelectionRotation(nx, ny, sel) {
  if (!sel?.rotation) return { x: nx, y: ny };
  const center = getSelectionCenter(sel);
  const radians = -sel.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = nx - center.x;
  const dy = ny - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function getSelectionCenter(sel) {
  if (sel.type === 'circle') return { x: sel.cx, y: sel.cy };
  const bounds = getSelectionBounds(sel);
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
}

function getSelectionBounds(sel) {
  if (sel.type === 'rect' || !sel.type) {
    return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  }
  if (sel.type === 'circle') {
    const rx = sel.rx ?? sel.r ?? 0;
    const ry = sel.ry ?? sel.r ?? 0;
    return { x: sel.cx - rx, y: sel.cy - ry, w: rx * 2, h: ry * 2 };
  }
  if (sel.type === 'freehand' && sel.points?.length) {
    const xs = sel.points.map(point => point.x);
    const ys = sel.points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
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
