import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { DragShift } from './ScheduleGrid.tsx';

export function usePointerDrag(commit: (key: string, payload: DragShift) => void) {
  const currentCommit = useRef(commit);
  currentCommit.current = commit;
  const pending = useRef<{
    payload: DragShift;
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ payload: DragShift; x: number; y: number } | null>(null);
  useEffect(() => {
    let hovered: Element | null = null;
    let suppressionTimer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      hovered?.classList.remove('drop-target');
      hovered = null;
      pending.current = null;
      setGhost(null);
    };
    const move = (event: globalThis.PointerEvent) => {
      const drag = pending.current;
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      event.preventDefault();
      const next =
        document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]') ?? null;
      if (hovered !== next) {
        hovered?.classList.remove('drop-target');
        hovered = next;
        hovered?.classList.add('drop-target');
      }
      setGhost({ payload: drag.payload, x: event.clientX, y: event.clientY });
    };
    const finish = (event: globalThis.PointerEvent) => {
      const drag = pending.current;
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved) {
        const key = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('[data-cell]')?.dataset.cell;
        if (key && key !== drag.payload.source) currentCommit.current(key, drag.payload);
        suppressClick.current = true;
        clearTimeout(suppressionTimer);
        suppressionTimer = setTimeout(() => {
          suppressClick.current = false;
        }, 50);
      }
      reset();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', reset);
      clearTimeout(suppressionTimer);
      hovered?.classList.remove('drop-target');
    };
  }, []);
  return {
    ghost,
    begin(payload: DragShift, event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      pending.current = {
        payload,
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    consumeClick() {
      if (!suppressClick.current) return false;
      suppressClick.current = false;
      return true;
    },
  };
}
