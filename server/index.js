// Trend Desk backend: REST API over SQLite, plus static serving of the built
// app and the committed report printouts in production.
//   Dev:  npm run server  (Vite proxies /api → :3001)
//   Prod: npm run build && npm start

import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openDb, ROOT } from './db.js';
import { createApiRouter } from './routes.js';

const PORT = Number(process.env.PORT || 3001);

const db = openDb();
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/api', createApiRouter(db));

// Static printouts (same URLs Vite dev serves from the repo root). Only the
// committed JSON artifacts are exposed — never the .db files.
app.use('/data/reports', express.static(join(ROOT, 'data', 'reports')));
for (const printout of ['outcomes.json', 'backtests.json']) {
  app.get('/data/' + printout, (req, res) => {
    const p = join(ROOT, 'data', printout);
    if (!existsSync(p)) return res.status(404).json({ error: 'Not generated yet' });
    res.sendFile(p);
  });
}

// Built frontend, when present.
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Trend Desk backend listening on http://localhost:${PORT}`);
  console.log(`DB: ${process.env.TRENDDESK_DB || join(ROOT, 'data', 'trenddesk.db')}`);
  if (!existsSync(dist)) {
    console.log('No dist/ build found — dev mode. Run `npm run dev` and open http://localhost:3000/dashboard.html');
  }
});
