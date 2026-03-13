const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve built frontend in production
app.use(express.static(path.join(__dirname, '..', 'dist')));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/todoapp',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Initialize tables
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      board TEXT NOT NULL DEFAULT 'personal',
      deadline TEXT,
      reminder TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(userId) {
  return Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url');
}

function parseToken(token) {
  try { return JSON.parse(Buffer.from(token, 'base64url').toString()); }
  catch { return null; }
}

// Auth middleware
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const data = parseToken(header.slice(7));
  if (!data?.userId) return res.status(401).json({ error: 'Invalid token' });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [data.userId]);
  if (!rows[0]) return res.status(401).json({ error: 'User not found' });
  req.user = rows[0];
  next();
}

// ─── Auth Routes ───

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Email already registered' });

    const id = crypto.randomUUID();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    await pool.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, trimmedName, trimmedEmail, hashPassword(password)]
    );
    const token = generateToken(id);
    res.status(201).json({ token, user: { id, name: trimmedName, email: trimmedEmail } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || user.password_hash !== hashPassword(password))
      return res.status(401).json({ error: 'Invalid email or password' });
    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/me', auth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email });
});

// ─── Task Routes ───

app.get('/api/tasks', auth, async (req, res) => {
  try {
    const board = req.query.board || 'personal';
    const { rows } = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 AND board = $2 ORDER BY created_at DESC',
      [req.user.id, board]
    );
    res.json(rows.map(rowToTask));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { title, description, status, board, deadline, reminder } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, user_id, title, description, status, board, deadline, reminder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, req.user.id, title.trim(), (description || '').trim(), status || 'backlog', board || 'personal', deadline || null, reminder || null]
    );
    res.status(201).json(rowToTask(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Task not found' });
    const old = existing[0];
    const { title, description, status, board, deadline, reminder } = req.body;
    const { rows } = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, status=$3, board=$4, deadline=$5, reminder=$6
       WHERE id=$7 AND user_id=$8 RETURNING *`,
      [
        (title || old.title).trim(),
        (description ?? old.description).trim(),
        status || old.status,
        board || old.board,
        deadline !== undefined ? deadline : old.deadline,
        reminder !== undefined ? reminder : old.reminder,
        req.params.id, req.user.id
      ]
    );
    res.json(rowToTask(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    board: row.board,
    deadline: row.deadline,
    reminder: row.reminder,
    createdAt: row.created_at,
  };
}

// SPA fallback — serve index.html for all non-API routes
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Start server after DB init
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
