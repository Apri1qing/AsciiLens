import React, { useRef, useState, useCallback } from 'react';

/**
 * CanvasSelector — absolutely-positioned overlay on top of the AsciiCanvas output.
 * All toolbar controls live in EditorPanel; this component is drawing-only.
 */
export default function CanvasSelector({ selectionRect, onSelectionChange, shapeMode = 'rect' }) {
  const overlayRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const [freePoints, setFreePoints] = useState([]);
  const shiftRef = useRef(false);

  const normalize = useCallback((clientX, clientY) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    shiftRef.current = e.shiftKey;
    overlayRef.current?.setPointerCapture(e.pointerId);
    const n = normalize(e.clientX, e.clientY);
    setStart(n);
    setCurrent(n);
    setDragging(true);
    if (shapeMode === 'freehand') setFreePoints([n]);
  }, [normalize, shapeMode]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    shiftRef.current = e.shiftKey;
    const n = normalize(e.clientX, e.clientY);
    setCurrent(n);
    if (shapeMode === 'freehand') setFreePoints(pts => [...pts, n]);
  }, [dragging, normalize, shapeMode]);

  const onPointerUp = useCallback((e) => {
    if (!dragging || !start) return;
    setDragging(false);
    const isShift = e.shiftKey;

    if (shapeMode === 'rect') {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w < 0.02 || h < 0.02) { setStart(null); setCurrent(null); return; }
      onSelectionChange({ type: 'rect', x, y, w, h });
    } else if (shapeMode === 'circle') {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (isShift) {
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        if (r < 0.02) { setStart(null); setCurrent(null); return; }
        onSelectionChange({ type: 'circle', cx: start.x, cy: start.y, rx: r, ry: r });
      } else {
        const rx = Math.abs(dx);
        const ry = Math.abs(dy);
        if (rx < 0.01 && ry < 0.01) { setStart(null); setCurrent(null); return; }
        onSelectionChange({ type: 'circle', cx: start.x, cy: start.y, rx, ry });
      }
    } else if (shapeMode === 'freehand') {
      if (freePoints.length < 3) { setFreePoints([]); setStart(null); setCurrent(null); return; }
      onSelectionChange({ type: 'freehand', points: [...freePoints, freePoints[0]] });
      setFreePoints([]);
    }

    setStart(null);
    setCurrent(null);
  }, [dragging, start, current, shapeMode, freePoints, onSelectionChange]);

  // Live drag visuals
  const dragRect = shapeMode === 'rect' && dragging && start && current ? {
    x: Math.min(start.x, current.x), y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y),
  } : null;

  const dragCircle = shapeMode === 'circle' && dragging && start && current ? {
    cx: start.x, cy: start.y,
    rx: shiftRef.current
      ? Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y))
      : Math.abs(current.x - start.x),
    ry: shiftRef.current
      ? Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y))
      : Math.abs(current.y - start.y),
  } : null;

  const dragFree = shapeMode === 'freehand' && dragging && freePoints.length > 1
    ? freePoints.map(p => `${p.x},${p.y}`).join(' ')
    : null;

  const sel = !dragging ? selectionRect : null;

  const freehandD = (points) => {
    if (!points || points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
  };

  const strokeColor = 'hsl(43,95%,58%)';
  const sw = '0.004';
  const swDrag = '0.005';
  const dash = '0.02 0.012';

  return (
    <div
      ref={overlayRef}
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {sel && (
          <>
            {sel.type === 'rect' && (
              <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h}
                fill="none" stroke={strokeColor} strokeWidth={sw} />
            )}
            {sel.type === 'circle' && (
              <ellipse cx={sel.cx} cy={sel.cy} rx={sel.rx ?? sel.r ?? 0} ry={sel.ry ?? sel.r ?? 0}
                fill="none" stroke={strokeColor} strokeWidth={sw} />
            )}
            {sel.type === 'freehand' && (
              <path d={freehandD(sel.points)} fill="none" stroke={strokeColor} strokeWidth={sw} />
            )}
          </>
        )}
        {dragRect && (
          <rect x={dragRect.x} y={dragRect.y} width={dragRect.w} height={dragRect.h}
            fill="rgba(255,200,50,0.06)" stroke={strokeColor} strokeWidth={swDrag} strokeDasharray={dash} />
        )}
        {dragCircle && (
          <ellipse cx={dragCircle.cx} cy={dragCircle.cy} rx={dragCircle.rx} ry={dragCircle.ry}
            fill="rgba(255,200,50,0.06)" stroke={strokeColor} strokeWidth={swDrag} strokeDasharray={dash} />
        )}
        {dragFree && (
          <polyline points={dragFree} fill="none" stroke={strokeColor} strokeWidth={swDrag} strokeDasharray={dash} />
        )}
      </svg>
    </div>
  );
}