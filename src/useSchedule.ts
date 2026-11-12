import { useCallback, useEffect, useRef, useState } from 'react';
import type { Schedule, Shift } from '../shared/schedule.ts';

type History = { past: Shift[][]; present: Shift[]; future: Shift[][] };
export function useSchedule() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [history, setHistory] = useState<History>({ past: [], present: [], future: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const saved = useRef('[]');
  const saveLock = useRef(false);
  const dirty = JSON.stringify(history.present) !== saved.current;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetch('/api/schedule', { signal });
      if (!result.ok)
        throw new Error('Не удалось загрузить график. Проверьте подключение и попробуйте ещё раз.');
      const data: Schedule = await result.json();
      saved.current = JSON.stringify(data.shifts);
      setSchedule(data);
      setHistory({ past: [], present: data.shifts, future: [] });
      setConflict(false);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Ошибка загрузки.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = useCallback((update: (shifts: Shift[]) => Shift[]) => {
    if (saveLock.current) return;
    setHistory((previous) => {
      const next = update(previous.present);
      if (JSON.stringify(next) === JSON.stringify(previous.present)) return previous;
      return { past: [...previous.past.slice(-49), previous.present], present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => {
    if (saveLock.current) return;
    setHistory((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] }
        : h,
    );
  }, []);
  const redo = useCallback(() => {
    if (saveLock.current) return;
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );
  }, []);
  const save = async (publish = false) => {
    if (!schedule || saveLock.current) return false;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await fetch(publish ? '/api/schedule/publish' : '/api/schedule', {
        method: publish ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shifts: history.present, revision: schedule.revision }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await result.json();
      if (!result.ok) {
        if (result.status === 409) setConflict(true);
        throw new Error(data.error);
      }
      // JSONB normalizes object key order; compare with the exact local snapshot sent.
      saved.current = JSON.stringify(history.present);
      setSchedule(data);
      return true;
    } catch (e) {
      setError(
        e instanceof Error && e.name !== 'TimeoutError'
          ? e.message
          : 'Сервер не ответил. Изменения остались на экране — повторите сохранение.',
      );
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  return {
    schedule,
    shifts: history.present,
    loading,
    saving,
    error,
    conflict,
    dirty,
    change,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    save,
    reload: load,
  };
}
