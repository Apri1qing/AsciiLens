import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * CanvasSelector is the interactive overlay for normalized selection shapes.
 * It owns transient pointer state; Studio owns committed selection data.
 */
export default function CanvasSelector({
  selections = [],
  activeSelectionId,
  onActiveSelectionChange,
  onSelectionCreate,
  onSelectionUpdate,
  onSelectionDelete,
  shapeMode = 'rect',
}) {
  const overlayRef = useRef(null);
  const shiftRef = useRef(false);
  const [dragState, setDragState] = useState(null);
  const [moveState, setMoveState] = useState(null);
  const [freePoints, setFreePoints] = useState([]);

  const activeSelection = useMemo(
    () => selections.find(shape => shape.id === activeSelectionId) || null,
    [activeSelectionId, selections],
  );

  const normalize = useCallback((clientX, clientY) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const beginDrawing = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onActiveSelectionChange(null);
    shiftRef.current = e.shiftKey;
    overlayRef.current?.setPointerCapture(e.pointerId);
    const point = normalize(e.clientX, e.clientY);
    setDragState({ start: point, current: point });
    setMoveState(null);
    if (shapeMode === 'freehand') setFreePoints([point]);
  }, [normalize, onActiveSelectionChange, shapeMode]);

  const beginMove = useCallback((e, shape) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    onActiveSelectionChange(shape.id);
    setMoveState({
      id: shape.id,
      start: normalize(e.clientX, e.clientY),
      original: shape,
    });
    setDragState(null);
  }, [normalize, onActiveSelectionChange]);

  const onPointerMove = useCallback((e) => {
    const point = normalize(e.clientX, e.clientY);

    if (moveState) {
      const dx = point.x - moveState.start.x;
      const dy = point.y - moveState.start.y;
      onSelectionUpdate(moveState.id, translateShape(moveState.original, dx, dy));
      return;
    }

    if (!dragState) return;
    shiftRef.current = e.shiftKey;
    setDragState(state => ({ ...state, current: point }));
    if (shapeMode === 'freehand') {
      setFreePoints(points => {
        const last = points[points.length - 1];
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.006) return points;
        return [...points, point];
      });
    }
  }, [dragState, moveState, normalize, onSelectionUpdate, shapeMode]);

  const onPointerUp = useCallback((e) => {
    if (moveState) {
      setMoveState(null);
      return;
    }

    if (!dragState) return;
    const createdShape = createShapeFromDrag(shapeMode, dragState.start, dragState.current, freePoints, e.shiftKey);
    if (createdShape) onSelectionCreate(createdShape);
    setDragState(null);
    setFreePoints([]);
  }, [dragState, freePoints, moveState, onSelectionCreate, shapeMode]);

  const onDeleteActive = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeSelection) onSelectionDelete(activeSelection.id);
  }, [activeSelection, onSelectionDelete]);

  const onKeyDown = useCallback((e) => {
    if (!activeSelection || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    e.preventDefault();
    onSelectionDelete(activeSelection.id);
  }, [activeSelection, onSelectionDelete]);

  const dragPreview = dragState
    ? createShapeFromDrag(shapeMode, dragState.start, dragState.current, freePoints, shiftRef.current, true)
    : null;
  const activeBounds = activeSelection ? getShapeBounds(activeSelection) : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      role="application"
      aria-label="Selection canvas"
      tabIndex={0}
      style={{ touchAction: 'none', cursor: moveState ? 'grabbing' : 'crosshair' }}
      onPointerDown={beginDrawing}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {selections.map((shape) => (
          <SelectionShape
            key={shape.id}
            shape={shape}
            onPointerDown={(e) => beginMove(e, shape)}
            onSelect={() => onActiveSelectionChange(shape.id)}
          />
        ))}
        {dragPreview && (
          <SelectionShape
            shape={dragPreview}
            preview
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
      </svg>

      {activeBounds && (
        <button
          type="button"
          aria-label="Delete active selection"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDeleteActive}
          className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-primary/35 bg-background/75 text-primary/85 shadow-[0_0_18px_hsl(var(--primary)/0.18)] backdrop-blur-md transition-all duration-200 hover:border-destructive/55 hover:bg-destructive/85 hover:text-destructive-foreground hover:shadow-[0_0_22px_hsl(var(--destructive)/0.28)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{
            left: `${Math.min(0.97, activeBounds.x + activeBounds.w) * 100}%`,
            top: `${Math.max(0.03, activeBounds.y) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SelectionShape({ shape, preview = false, onPointerDown, onSelect = () => {} }) {
  const strokeColor = preview ? 'hsl(var(--secondary))' : 'transparent';
  const fillColor = preview ? 'hsl(var(--secondary) / 0.16)' : 'transparent';
  const strokeWidth = preview ? '4' : '12';
  const dash = preview ? '10 6' : undefined;
  const common = {
    fill: fillColor,
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: dash,
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: preview ? 'none' : 'all',
    style: {
      cursor: preview ? 'crosshair' : 'grab',
      filter: preview ? 'drop-shadow(0 0 10px hsl(var(--secondary))) drop-shadow(0 0 2px hsl(var(--background)))' : undefined,
    },
    onPointerDown,
    onClick: (e) => {
      e.stopPropagation();
      onSelect?.();
    },
  };

  return (
    <g>
      {shape.type === 'rect' && (
        <rect {...common} strokeLinecap="round" strokeLinejoin="round" x={shape.x} y={shape.y} width={shape.w} height={shape.h} />
      )}
      {shape.type === 'circle' && (
        <ellipse {...common} strokeLinecap="round" strokeLinejoin="round" cx={shape.cx} cy={shape.cy} rx={shape.rx ?? 0} ry={shape.ry ?? 0} />
      )}
      {shape.type === 'freehand' && (
        <path {...common} strokeLinecap="round" strokeLinejoin="round" d={freehandD(shape.points)} />
      )}
    </g>
  );
}

function createShapeFromDrag(shapeMode, start, current, freePoints, isShift, allowTiny = false) {
  if (!start || !current) return null;

  if (shapeMode === 'rect') {
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    if (!allowTiny && (w < 0.02 || h < 0.02)) return null;
    return { type: 'rect', x, y, w, h };
  }

  if (shapeMode === 'circle') {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const radius = Math.max(Math.abs(dx), Math.abs(dy));
    const rx = isShift ? radius : Math.abs(dx);
    const ry = isShift ? radius : Math.abs(dy);
    if (!allowTiny && (rx < 0.015 || ry < 0.015)) return null;
    return { type: 'circle', cx: start.x, cy: start.y, rx, ry };
  }

  if (shapeMode === 'freehand') {
    if (!allowTiny && freePoints.length < 3) return null;
    const points = freePoints.length > 1 ? freePoints : [start, current];
    return { type: 'freehand', points: closePoints(points) };
  }

  return null;
}

function closePoints(points) {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) return points;
  return [...points, first];
}

function translateShape(shape, dx, dy) {
  const bounds = getShapeBounds(shape);
  const safeDx = Math.max(-bounds.x, Math.min(1 - bounds.x - bounds.w, dx));
  const safeDy = Math.max(-bounds.y, Math.min(1 - bounds.y - bounds.h, dy));

  if (shape.type === 'rect') {
    return { ...shape, x: shape.x + safeDx, y: shape.y + safeDy };
  }
  if (shape.type === 'circle') {
    return { ...shape, cx: shape.cx + safeDx, cy: shape.cy + safeDy };
  }
  if (shape.type === 'freehand') {
    return {
      ...shape,
      points: shape.points.map(point => ({ x: point.x + safeDx, y: point.y + safeDy })),
    };
  }
  return shape;
}

function getShapeBounds(shape) {
  if (shape.type === 'rect') {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
  if (shape.type === 'circle') {
    const rx = shape.rx ?? 0;
    const ry = shape.ry ?? 0;
    return { x: shape.cx - rx, y: shape.cy - ry, w: rx * 2, h: ry * 2 };
  }
  if (shape.type === 'freehand' && shape.points?.length) {
    const xs = shape.points.map(point => point.x);
    const ys = shape.points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function freehandD(points) {
  if (!points || points.length < 2) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ') + 'Z';
}
