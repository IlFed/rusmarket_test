import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { Database } from './database.ts';
import { employees, templates, shiftKey, type Shift } from '../shared/schedule.ts';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= '2000-01-01' &&
      value <= '2100-12-31'
    );
  }, 'Некорректная дата');
const payload = z
  .object({
    revision: z.number().int().min(0),
    shifts: z
      .array(
        z
          .object({
            employeeId: z.enum(employees.map((employee) => employee.id) as [string, ...string[]]),
            date,
            start: time,
            end: time,
            kind: z.enum(['morning', 'day', 'evening', 'custom']),
          })
          .strict()
          .refine((shift) => shift.start !== shift.end, 'Начало и конец смены не должны совпадать'),
      )
      .max(50000),
  })
  .strict()
  .refine(
    (value) => new Set(value.shifts.map(shiftKey)).size === value.shifts.length,
    'У сотрудника может быть только одна смена на дату',
  );

type ScheduleRow = Record<string, unknown> & {
  revision: number;
  shifts: Shift[];
  published_at: string | Date | null;
};
const response = (row: ScheduleRow) => ({
  employees,
  templates,
  shifts: row.shifts,
  revision: row.revision,
  publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
});

export function createApp(db: Database) {
  const app = new Hono();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: 'Слишком большой запрос.' }, 413),
    }),
  );
  // The demo is one shared schedule. Production authentication belongs at the reverse proxy.
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET') {
      const origin = c.req.header('Origin');
      const host = c.req.header('Host');
      if (origin) {
        let originHost: string;
        try {
          originHost = new URL(origin).host;
        } catch {
          return c.json({ error: 'Источник запроса не разрешён.' }, 403);
        }
        if (
          originHost !== host &&
          !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin)
        ) {
          return c.json({ error: 'Источник запроса не разрешён.' }, 403);
        }
      }
    }
    await next();
  });
  app.get('/api/health', async (c) => {
    await db.query('SELECT 1');
    return c.json({ status: 'ok' });
  });
  app.get('/api/schedule', async (c) => {
    const [row] = await db.query<ScheduleRow>(
      "SELECT revision, shifts, published_at FROM schedules WHERE id = 'main'",
    );
    return c.json(response(row));
  });
  app.on(['PUT', 'POST'], ['/api/schedule', '/api/schedule/publish'], async (c) => {
    if (
      (c.req.path.endsWith('/publish') && c.req.method !== 'POST') ||
      (!c.req.path.endsWith('/publish') && c.req.method !== 'PUT')
    )
      return c.json({ error: 'Метод не поддерживается.' }, 405);
    let input: unknown;
    try {
      input = await c.req.json();
    } catch {
      return c.json({ error: 'Некорректный JSON.' }, 400);
    }
    const result = payload.safeParse(input);
    if (!result.success)
      return c.json(
        {
          error: 'Проверьте данные графика.',
          details: result.error.issues.map((issue) => issue.message),
        },
        400,
      );
    const publish = c.req.path.endsWith('/publish');
    const { revision, shifts } = result.data;
    const rows = await db.query<ScheduleRow>(
      `UPDATE schedules SET
      shifts = $1::jsonb, revision = revision + 1, updated_at = now()
      ${publish ? ', published_shifts = $1::jsonb, published_at = now()' : ''}
      WHERE id = 'main' AND revision = $2 RETURNING revision, shifts, published_at`,
      [JSON.stringify(shifts), revision],
    );
    if (!rows.length)
      return c.json(
        { error: 'График изменён в другой вкладке. Обновите данные перед сохранением.' },
        409,
      );
    return c.json(response(rows[0]));
  });
  app.onError((error, c) => {
    console.error('Request failed:', error.message);
    return c.json({ error: 'Не удалось обработать запрос. Попробуйте ещё раз.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Маршрут не найден.' }, 404));
  return app;
}
