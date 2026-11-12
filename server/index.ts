import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import { createDatabase } from './database.ts';
import { createApp } from './app.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const db = await createDatabase();
const app = createApp(db);
app.all('/api/*', (c) => c.json({ error: 'Маршрут не найден.' }, 404));
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT || 3001),
    hostname: process.env.HOST || '127.0.0.1',
  },
  (info) => console.log(`CRM ready on http://127.0.0.1:${info.port}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    await db.close();
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
