import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'DJ Request Live API', database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.get('/api/events/:eventId/requests', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, guest_name, song_title, artist, message, status, amount, created_at FROM requests WHERE event_id = ? ORDER BY created_at DESC',
    [req.params.eventId]
  );
  res.json(rows);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`DJ Request Live API listening on ${port}`));