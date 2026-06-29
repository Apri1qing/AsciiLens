import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

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
  gesturesDisabled = false,
}) {
  const { t } = useLang();
  const overlayRef = useRef(null);
  const shiftRef = useRef(false);
  const [dragState, setDragState] = useState(null);
  const [editState, setEditState] = useState(null);
  const [freePoints, setFreePoints] = useState([]);

  const activeSelection = useMemo(
    () => selections.find(shape => shape.id === activeSelectionId) || null,
    [activeSelectionId, selections],
  );

  useEffect(() => {
    if (!gesturesDisabled) return;
    setDragState(null);
    setEditState(null);
    setFreePoints([]);
  }, [gesturesDisabled]);

  const normalize = useCallback((clientX, clientY) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const beginDrawing = useCallback((e) => {
    if (gesturesDisabled || (e.pointerType === 'touch' && !e.isPrimary)) return;
    if (e.button !== 0) return;
    e.preventDefault();
    onActiveSelectionChange(null);
    shiftRef.current = e.shiftKey;
    overlayRef.current?.setPointerCapture(e.pointerId);
    const point = normalize(e.clientX, e.clientY);
    setDragState({ start: point, current: point });
    setEditState(null);
    if (shapeMode === 'freehand') setFreePoints([point]);
  }, [gesturesDisabled, normalize, onActiveSelectionChange, shapeMode]);

  const beginMove = useCallback((e, shape) => {
    if (gesturesDisabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    onActiveSelectionChange(shape.id);
    setEditState({
      type: 'move',
      id: shape.id,
      start: normalize(e.clientX, e.clientY),
      original: shape,
    });
    setDragState(null);
  }, [gesturesDisabled, normalize, onActiveSelectionChange]);

  const beginResize = useCallback((e, shape, handle) => {
    if (gesturesDisabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    onActiveSelectionChange(shape.id);
    setEditState({
      type: 'resize',
      id: shape.id,
      handle,
      original: shape,
    });
    setDragState(null);
  }, [gesturesDisabled, onActiveSelectionChange]);

  const beginRotate = useCallback((e, shape) => {
    if (gesturesDisabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    const point = normalize(e.clientX, e.clientY);
    const center = getShapeCenter(shape);
    onActiveSelectionChange(shape.id);
    setEditState({
      type: 'rotate',
      id: shape.id,
      center,
      startAngle: angleBetween(center, point),
      originalRotation: shape.rotation || 0,
      original: shape,
    });
    setDragState(null);
  }, [gesturesDisabled, normalize, onActiveSelectionChange]);

  const onPointerMove = useCallback((e) => {
    if (gesturesDisabled) return;
    const point = normalize(e.clientX, e.clientY);

    if (editState?.type === 'move') {
      const dx = point.x - editState.start.x;
      const dy = point.y - editState.start.y;
      onSelectionUpdate(editState.id, translateShape(editState.original, dx, dy));
      return;
    }

    if (editState?.type === 'resize') {
      onSelectionUpdate(editState.id, resizeShape(editState.original, editState.handle, point));
      return;
    }

    if (editState?.type === 'rotate') {
      const nextAngle = editState.originalRotation + toDegrees(angleBetween(editState.center, point) - editState.startAngle);
      onSelectionUpdate(editState.id, { ...editState.original, rotation: normalizeDegrees(nextAngle) });
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
  }, [dragState, editState, gesturesDisabled, normalize, onSelectionUpdate, shapeMode]);

  const onPointerUp = useCallback((e) => {
    if (gesturesDisabled) return;
    if (editState) {
      setEditState(null);
      return;
    }

    if (!dragState) return;
    const createdShape = createShapeFromDrag(shapeMode, dragState.start, dragState.current, freePoints, e.shiftKey);
    if (createdShape) onSelectionCreate(createdShape);
    setDragState(null);
    setFreePoints([]);
  }, [dragState, editState, freePoints, gesturesDisabled, onSelectionCreate, shapeMode]);

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
  const activeGeometry = activeSelection ? getControlGeometry(activeSelection) : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      role="application"
      aria-label={t('selectionCanvas')}
      tabIndex={0}
      style={{ touchAction: 'none', cursor: editState?.type === 'move' ? 'grabbing' : 'crosshair' }}
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
            active={shape.id === activeSelectionId}
            selectedLabel={t('selectedSelection')}
            onPointerDown={(e) => beginMove(e, shape)}
            onSelect={() => onActiveSelectionChange(shape.id)}
          />
        ))}
        {dragPreview && (
          <SelectionShape
            shape={dragPreview}
            preview
            selectedLabel={t('selectedSelection')}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        {activeSelection && activeGeometry && (
          <SelectionGuideLine geometry={activeGeometry} />
        )}
      </svg>

      {activeSelection && activeGeometry && (
        <SelectionHandleLayer
          geometry={activeGeometry}
          resizeLabel={t('resizeSelection')}
          rotateLabel={t('rotateSelection')}
          onResizePointerDown={(e, handle) => beginResize(e, activeSelection, handle)}
          onRotatePointerDown={(e) => beginRotate(e, activeSelection)}
        />
      )}

      {activeGeometry && (
        <button
          type="button"
          aria-label={t('deleteActiveSelection')}
          title={t('deleteActiveSelection')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDeleteActive}
          className="absolute z-40 flex h-5 w-5 items-center justify-center rounded-full border border-primary/35 bg-background/75 text-primary/85 shadow-[0_0_18px_hsl(var(--primary)/0.18)] backdrop-blur-md transition-all duration-200 hover:border-destructive/55 hover:bg-destructive/85 hover:text-destructive-foreground hover:shadow-[0_0_22px_hsl(var(--destructive)/0.28)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{
            left: `${Math.min(0.98, Math.max(0.02, activeGeometry.deletePoint.x)) * 100}%`,
            top: `${Math.min(0.98, Math.max(0.02, activeGeometry.deletePoint.y)) * 100}%`,
            transform: 'translate(10px, -30px)',
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SelectionShape({ shape, preview = false, active = false, selectedLabel, onPointerDown, onSelect = () => {} }) {
  const strokeColor = preview ? 'hsl(var(--secondary))' : 'transparent';
  const fillColor = preview ? 'hsl(var(--secondary) / 0.16)' : 'transparent';
  const strokeWidth = preview ? '4' : '12';
  const dash = preview ? '10 6' : undefined;
  const center = getShapeCenter(shape);
  const rotation = shape.rotation || 0;
  const transform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : undefined;
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
    <g transform={transform}>
      {shape.type === 'rect' && (
        <rect {...common} strokeLinecap="round" strokeLinejoin="round" x={shape.x} y={shape.y} width={shape.w} height={shape.h} />
      )}
      {shape.type === 'circle' && (
        <ellipse {...common} strokeLinecap="round" strokeLinejoin="round" cx={shape.cx} cy={shape.cy} rx={shape.rx ?? 0} ry={shape.ry ?? 0} />
      )}
      {shape.type === 'freehand' && (
        <path {...common} strokeLinecap="round" strokeLinejoin="round" d={freehandD(shape.points)} />
      )}
      {active && (
        <title>{selectedLabel}</title>
      )}
    </g>
  );
}

function SelectionGuideLine({ geometry }) {
  return (
    <g pointerEvents="none">
      <line
        x1={geometry.rotateAnchor.x}
        y1={geometry.rotateAnchor.y}
        x2={geometry.rotateHandle.x}
        y2={geometry.rotateHandle.y}
        stroke="hsl(var(--primary) / 0.45)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function SelectionHandleLayer({ geometry, resizeLabel, rotateLabel, onResizePointerDown, onRotatePointerDown }) {
  const controls = [
    ['nw', geometry.corners.nw],
    ['ne', geometry.corners.ne],
    ['se', geometry.corners.se],
    ['sw', geometry.corners.sw],
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {controls.map(([handle, point]) => (
        <button
          key={handle}
          type="button"
          aria-label={`${resizeLabel} ${handle}`}
          title={`${resizeLabel} ${handle}`}
          className="pointer-events-auto absolute h-3 w-3 rounded-full border border-primary/80 bg-background/90 shadow-[0_0_12px_hsl(var(--primary)/0.22)] backdrop-blur-sm transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onPointerDown={(e) => onResizePointerDown(e, handle)}
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            cursor: getResizeCursor(handle),
          }}
        />
      ))}
      <button
        type="button"
        aria-label={rotateLabel}
        title={rotateLabel}
        className="pointer-events-auto absolute h-3.5 w-3.5 cursor-grab rounded-full border border-background/80 bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.3)] transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onPointerDown={onRotatePointerDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          left: `${geometry.rotateHandle.x * 100}%`,
          top: `${geometry.rotateHandle.y * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

function getResizeCursor(handle) {
  return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
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
  const bounds = getRenderedBounds(shape);
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

function resizeShape(shape, handle, point) {
  const bounds = getShapeBounds(shape);
  if (bounds.w <= 0 || bounds.h <= 0) return shape;

  const center = getBoundsCenter(bounds);
  const localPoint = rotatePoint(clampPoint(point), center, -(shape.rotation || 0));
  const oppositeHandle = getOppositeHandle(handle);
  const opposite = getBoundsHandlePoint(bounds, oppositeHandle);
  const minSize = 0.025;

  let left = bounds.x;
  let right = bounds.x + bounds.w;
  let top = bounds.y;
  let bottom = bounds.y + bounds.h;

  if (handle.includes('w')) left = Math.min(localPoint.x, opposite.x - minSize);
  if (handle.includes('e')) right = Math.max(localPoint.x, opposite.x + minSize);
  if (handle.includes('n')) top = Math.min(localPoint.y, opposite.y - minSize);
  if (handle.includes('s')) bottom = Math.max(localPoint.y, opposite.y + minSize);

  const nextBounds = clampBounds({
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    w: Math.abs(right - left),
    h: Math.abs(bottom - top),
  });

  return applyBounds(shape, nextBounds);
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

function getRenderedBounds(shape) {
  const geometry = getControlGeometry(shape);
  const xs = Object.values(geometry.corners).map(point => point.x);
  const ys = Object.values(geometry.corners).map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

function getShapeCenter(shape) {
  return getBoundsCenter(getShapeBounds(shape));
}

function getBoundsCenter(bounds) {
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
}

function getControlGeometry(shape) {
  const bounds = getShapeBounds(shape);
  const center = getBoundsCenter(bounds);
  const rotation = shape.rotation || 0;
  const corners = {
    nw: rotatePoint({ x: bounds.x, y: bounds.y }, center, rotation),
    ne: rotatePoint({ x: bounds.x + bounds.w, y: bounds.y }, center, rotation),
    se: rotatePoint({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, center, rotation),
    sw: rotatePoint({ x: bounds.x, y: bounds.y + bounds.h }, center, rotation),
  };
  const topMid = rotatePoint({ x: bounds.x + bounds.w / 2, y: bounds.y }, center, rotation);
  const rotateHandle = clampPoint(rotatePoint({ x: bounds.x + bounds.w / 2, y: bounds.y - 0.07 }, center, rotation));

  return {
    bounds,
    center,
    corners,
    rotateAnchor: topMid,
    rotateHandle,
    deletePoint: clampPoint({
      x: corners.ne.x + (corners.ne.x - center.x) * 0.05,
      y: corners.ne.y + (corners.ne.y - center.y) * 0.05,
    }),
  };
}

function applyBounds(shape, bounds) {
  if (shape.type === 'rect') {
    return { ...shape, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
  }

  if (shape.type === 'circle') {
    return {
      ...shape,
      cx: bounds.x + bounds.w / 2,
      cy: bounds.y + bounds.h / 2,
      rx: bounds.w / 2,
      ry: bounds.h / 2,
    };
  }

  if (shape.type === 'freehand' && shape.points?.length) {
    const originalBounds = getShapeBounds(shape);
    const scaleX = originalBounds.w > 0 ? bounds.w / originalBounds.w : 1;
    const scaleY = originalBounds.h > 0 ? bounds.h / originalBounds.h : 1;
    return {
      ...shape,
      points: shape.points.map(point => ({
        x: bounds.x + (point.x - originalBounds.x) * scaleX,
        y: bounds.y + (point.y - originalBounds.y) * scaleY,
      })),
    };
  }

  return shape;
}

function getBoundsHandlePoint(bounds, handle) {
  return {
    x: handle.includes('w') ? bounds.x : bounds.x + bounds.w,
    y: handle.includes('n') ? bounds.y : bounds.y + bounds.h,
  };
}

function getOppositeHandle(handle) {
  return {
    nw: 'se',
    ne: 'sw',
    se: 'nw',
    sw: 'ne',
  }[handle] || 'se';
}

function clampPoint(point) {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

function clampBounds(bounds) {
  const w = Math.max(0.025, Math.min(1, bounds.w));
  const h = Math.max(0.025, Math.min(1, bounds.h));
  return {
    x: Math.max(0, Math.min(1 - w, bounds.x)),
    y: Math.max(0, Math.min(1 - h, bounds.y)),
    w,
    h,
  };
}

function rotatePoint(point, center, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function angleBetween(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

function normalizeDegrees(degrees) {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function freehandD(points) {
  if (!points || points.length < 2) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ') + 'Z';
}
