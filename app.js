require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const requestRoutes = require('./routes/requests');
const icsRoutes = require('./routes/ics');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://wheno-admin-frontend.vercel.app',
  process.env.ADMIN_FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (curl, Postman, same-origin)
      if (!origin) return callback(null, true);
      // Allow any *.vercel.app preview deploy for this project
      if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin/requests', requestRoutes);
app.use('/api/admin/ics', icsRoutes);

app.get('/api/admin/health', (req, res) => {
  const mongoStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const mongoState = mongoose.connection.readyState;
  const uptimeSec = Math.floor(process.uptime());
  const days  = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins  = Math.floor((uptimeSec % 3600) / 60);
  const secs  = uptimeSec % 60;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: { days, hours, mins, secs, totalSeconds: uptimeSec },
    mongodb: { state: mongoStates[mongoState] || 'unknown', readyState: mongoState },
  });
});

// Public test endpoint — no auth required
app.get('/api/admin/test', async (req, res) => {
  const results = {};

  // 1. Backend alive
  results.backend = { ok: true, message: 'Backend is reachable' };

  // 2. MongoDB state
  const mongoState = mongoose.connection.readyState;
  const mongoOk = mongoState === 1;
  results.mongodb = {
    ok: mongoOk,
    state: ['disconnected','connected','connecting','disconnecting'][mongoState] || 'unknown',
  };

  // 3. DB read — ping the database
  if (mongoOk) {
    try {
      await mongoose.connection.db.admin().ping();
      results.dbPing = { ok: true, message: 'DB ping successful' };
    } catch (e) {
      results.dbPing = { ok: false, message: e.message };
    }
  } else {
    results.dbPing = { ok: false, message: 'Skipped — MongoDB not connected' };
  }

  // 4. Environment variables present (values redacted)
  const requiredEnvs = ['MONGODB_URI','JWT_SECRET','ADMIN_USERNAME','ADMIN_PASSWORD','ADMIN_ACTION_PASSWORD'];
  results.env = {};
  for (const key of requiredEnvs) {
    results.env[key] = process.env[key] ? 'set' : 'MISSING';
  }
  const envOk = requiredEnvs.every(k => !!process.env[k]);

  const allOk = results.backend.ok && mongoOk && results.dbPing.ok && envOk;
  res.status(allOk ? 200 : 500).json({ ok: allOk, results });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
