import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { createDatabase, type Database } from '../server/database.ts';
import {
  assignShifts,
  dateKey,
  shiftMinutes,
  visibleDates,
  type Shift,
} from '../shared/schedule.ts';

const shift: Shift = {
  employeeId: 'alina',
  date: '2026-06-01',
  start: '07:00',
  end: '15:00',
  kind: 'morning',
};

describe('Schedule API with real PostgreSQL engine', () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  before(async () => {
    db = await createDatabase(process.env.TEST_DATABASE_URL || 'memory://');
    app = createApp(db);
  });
  after(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.query(
      "UPDATE schedules SET shifts = '[]', revision = 0, published_at = NULL, published_shifts = NULL WHERE id = 'main'",
    );
  });
  const write = (body: unknown, path = '/api/schedule', method = 'PUT') =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns all employees and reusable templates', async () => {
    const response = await app.request('/api/schedule');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.employees.length, 8);
    assert.equal(data.templates.length, 3);
    assert.deepEqual(data.shifts, []);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
  it('saves assignments and reads the durable result', async () => {
    const response = await write({ revision: 0, shifts: [shift] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
    const data = await (await app.request('/api/schedule')).json();
    assert.deepEqual(data.shifts, [shift]);
  });
  it('rejects invalid employees, dates, times, duplicate cells, and zero-length shifts atomically', async () => {
    for (const shifts of [
      [{ ...shift, employeeId: 'unknown' }],
      [{ ...shift, date: '2026-02-30' }],
      [{ ...shift, start: '25:00' }],
      [{ ...shift, end: '07:00' }],
      [shift, shift],
    ]) {
      assert.equal((await write({ revision: 0, shifts })).status, 400);
      assert.equal((await (await app.request('/api/schedule')).json()).revision, 0);
    }
  });
  it('allows overnight shifts', async () => {
    assert.equal(
      (
        await write({
          revision: 0,
          shifts: [{ ...shift, start: '22:00', end: '06:00', kind: 'custom' }],
        })
      ).status,
      200,
    );
  });
  it('allows only one of two concurrent writers with the same revision', async () => {
    const results = await Promise.all([
      write({ revision: 0, shifts: [shift] }),
      write({ revision: 0, shifts: [{ ...shift, employeeId: 'timur' }] }),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await (await app.request('/api/schedule')).json()).revision, 1);
  });
  it('publishes an independent snapshot and preserves it while editing the draft', async () => {
    const published = await write(
      { revision: 0, shifts: [shift] },
      '/api/schedule/publish',
      'POST',
    );
    assert.equal(published.status, 200);
    assert.ok((await published.json()).publishedAt);
    assert.equal((await write({ revision: 1, shifts: [] })).status, 200);
    const [row] = await db.query('SELECT shifts, published_shifts FROM schedules');
    assert.deepEqual(row.shifts, []);
    assert.deepEqual(row.published_shifts, [shift]);
  });
  it('handles malformed JSON and rejects cross-origin mutation', async () => {
    assert.equal((await app.request('/api/schedule', { method: 'PUT', body: '{' })).status, 400);
    assert.equal(
      (
        await app.request('/api/schedule', {
          method: 'PUT',
          headers: { Origin: 'https://unexpected.example', Host: 'localhost:3001' },
          body: JSON.stringify({ revision: 0, shifts: [] }),
        })
      ).status,
      403,
    );
  });
});

it('preserves schedule through database shutdown and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'russmarket-db-test-'));
  try {
    let db = await createDatabase(dir);
    await db.query("UPDATE schedules SET shifts = $1::jsonb, revision = 7 WHERE id = 'main'", [
      JSON.stringify([shift]),
    ]);
    await db.close();
    db = await createDatabase(dir);
    const [row] = await db.query('SELECT shifts, revision FROM schedules');
    assert.deepEqual(row.shifts, [shift]);
    assert.equal(row.revision, 7);
    await db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Calendar behavior', () => {
  it('starts weeks on Monday across month and year boundaries', () => {
    const week = visibleDates(new Date(2027, 0, 1), 'week').map(dateKey);
    assert.equal(week[0], '2026-12-28');
    assert.equal(week[6], '2027-01-03');
    assert.equal(visibleDates(new Date(2028, 1, 15), 'month').length, 29);
  });
  it('calculates actual and overnight durations', () => {
    assert.equal(shiftMinutes('15:00', '23:00'), 480);
    assert.equal(shiftMinutes('10:00', '23:00'), 780);
    assert.equal(shiftMinutes('22:30', '06:00'), 450);
  });
  it('replaces selected cells without losing unrelated shifts or drag destinations', () => {
    const source = { ...shift, employeeId: 'timur', date: '2026-06-02' };
    const result = assignShifts([shift], ['alina:2026-06-03', 'polina:2026-06-03'], source);
    assert.equal(result.length, 3);
    assert.deepEqual(result[0], shift);
    assert.equal(result[1].employeeId, 'alina');
    assert.equal(result[1].date, '2026-06-03');
    assert.equal(
      assignShifts(result, ['alina:2026-06-03'], { ...shift, kind: 'custom' }).length,
      3,
    );
  });
});
