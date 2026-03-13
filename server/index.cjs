const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { Resend } = require('resend');

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

// ─── Daily Deadline Email Job ───

function formatTimeLeft(deadline) {
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl - now;
  if (diff <= 0) return '⚠️ OVERDUE';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

function buildBoardSection(boardName, tasks) {
  const label = boardName === 'personal' ? '🏠 Personal Tasks' : '💼 Work Tasks';
  if (tasks.length === 0) {
    return `<h2 style="color:#6366f1;">${label}</h2><p style="color:#888;">No tasks in Backlog or WIP — you're all clear! ✅</p>`;
  }
  let html = `<h2 style="color:#6366f1;">${label}</h2>`;
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">';
  html += '<tr style="background:#f1f5f9;"><th style="padding:8px;text-align:left;border:1px solid #e2e8f0;">Task</th><th style="padding:8px;text-align:left;border:1px solid #e2e8f0;">Status</th><th style="padding:8px;text-align:left;border:1px solid #e2e8f0;">Deadline</th><th style="padding:8px;text-align:left;border:1px solid #e2e8f0;">Time Left</th></tr>';
  for (const t of tasks) {
    const timeLeft = formatTimeLeft(t.deadline);
    const isOverdue = timeLeft.includes('OVERDUE');
    const color = isOverdue ? '#ef4444' : '#f59e0b';
    html += `<tr><td style="padding:8px;border:1px solid #e2e8f0;">${t.title}</td><td style="padding:8px;border:1px solid #e2e8f0;">${t.status.toUpperCase()}</td><td style="padding:8px;border:1px solid #e2e8f0;">${new Date(t.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td><td style="padding:8px;border:1px solid #e2e8f0;color:${color};font-weight:bold;">${timeLeft}</td></tr>`;
  }
  html += '</table>';
  return html;
}

async function sendDeadlineEmails() {
  if (!process.env.RESEND_API_KEY) {
    console.log('[cron] Skipping email job — RESEND_API_KEY not set');
    return;
  }

  console.log('[cron] Running daily deadline check...');
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { rows: users } = await pool.query('SELECT id, name, email FROM users');

    for (const user of users) {
      const { rows: allTasks } = await pool.query(
        `SELECT * FROM tasks
         WHERE user_id = $1
           AND status IN ('backlog', 'wip')
           AND deadline IS NOT NULL
           AND deadline::date <= (CURRENT_DATE + INTERVAL '7 days')
         ORDER BY deadline ASC`,
        [user.id]
      );

      const personalTasks = allTasks.filter(t => t.board === 'personal');
      const workTasks = allTasks.filter(t => t.board === 'work');

      const personalSection = buildBoardSection('personal', personalTasks);
      const workSection = buildBoardSection('work', workTasks);

      const urgentCount = allTasks.length;
      const subject = urgentCount > 0
        ? `📋 ${urgentCount} task${urgentCount > 1 ? 's' : ''} approaching deadline — Todo Board`
        : '📋 Daily Todo Board Summary';

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h1 style="color:#1e293b;border-bottom:2px solid #6366f1;padding-bottom:10px;">Good morning, ${user.name}! ☀️</h1>
          <p style="color:#64748b;">Here's your daily task summary for tasks in <strong>Backlog</strong> and <strong>WIP</strong> with deadlines within the next 7 days.</p>
          ${personalSection}
          ${workSection}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
          <p style="color:#94a3b8;font-size:12px;">This is an automated email from your Todo Board app.</p>
        </div>
      `;

      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Todo Board <onboarding@resend.dev>';
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: [user.email],
        subject,
        html,
      });

      if (error) {
        console.error(`[cron] Failed to send to ${user.email}:`, error);
      } else {
        console.log(`[cron] Email sent to ${user.email} (${urgentCount} urgent tasks)`);
      }
    }

    console.log('[cron] Deadline email job completed.');
  } catch (err) {
    console.error('[cron] Email job failed:', err);
  }
}

// Schedule: 8:00 AM CET = 7:00 AM UTC → "0 7 * * *"
cron.schedule('0 7 * * *', sendDeadlineEmails, { timezone: 'Europe/Berlin' });

// Manual trigger for testing (protected, requires auth)
app.post('/api/test-email', auth, async (req, res) => {
  try {
    await sendDeadlineEmails();
    res.json({ success: true, message: 'Deadline emails sent' });
  } catch (e) { console.error('[test-email] Error:', e); res.status(500).json({ error: e.message }); }
});

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
