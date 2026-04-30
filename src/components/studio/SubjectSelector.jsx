import React, { useRef, useState, useCallback } from 'react';
import { useLang } from '@/lib/LanguageContext';

const MODES = ['rect', 'circle', 'freehand'];

export default function SubjectSelector({ imageUrl, selectionRect, onSelectionChange }) {
  const { t } = useLang();
  const containerRef = useRef(null);
  const [shapeMode, setShapeMode] = useState('rect');
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const [freePoints, setFreePoints] = useState([]); // for freehand

  const normalize = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    containerRef.current?.setPointerCapture(e.pointerId);
    const n = normalize(e.clientX, e.clientY);
    setStart(n);
    setCurrent(n);
    setDragging(true);
    if (shapeMode === 'freehand') {
      setFreePoints([n]);
    }
  }, [normalize, shapeMode]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const n = normalize(e.clientX, e.clientY);
    setCurrent(n);
    if (shapeMode === 'freehand') {
      setFreePoints(pts => [...pts, n]);
    }
  }, [dragging, normalize, shapeMode]);

  const onPointerUp = useCallback(() => {
    if (!dragging || !start) return;
    setDragging(false);

    if (shapeMode === 'rect') {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w < 0.02 || h < 0.02) { setStart(null); setCurrent(null); return; }
      onSelectionChange({ type: 'rect', x, y, w, h });

    } else if (shapeMode === 'circle') {
      const cx = start.x;
      const cy = start.y;
      const dx = (current.x - start.x);
      const dy = (current.y - start.y);
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 0.02) { setStart(null); setCurrent(null); return; }
      onSelectionChange({ type: 'circle', cx, cy, r });

    } else if (shapeMode === 'freehand') {
      const pts = freePoints;
      if (pts.length < 3) { setFreePoints([]); setStart(null); setCurrent(null); return; }
      // Auto-close: append first point to close polygon
      const closed = [...pts, pts[0]];
      onSelectionChange({ type: 'freehand', points: closed });
      setFreePoints([]);
    }

    setStart(null);
    setCurrent(null);
  }, [dragging, start, current, shapeMode, freePoints, onSelectionChange]);

  // --- Live drag visuals ---
  const dragRect = shapeMode === 'rect' && dragging && start && current ? {
    x: Math.min(start.x, current.x), y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y),
  } : null;

  const dragCircle = shapeMode === 'circle' && dragging && start && current ? {
    cx: start.x, cy: start.y,
    r: Math.sqrt((current.x - start.x) ** 2 + (current.y - start.y) ** 2),
  } : null;

  const dragFree = shapeMode === 'freehand' && dragging && freePoints.length > 1
    ? freePoints.map(p => `${p.x},${p.y}`).join(' ')
    : null;

  // --- Committed selection visuals ---
  const sel = !dragging ? selectionRect : null;

  const freehandPathD = (points) => {
    if (!points || points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
  };

  return (
    <div className="space-y-2">
      {/* Shape mode tabs */}
      <div className="flex gap-1">
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => { setShapeMode(m); onSelectionChange(null); }}
            className={`flex-1 py-1 font-mono text-[8px] tracking-widest uppercase transition-all
              ${shapeMode === m
                ? 'bg-primary/10 ring-1 ring-primary text-primary'
                : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {m === 'rect' ? (t('shapeRect') || 'RECT') : m === 'circle' ? (t('shapeCircle') || 'CIRCLE') : (t('shapeFree') || 'FREE')}
          </button>
        ))}
      </div>

      {/* Hint */}
      <p className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">
        {shapeMode === 'rect' ? (t('drawHint') || 'Drag to select area') :
         shapeMode === 'circle' ? (t('drawHintCircle') || 'Click center, drag radius') :
         (t('drawHintFree') || 'Draw freely, auto-closes')}
      </p>

      {/* Image + SVG overlay */}
      <div
        ref={containerRef}
        className="relative select-none cursor-crosshair overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          src={imageUrl}
          alt="preview"
          className="w-full block pointer-events-none"
          style={{ maxHeight: '200px', objectFit: 'contain', background: '#000' }}
          draggable={false}
        />

        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {/* Darken mask overlay when committed */}
          {sel && (
            <>
              <rect x="0" y="0" width="1" height="1" fill="rgba(0,0,0,0.45)" />
              {sel.type === 'rect' && <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="rgba(0,0,0,0)" />}
              {sel.type === 'circle' && <circle cx={sel.cx} cy={sel.cy} r={sel.r} fill="rgba(0,0,0,0)" />}
              {sel.type === 'freehand' && <path d={freehandPathD(sel.points)} fill="rgba(0,0,0,0)" />}
            </>
          )}

          {/* Committed selection border */}
          {sel && sel.type === 'rect' && (
            <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h}
              fill="rgba(255,200,50,0.05)" stroke="hsl(43,95%,58%)" strokeWidth="0.005" />
          )}
          {sel && sel.type === 'circle' && (
            <circle cx={sel.cx} cy={sel.cy} r={sel.r}
              fill="rgba(255,200,50,0.05)" stroke="hsl(43,95%,58%)" strokeWidth="0.005" />
          )}
          {sel && sel.type === 'freehand' && (
            <path d={freehandPathD(sel.points)}
              fill="rgba(255,200,50,0.05)" stroke="hsl(43,95%,58%)" strokeWidth="0.005" />
          )}

          {/* Live drag feedback */}
          {dragRect && (
            <rect x={dragRect.x} y={dragRect.y} width={dragRect.w} height={dragRect.h}
              fill="rgba(255,200,50,0.08)" stroke="hsl(43,95%,58%)"
              strokeWidth="0.008" strokeDasharray="0.025 0.015" />
          )}
          {dragCircle && (
            <circle cx={dragCircle.cx} cy={dragCircle.cy} r={dragCircle.r}
              fill="rgba(255,200,50,0.08)" stroke="hsl(43,95%,58%)"
              strokeWidth="0.008" strokeDasharray="0.025 0.015" />
          )}
          {dragFree && (
            <polyline points={dragFree}
              fill="none" stroke="hsl(43,95%,58%)"
              strokeWidth="0.008" strokeDasharray="0.025 0.015" />
          )}
        </svg>
      </div>

      {/* Clear button */}
      {selectionRect && (
        <button
          onClick={() => onSelectionChange(null)}
          className="font-mono text-[9px] tracking-widest text-muted-foreground hover:text-primary uppercase transition-colors"
        >
          ✕ {t('clearSelection')}
        </button>
      )}
    </div>
  );
}