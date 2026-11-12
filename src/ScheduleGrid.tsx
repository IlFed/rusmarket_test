import { CirclePlus } from 'lucide-react';
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  cellKey,
  dateKey,
  durationLabel,
  shiftKey,
  shiftMinutes,
  type Employee,
  type Shift,
} from '../shared/schedule.ts';

export type DragShift = { value: Pick<Shift, 'start' | 'end' | 'kind'>; source?: string };
type Props = {
  employees: Employee[];
  dates: Date[];
  shifts: Shift[];
  selected: Set<string>;
  month: boolean;
  disabled: boolean;
  onSelect: (keys: Set<string>) => void;
  onMenu: (keys: string[], target: HTMLElement) => void;
  onPointerDrag: (payload: DragShift, event: PointerEvent<HTMLElement>) => void;
};

export function ScheduleGrid({
  employees,
  dates,
  shifts,
  selected,
  month,
  disabled,
  onSelect,
  onMenu,
  onPointerDrag,
}: Props) {
  const shiftMap = new Map(shifts.map((shift) => [shiftKey(shift), shift]));
  const anchor = useRef<{ row: number; col: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number; key: string } | null>(null);
  const sweep = useRef<{ row: number; col: number; base: Set<string>; mode: boolean } | null>(null);
  const keysInRect = (row: number, col: number, from: { row: number; col: number }) => {
    const keys: string[] = [];
    for (let r = Math.min(row, from.row); r <= Math.max(row, from.row); r++) {
      for (let c = Math.min(col, from.col); c <= Math.max(col, from.col); c++)
        keys.push(cellKey(employees[r].id, dateKey(dates[c])));
    }
    return keys;
  };
  const begin = (event: PointerEvent, row: number, col: number) => {
    if (disabled || event.button !== 0 || event.pointerType === 'touch') return;
    const key = cellKey(employees[row].id, dateKey(dates[col]));
    const next = new Set(selected);
    if (event.shiftKey && anchor.current)
      keysInRect(row, col, anchor.current).forEach((key) => next.add(key));
    else {
      if (next.has(key)) next.delete(key);
      else next.add(key);
      anchor.current = { row, col };
    }
    sweep.current = { row, col, base: new Set(selected), mode: !selected.has(key) };
    onSelect(next);
  };
  const extend = (event: PointerEvent, row: number, col: number) => {
    if (event.buttons !== 1 || !sweep.current || disabled || event.pointerType === 'touch') return;
    const source = sweep.current;
    const next = new Set(source.base);
    keysInRect(row, col, source).forEach((key) => {
      if (source.mode) next.add(key);
      else next.delete(key);
    });
    onSelect(next);
  };
  const keyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
    key: string,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.shiftKey) onMenu([key], event.currentTarget);
      else {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onSelect(next);
      }
      return;
    }
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    const r = Math.max(0, Math.min(employees.length - 1, row + delta[0]));
    const c = Math.max(0, Math.min(dates.length - 1, col + delta[1]));
    document
      .querySelector<HTMLButtonElement>(
        `[data-cell="${cellKey(employees[r].id, dateKey(dates[c]))}"]`,
      )
      ?.focus();
    if (event.shiftKey) {
      anchor.current ??= { row, col };
      onSelect(new Set([...selected, ...keysInRect(r, c, anchor.current)]));
    }
  };

  return (
    <div
      className={`calendar-scroll ${month ? 'is-month' : ''}`}
      onPointerUp={() => {
        sweep.current = null;
      }}
    >
      <table
        className="calendar"
        style={{ '--days': dates.length } as CSSProperties}
        aria-label={month ? 'График смен на месяц' : 'График смен на неделю'}
      >
        <colgroup>
          <col className="employee-col" />
          {dates.map((date) => (
            <col key={dateKey(date)} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="employee-heading">
              Сотрудник
            </th>
            {dates.map((date) => {
              const day = dateKey(date);
              return (
                <th scope="col" key={day}>
                  <button
                    className="day-heading"
                    disabled={disabled || !employees.length}
                    aria-label={`Назначить смены на ${date.toLocaleDateString('ru-RU')}`}
                    onClick={(event) => {
                      const keys = employees.map((employee) => cellKey(employee.id, day));
                      onSelect(new Set(keys));
                      onMenu(keys, event.currentTarget);
                    }}
                  >
                    <span>{date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                    <span>{date.getDate()}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee, row) => {
            const minutes = shifts
              .filter(
                (shift) =>
                  shift.employeeId === employee.id &&
                  dates.some((date) => dateKey(date) === shift.date),
              )
              .reduce((sum, shift) => sum + shiftMinutes(shift.start, shift.end), 0);
            return (
              <tr key={employee.id}>
                <th scope="row" className="employee-cell">
                  <div className="employee">
                    <img src={employee.avatar} alt="" draggable={false} />
                    <div>
                      <span className="employee-name">{employee.name}</span>
                      <span className="employee-meta">
                        {employee.role} ·{' '}
                        {Number((minutes / 60).toFixed(1)).toLocaleString('ru-RU')} ч
                      </span>
                    </div>
                  </div>
                </th>
                {dates.map((date, col) => {
                  const key = cellKey(employee.id, dateKey(date));
                  const shift = shiftMap.get(key);
                  const isSelected = selected.has(key);
                  return (
                    <td key={key} className={isSelected ? 'cell-selected' : ''}>
                      <button
                        className={`shift-cell ${shift ? `shift-${shift.kind}` : 'shift-empty'}`}
                        data-cell={key}
                        aria-pressed={isSelected}
                        disabled={disabled}
                        aria-label={`${employee.name}, ${date.toLocaleDateString('ru-RU')}, ${shift ? `${shift.start}–${shift.end}, ${durationLabel(shift.start, shift.end)}` : 'нет смены'}`}
                        draggable={false}
                        data-draggable={!!shift}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'touch')
                            touchStart.current = { x: event.clientX, y: event.clientY, key };
                          begin(event, row, col);
                          if (shift && !disabled) {
                            sweep.current = null;
                            onPointerDrag({ value: shift, source: key }, event);
                          }
                        }}
                        onPointerEnter={(event) => extend(event, row, col)}
                        onPointerUp={(event) => {
                          const start = touchStart.current;
                          touchStart.current = null;
                          if (
                            event.pointerType === 'touch' &&
                            start?.key === key &&
                            Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
                          ) {
                            const next = new Set(selected);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            onSelect(next);
                          }
                        }}
                        onPointerCancel={() => {
                          touchStart.current = null;
                        }}
                        onClick={(event) => {
                          if (event.detail === 0) {
                            const next = new Set(selected);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            onSelect(next);
                          }
                        }}
                        onDoubleClick={(event) => onMenu([key], event.currentTarget)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onSelect(new Set([key]));
                          onMenu([key], event.currentTarget);
                        }}
                        onKeyDown={(event) => keyboard(event, row, col, key)}
                      >
                        {shift ? (
                          <>
                            <span className="shift-time">
                              {shift.start.replace(':00', '')} - {shift.end.replace(':00', '')}
                            </span>
                            <span className="shift-duration">
                              {durationLabel(shift.start, shift.end)}
                            </span>
                          </>
                        ) : (
                          <CirclePlus size={20} className="cell-plus" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Покрытие</th>
            {dates.map((date) => {
              const count = shifts.filter((shift) => shift.date === dateKey(date)).length;
              return (
                <td
                  className={count ? 'covered' : 'uncovered'}
                  key={dateKey(date)}
                  title={`${date.toLocaleDateString('ru-RU')}: ${count} смен`}
                >
                  {count}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
      {!employees.length && (
        <div className="empty-search">
          <strong>Сотрудники не найдены</strong>
          <p>Попробуйте изменить имя или фамилию в поиске.</p>
        </div>
      )}
    </div>
  );
}
