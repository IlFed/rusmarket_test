import {
  Bell,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Grid2X2,
  Home,
  LoaderCircle,
  Menu,
  PanelLeft,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  assignShifts,
  dateKey,
  durationLabel,
  shiftKey,
  shiftMinutes,
  visibleDates,
  type Shift,
} from '../shared/schedule.ts';
import { ScheduleGrid } from './ScheduleGrid.tsx';
import { TemplatePanel } from './TemplatePanel.tsx';
import { useSchedule } from './useSchedule.ts';
import { usePointerDrag } from './usePointerDrag.ts';

type Picker = { keys: string[]; x: number; y: number; trigger: HTMLElement };

export default function App() {
  const model = useSchedule();
  const [view, setView] = useState<'week' | 'month'>('week');
  // The reference starts on Monday the 1st; June 2026 matches that calendar.
  const [anchor, setAnchor] = useState(new Date(2026, 5, 1));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [page, setPage] = useState<'schedule' | 'home'>('schedule');
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const pointerDrag = usePointerDrag((key, payload) => {
    if (model.saving) return;
    model.change((shifts) =>
      assignShifts(
        shifts.filter((shift) => !payload.source || shiftKey(shift) !== payload.source),
        [key],
        payload.value,
      ),
    );
    setSelected(new Set());
    setToast(payload.source ? 'Смена перенесена' : 'Смена назначена');
  });
  const dates = useMemo(() => visibleDates(anchor, view), [anchor, view]);
  const employees = (model.schedule?.employees || []).filter((employee) =>
    employee.name
      .toLocaleLowerCase('ru-RU')
      .replaceAll('ё', 'е')
      .includes(query.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')),
  );
  const visibleShifts = model.shifts.filter((shift) =>
    dates.some((date) => dateKey(date) === shift.date),
  );
  const employeeCount = new Set([...selected].map((key) => key.split(':')[0])).size;
  const dayCount = new Set([...selected].map((key) => key.split(':')[1])).size;
  const hasAssigned = model.shifts.some((shift) => selected.has(shiftKey(shift)));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!picker) return;
    pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !pickerRef.current?.contains(event.target as Node) &&
        !picker.trigger.contains(event.target as Node)
      )
        setPicker(null);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [picker]);
  useEffect(() => {
    if (help) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [help]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editable =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
      if (editable) return;
      if (event.key === 'Escape') {
        if (picker) {
          picker.trigger.focus();
          setPicker(null);
        } else {
          setSelected(new Set());
          setMobileMenu(false);
          setNotifications(false);
        }
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected.size) {
          event.preventDefault();
          clear();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) model.redo();
        else model.undo();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  function select(keys: Set<string>) {
    setSelected(keys);
    setPicker(null);
  }
  function apply(value: Pick<Shift, 'kind' | 'start' | 'end'>, keys = [...selected]) {
    if (!keys.length || model.saving) return;
    model.change((shifts) => assignShifts(shifts, keys, value));
    setSelected(new Set());
    picker?.trigger.focus();
    setPicker(null);
    setToast(
      `Смена назначена · ${keys.length} ${plural(keys.length, ['ячейка', 'ячейки', 'ячеек'])}`,
    );
  }
  function clear() {
    model.change((shifts) => shifts.filter((shift) => !selected.has(shiftKey(shift))));
    setSelected(new Set());
    setPicker(null);
    setToast('Выбранные смены удалены. Действие можно отменить.');
  }
  function edit() {
    const shift = model.shifts.find((shift) => selected.has(shiftKey(shift)));
    if (shift) {
      setStart(shift.start);
      setEnd(shift.end);
    }
    setPicker(null);
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function openPicker(keys: string[], trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    setSelected(new Set(keys));
    setPicker({
      keys,
      x: Math.min(Math.max(12, rect.left), window.innerWidth - 292),
      y: Math.min(rect.bottom + 8, window.innerHeight - 300),
      trigger,
    });
  }
  function moveDate(direction: number) {
    setAnchor((current) =>
      view === 'week'
        ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7 * direction)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
    setSelected(new Set());
    setPicker(null);
  }
  async function save(publish = false) {
    if (await model.save(publish)) setToast(publish ? 'График опубликован' : 'График сохранён');
  }
  const nav = (target: 'schedule' | 'home') => {
    setPage(target);
    setMobileMenu(false);
    setSelected(new Set());
  };

  return (
    <div
      className={`app-shell ${collapsed ? 'menu-collapsed' : ''}`}
      onClickCapture={(event) => {
        if (pointerDrag.consumeClick()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <a className="skip-link" href="#main">
        Перейти к графику
      </a>
      {mobileMenu && (
        <button
          className="mobile-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`} aria-label="Основное меню">
        <div className="brand-row">
          <button className="brand" onClick={() => nav('home')} aria-label="CRM — главная">
            {collapsed ? 'C' : 'CRM'}
          </button>
          <button
            className="icon-button notification-button"
            aria-label="Уведомления"
            aria-expanded={notifications}
            onClick={() => setNotifications(!notifications)}
          >
            <Bell size={20} />
            {model.dirty && <span className="notification-dot" />}
          </button>
        </div>
        <nav>
          <button
            className={page === 'home' ? 'nav-item active' : 'nav-item'}
            onClick={() => nav('home')}
            title="Главная"
          >
            <Home size={20} />
            <span>Главная</span>
          </button>
          <button
            className={page === 'schedule' ? 'nav-item active' : 'nav-item'}
            onClick={() => nav('schedule')}
            title="Смены"
          >
            <Calendar size={20} />
            <span>Смены</span>
          </button>
        </nav>
        <button
          className="collapse-menu"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeft size={20} />}
          <span>Свернуть меню</span>
        </button>
      </aside>
      {notifications && (
        <section className="notifications floating-panel">
          <div className="popover-heading">
            <strong>Уведомления</strong>
            <button
              className="icon-button"
              aria-label="Закрыть уведомления"
              onClick={() => setNotifications(false)}
            >
              <X size={16} />
            </button>
          </div>
          <p>
            {model.dirty ? 'В графике есть несохранённые изменения.' : 'Все изменения сохранены.'}
          </p>
          {model.schedule?.publishedAt && (
            <p>
              Последняя публикация: {new Date(model.schedule.publishedAt).toLocaleString('ru-RU')}
            </p>
          )}
        </section>
      )}

      <main id="main" className="main-content">
        <div className="breadcrumb">
          <button
            className="icon-button mobile-toggle"
            aria-label="Открыть меню"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <button
            className="back-button"
            aria-label="К списку графиков"
            onClick={() => nav(page === 'schedule' ? 'home' : 'schedule')}
          >
            <ChevronLeft size={20} />
          </button>
          <span>{page === 'schedule' ? 'Графики смен' : 'Главная'}</span>
        </div>
        <header className="page-heading">
          <h1>{page === 'schedule' ? 'График' : 'Обзор'}</h1>
          {page === 'schedule' && (
            <div className="save-actions">
              <span className={`save-status ${model.dirty ? 'is-dirty' : ''}`} aria-live="polite">
                {model.dirty ? 'Не сохранено' : model.schedule?.publishedAt ? 'Опубликовано' : ''}
              </span>
              <button
                className="button secondary"
                disabled={!model.schedule || model.saving || model.conflict}
                onClick={() => void save(true)}
              >
                Опубликовать
              </button>
              <button
                className="button primary"
                disabled={!model.schedule || model.saving || model.conflict}
                onClick={() => void save()}
              >
                {model.saving && <LoaderCircle size={16} className="spin" />}Сохранить
              </button>
            </div>
          )}
        </header>

        {model.error && (
          <div className="error-banner" role="alert">
            <span>{model.error}</span>
            {(model.conflict || !model.schedule) && (
              <button
                onClick={() => {
                  if (
                    !model.dirty ||
                    window.confirm(
                      'Загрузить график с сервера? Несохранённые изменения будут заменены.',
                    )
                  )
                    void model.reload();
                }}
              >
                Загрузить заново
              </button>
            )}
          </div>
        )}
        {model.loading && !model.schedule ? (
          <div className="loading-state">
            <LoaderCircle className="spin" />
            <p>Загружаем график…</p>
          </div>
        ) : !model.schedule ? (
          <div className="loading-state">
            <CalendarDays size={32} />
            <p>График пока недоступен</p>
            <button className="button secondary" onClick={() => void model.reload()}>
              Повторить
            </button>
          </div>
        ) : page === 'home' ? (
          <section className="overview">
            <div className="overview-cards">
              <article>
                <span>Сотрудников</span>
                <strong>{model.schedule.employees.length}</strong>
              </article>
              <article>
                <span>Назначено смен</span>
                <strong>{model.shifts.length}</strong>
              </article>
              <article>
                <span>Рабочих часов</span>
                <strong>
                  {Number(
                    (
                      model.shifts.reduce(
                        (sum, shift) => sum + shiftMinutes(shift.start, shift.end),
                        0,
                      ) / 60
                    ).toFixed(1),
                  ).toLocaleString('ru-RU')}
                </strong>
              </article>
            </div>
            <article className="schedule-summary">
              <CalendarDays size={32} />
              <div>
                <h2>График сотрудников</h2>
                <p>
                  {model.schedule.publishedAt
                    ? `Опубликован ${new Date(model.schedule.publishedAt).toLocaleDateString('ru-RU')}`
                    : 'Черновик · готов к планированию'}
                </p>
              </div>
              <button className="button primary" onClick={() => nav('schedule')}>
                Открыть график
                <ChevronRight size={16} />
              </button>
            </article>
          </section>
        ) : (
          <>
            <div className="editor-layout">
              <section className="schedule-panel" aria-label="Редактор графика">
                <div className="calendar-toolbar">
                  {selected.size ? (
                    <div className="selection-toolbar">
                      <div className="selection-description">
                        <span>Выделено:</span>
                        <span className="selection-badge">
                          {selected.size} {plural(selected.size, ['ячейка', 'ячейки', 'ячеек'])}
                        </span>
                        <span className="selection-detail">
                          {employeeCount}{' '}
                          {plural(employeeCount, ['сотрудник', 'сотрудника', 'сотрудников'])} ·{' '}
                          {dayCount} дн.
                        </span>
                      </div>
                      <div className="selection-actions">
                        <button
                          onClick={(event) => openPicker([...selected], event.currentTarget)}
                          title="Применить шаблон"
                        >
                          <Grid2X2 size={14} />
                          <span>Применить шаблон</span>
                        </button>
                        {hasAssigned && (
                          <button onClick={edit} title="Изменить">
                            <PencilLine size={14} />
                            <span>Изменить</span>
                          </button>
                        )}
                        <button
                          onClick={clear}
                          disabled={!hasAssigned || model.saving}
                          title="Очистить"
                        >
                          <Trash2 size={14} />
                          <span>Очистить</span>
                        </button>
                        <button onClick={() => setSelected(new Set())} title="Снять выделение">
                          <X size={14} />
                          <span>Снять</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="search-field">
                        <Search size={20} />
                        <input
                          aria-label="Поиск по ФИО"
                          placeholder="Поиск по ФИО"
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setSelected(new Set());
                          }}
                        />
                        {query && (
                          <button
                            className="icon-button"
                            aria-label="Очистить поиск"
                            onClick={() => setQuery('')}
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      <div className="view-switch" role="group" aria-label="Период отображения">
                        <button
                          aria-pressed={view === 'month'}
                          onClick={() => {
                            setView('month');
                            setSelected(new Set());
                          }}
                        >
                          Месяц
                        </button>
                        <button
                          aria-pressed={view === 'week'}
                          onClick={() => {
                            setView('week');
                            setSelected(new Set());
                          }}
                        >
                          Неделя
                        </button>
                      </div>
                      <div className="date-navigation">
                        <button
                          className="icon-button"
                          aria-label="Предыдущий период"
                          onClick={() => moveDate(-1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <label className="date-picker" title="Перейти к дате">
                          <span>
                            {anchor
                              .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
                              .replace(' г.', '')}
                          </span>
                          <input
                            type="date"
                            aria-label="Перейти к дате"
                            value={dateKey(anchor)}
                            min="2000-01-01"
                            max="2100-12-31"
                            onChange={(event) => {
                              if (event.target.value) {
                                setAnchor(new Date(`${event.target.value}T12:00:00`));
                                setSelected(new Set());
                              }
                            }}
                          />
                        </label>
                        <button
                          className="icon-button"
                          aria-label="Следующий период"
                          onClick={() => moveDate(1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <ScheduleGrid
                  employees={employees}
                  dates={dates}
                  shifts={model.shifts}
                  selected={selected}
                  month={view === 'month'}
                  disabled={model.saving}
                  onSelect={select}
                  onMenu={openPicker}
                  onPointerDrag={pointerDrag.begin}
                />
              </section>
              <TemplatePanel
                templates={model.schedule.templates}
                shifts={visibleShifts}
                selectedCount={selected.size}
                disabled={model.saving}
                start={start}
                end={end}
                onStart={setStart}
                onEnd={setEnd}
                inputRef={inputRef}
                onApply={apply}
                onPointerDrag={pointerDrag.begin}
                onHint={() => setToast('Выделите ячейки в календаре или перетащите в них шаблон.')}
              />
            </div>
            <div className="editor-footer">
              <div className="history-controls">
                <button
                  className="icon-button"
                  aria-label="Отменить изменение"
                  title="Отменить · ⌘/Ctrl Z"
                  disabled={!model.canUndo || model.saving}
                  onClick={model.undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Повторить изменение"
                  title="Повторить · ⌘/Ctrl Shift Z"
                  disabled={!model.canRedo || model.saving}
                  onClick={model.redo}
                >
                  <Redo2 size={17} />
                </button>
              </div>
              <button className="help-button" onClick={() => setHelp(true)}>
                <CircleHelp size={16} />
                Как работать с графиком
              </button>
            </div>
          </>
        )}
      </main>

      {picker && model.schedule && (
        <div
          className="shift-picker floating-panel"
          ref={pickerRef}
          role="dialog"
          aria-label="Назначить смену"
          style={{ left: picker.x, top: Math.max(12, picker.y) }}
        >
          <div className="popover-heading">
            <strong>Назначить смену</strong>
            <button
              className="icon-button"
              aria-label="Закрыть выбор смены"
              onClick={() => {
                picker.trigger.focus();
                setPicker(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
          {model.schedule.templates.map((template) => (
            <button
              key={template.id}
              className="picker-template"
              onClick={() =>
                apply({ kind: template.id, start: template.start, end: template.end }, picker.keys)
              }
            >
              <span className={`template-dot dot-${template.id}`} />
              <span>
                {template.name}
                <small>
                  {template.start}–{template.end} · {durationLabel(template.start, template.end)}
                </small>
              </span>
              <Plus size={16} />
            </button>
          ))}
          <button className="picker-custom" onClick={edit}>
            <PencilLine size={16} />
            Своя смена
          </button>
          {hasAssigned && (
            <button className="picker-delete" onClick={clear}>
              <Trash2 size={16} />
              Удалить смену
            </button>
          )}
        </div>
      )}
      {pointerDrag.ghost && (
        <div
          className={`drag-ghost shift-${pointerDrag.ghost.payload.value.kind}`}
          style={{ left: pointerDrag.ghost.x + 14, top: pointerDrag.ghost.y + 14 }}
        >
          {pointerDrag.ghost.payload.value.start}–{pointerDrag.ghost.payload.value.end}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="Закрыть сообщение" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        ref={helpRef}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setHelp(false);
        }}
      >
        <div className="popover-heading">
          <h2>Работа с графиком</h2>
          <button
            className="icon-button"
            aria-label="Закрыть справку"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
        </div>
        <ol>
          <li>
            Нажмите на ячейки или протяните указатель, чтобы выделить область. Shift помогает
            выделить диапазон.
          </li>
          <li>Выберите шаблон справа или задайте время собственной смены.</li>
          <li>Нажмите на дату для быстрого назначения. Двойной щелчок по ячейке открывает меню.</li>
          <li>Перетаскивайте готовые смены между ячейками, а шаблоны — из правой панели.</li>
          <li>Сохраните черновик или опубликуйте готовый график.</li>
        </ol>
        <p>
          С клавиатуры: стрелки — перемещение, пробел — выделение, Shift + Enter — меню, Delete —
          очистка, Esc — снять выделение, Ctrl/⌘ + Z — отмена, Ctrl/⌘ + S — сохранение.
        </p>
        <button className="button primary" onClick={() => setHelp(false)}>
          Понятно
        </button>
      </dialog>
    </div>
  );
}

function plural(number: number, forms: [string, string, string]) {
  const last = number % 10,
    hundred = number % 100;
  return forms[
    hundred >= 11 && hundred <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2
  ];
}
