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

connectDB();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  process.env.ADMIN_FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
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

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
