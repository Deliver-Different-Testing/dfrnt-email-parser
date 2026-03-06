import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';
import emailsRouter from './routes/emails.js';
import statsRouter from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  try {
    getDb(); // will throw if DB unreachable
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', error: e.message });
  }
});

app.use('/api/emails', emailsRouter);
app.use('/api/stats', statsRouter);

app.listen(PORT, () => {
  console.log(`[DASHBOARD] Server running on http://localhost:${PORT}`);
});
