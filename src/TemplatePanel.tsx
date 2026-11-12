import { Plus } from 'lucide-react';
import { useState, type RefObject, type PointerEvent } from 'react';
import { durationLabel, type Shift, type ShiftTemplate } from '../shared/schedule.ts';
import type { DragShift } from './ScheduleGrid.tsx';

type Props = {
  templates: ShiftTemplate[];
  shifts: Shift[];
  selectedCount: number;
  disabled: boolean;
  start: string;
  end: string;
  onStart: (time: string) => void;
  onEnd: (time: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onApply: (value: Pick<Shift, 'kind' | 'start' | 'end'>) => void;
  onPointerDrag: (payload: DragShift, event: PointerEvent<HTMLElement>) => void;
  onHint: () => void;
};
export function TemplatePanel({
  templates,
  shifts,
  selectedCount,
  disabled,
  start,
  end,
  onStart,
  onEnd,
  inputRef,
  onApply,
  onPointerDrag,
  onHint,
}: Props) {
  const [attempted, setAttempted] = useState(false);
  const valid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(start) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(end) &&
    start !== end;
  return (
    <aside className="template-panel" aria-label="Настройка смен">
      <h2>Шаблоны смен</h2>
      <div className="template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            className={`template template-${template.id}`}
            draggable={false}
            disabled={disabled}
            onPointerDown={(event) =>
              onPointerDrag(
                { value: { kind: template.id, start: template.start, end: template.end } },
                event,
              )
            }
            onClick={() =>
              selectedCount
                ? onApply({ kind: template.id, start: template.start, end: template.end })
                : onHint()
            }
            aria-label={`Шаблон ${template.name}, ${template.start}–${template.end}`}
          >
            <span className="template-name">{template.name}</span>
            <span className="template-count">
              {shifts.filter((shift) => shift.kind === template.id).length}
            </span>
            <span className="template-time">
              {template.start} - {template.end} · {durationLabel(template.start, template.end)}
            </span>
          </button>
        ))}
      </div>
      <form
        className="custom-shift"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (valid && selectedCount) {
            onApply({ kind: 'custom', start, end });
            setAttempted(false);
          }
        }}
      >
        <h2>Своя смена</h2>
        <div className="time-fields">
          <label>
            Начало
            <input
              ref={inputRef}
              aria-label="Начало смены"
              type="text"
              inputMode="numeric"
              placeholder="09:00"
              pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
              maxLength={5}
              value={start}
              onChange={(event) => onStart(event.target.value)}
              required
              disabled={disabled}
            />
          </label>
          <label>
            Конец
            <input
              aria-label="Конец смены"
              type="text"
              inputMode="numeric"
              placeholder="17:00"
              pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
              maxLength={5}
              value={end}
              onChange={(event) => onEnd(event.target.value)}
              required
              disabled={disabled}
            />
          </label>
        </div>
        <button
          className="button secondary apply-custom"
          type="submit"
          disabled={disabled || !selectedCount}
        >
          <Plus size={20} />
          Поставить в выделенные
        </button>
        {attempted && !valid && (
          <p className="field-error" role="alert">
            Укажите разное время начала и окончания.
          </p>
        )}
        {valid && end < start && (
          <p className="field-note">Окончание на следующий день · {durationLabel(start, end)}</p>
        )}
      </form>
    </aside>
  );
}
