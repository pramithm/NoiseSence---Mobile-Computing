import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  initDatabase,
  insertReading,
  getRecentReadings,
  getHeatmapCells,
  getStats,
  resetToDemoSeed
} from './db.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

// CORS configuration supporting dynamic dev/prod origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman) or any matched origin
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    // In dev, permit all origins for easy testing across phones on local Wi-Fi
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Setup Socket.IO for real-time live map broadcasts
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`[Socket.IO] Client connected: ${socket.id} (Total: ${connectedClients})`);

  // Send current heatmap state immediately on connect
  getHeatmapCells().then((cells) => {
    socket.emit('heatmap:init', cells);
  }).catch((err) => {
    console.error('Error fetching heatmap on connect:', err.message);
  });

  socket.on('disconnect', () => {
    connectedClients = Math.max(0, connectedClients - 1);
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Remaining: ${connectedClients})`);
  });
});

// Health check endpoint (for Render / Vercel keep-alive and diagnostics)
app.get('/api/health', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'NoiseSense Central API',
      connectedSockets: connectedClients,
      storageEngine: stats.storageEngine,
      totalReadings: stats.totalReadings
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/stats - Dashboard summary metrics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

// GET /api/readings - Recent noise readings list
app.get('/api/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const readings = await getRecentReadings(limit);
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve readings', details: err.message });
  }
});

// GET /api/heatmap - Aggregated grid cells for map visualization
app.get('/api/heatmap', async (req, res) => {
  try {
    const cells = await getHeatmapCells();
    res.json(cells);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve heatmap data', details: err.message });
  }
});

// POST /api/readings - Ingest and validate a new noise reading from mobile client
app.post('/api/readings', async (req, res) => {
  try {
    const { decibel, latitude, longitude, accuracy, locationName, source, timestamp } = req.body;

    // Strict validation
    if (decibel === undefined || decibel === null || isNaN(decibel)) {
      return res.status(400).json({ error: 'Valid decibel reading is required (numeric).' });
    }
    const dbValue = parseFloat(decibel);
    if (dbValue < 20 || dbValue > 140) {
      return res.status(400).json({ error: 'Decibel reading must be within plausible physical range (20 - 140 dB).' });
    }

    if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordinates are out of physical bounds.' });
    }

    // Save reading to data store
    const savedReading = await insertReading({
      decibel: dbValue,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ? parseFloat(accuracy) : 5.0,
      locationName: locationName || undefined,
      source: source || 'Mobile Contributor',
      timestamp: timestamp || new Date().toISOString()
    });

    // Compute updated heatmap state and broadcast to all connected clients
    const updatedCells = await getHeatmapCells();
    const updatedStats = await getStats();

    // Real-time Socket.IO broadcasts
    io.emit('reading:new', savedReading);
    io.emit('heatmap:update', updatedCells);
    io.emit('stats:update', updatedStats);

    console.log(`[NoiseSense API] Stored reading: ${savedReading.decibel} dB at (${lat.toFixed(4)}, ${lng.toFixed(4)}) - Broadcast sent.`);

    return res.status(201).json({
      success: true,
      reading: savedReading,
      message: 'Reading successfully recorded and broadcast.'
    });
  } catch (err) {
    console.error('Error inserting reading:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// POST /api/reset-seed - Reset demonstration data
app.post('/api/reset-seed', async (req, res) => {
  try {
    const result = await resetToDemoSeed();
    const cells = await getHeatmapCells();
    const stats = await getStats();
    io.emit('heatmap:update', cells);
    io.emit('stats:update', stats);
    res.json({ message: 'Demo seed data reset successfully.', result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset demo data', details: err.message });
  }
});

// Start server
async function start() {
  await initDatabase();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🚀 NoiseSense Server active on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO listening for live client sync`);
    console.log(`===============================================`);
  });
}

start();
