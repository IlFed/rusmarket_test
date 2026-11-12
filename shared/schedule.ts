export type ShiftKind = 'morning' | 'day' | 'evening' | 'custom';
export type Shift = {
  employeeId: string;
  date: string;
  start: string;
  end: string;
  kind: ShiftKind;
};
export type Employee = { id: string; name: string; role: string; avatar: string };
export type ShiftTemplate = {
  id: Exclude<ShiftKind, 'custom'>;
  name: string;
  start: string;
  end: string;
};
export type Schedule = {
  employees: Employee[];
  templates: ShiftTemplate[];
  shifts: Shift[];
  revision: number;
  publishedAt: string | null;
};

export const employees: Employee[] = [
  ['alina', 'Кузнецова Алина'],
  ['timur', 'Волков Тимур'],
  ['victoria', 'Морозова Виктория'],
  ['artem', 'Соколов Артём'],
  ['polina', 'Лебедева Полина'],
  ['kirill', 'Новиков Кирилл'],
  ['daria', 'Ерохина Дарья'],
  ['egor', 'Гаврилов Егор'],
].map(([id, name]) => ({ id, name, role: 'агент', avatar: `/avatars/${id}.jpg` }));

export const templates: ShiftTemplate[] = [
  { id: 'morning', name: 'Утро', start: '07:00', end: '15:00' },
  { id: 'day', name: 'День', start: '10:00', end: '18:00' },
  { id: 'evening', name: 'Вечер', start: '15:00', end: '23:00' },
];

export const cellKey = (employeeId: string, date: string) => `${employeeId}:${date}`;
export const shiftKey = (shift: Shift) => cellKey(shift.employeeId, shift.date);
export function shiftMinutes(start: string, end: string) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (minutes(end) - minutes(start) + 1440) % 1440;
}
export const durationLabel = (start: string, end: string) =>
  `${Number((shiftMinutes(start, end) / 60).toFixed(2)).toLocaleString('ru-RU')} ч`;
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function visibleDates(anchor: Date, view: 'week' | 'month') {
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    view === 'month' ? 1 : anchor.getDate() - ((anchor.getDay() + 6) % 7),
  );
  const count =
    view === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Array.from(
    { length: count },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}
export function assignShifts(
  shifts: Shift[],
  keys: string[],
  value: Pick<Shift, 'kind' | 'start' | 'end'>,
): Shift[] {
  const targets = new Set(keys);
  return [
    ...shifts.filter((shift) => !targets.has(shiftKey(shift))),
    ...keys.map((key) => {
      const [employeeId, date] = key.split(':');
      return { employeeId, date, kind: value.kind, start: value.start, end: value.end };
    }),
  ];
}
