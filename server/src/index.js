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
  resetToDemoSeed,
  seedAreaReadings
} from './db.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    return callback(null, true);
  },
  credentials: true
}));

app.use((req, res, next) => {
  // Normalize consecutive slashes e.g. //api/readings -> /api/readings
  if (req.url && req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

app.use(express.json());

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let connectedClients = 0;
let simulationInterval = null;
let isSimulating = false;

// Hyderabad, Telangana preset zones used for real-time simulation streaming
const SIMULATION_ZONES = [
  { name: 'HITEC City Cyber Towers, Hyderabad', lat: 17.4504, lng: 78.3808, baseDb: 74, dominantHz: 640, source: 'IT Corridor Traffic & Commercial Bustle' },
  { name: 'Charminar Heritage & Old City Bazaar, Hyderabad', lat: 17.3616, lng: 78.4747, baseDb: 83, dominantHz: 720, source: 'Historic Market Din & Autorickshaws' },
  { name: 'Hussain Sagar Tank Bund Promenade, Hyderabad', lat: 17.4239, lng: 78.4738, baseDb: 58, dominantHz: 280, source: 'Lakefront Breeze & Promenade Footfall' },
  { name: 'KBR National Park (Jubilee Hills), Hyderabad', lat: 17.4277, lng: 78.4208, baseDb: 40, dominantHz: 140, source: 'Protected Forest Sanctuary & Birdsong' },
  { name: 'Osmania University Arts College, Hyderabad', lat: 17.4138, lng: 78.5284, baseDb: 44, dominantHz: 120, source: 'Academic Walkways & Library Quiet' },
  { name: 'Secunderabad Railway Junction, Hyderabad', lat: 17.4334, lng: 78.5045, baseDb: 89, dominantHz: 3100, source: 'Locomotives & Transit Hub Congestion' },
  { name: 'Gachibowli Financial District, Hyderabad', lat: 17.4401, lng: 78.3489, baseDb: 69, dominantHz: 520, source: 'Flyover Traffic & Corporate Commute' }
];

function triggerSimulatedReading() {
  const zone = SIMULATION_ZONES[Math.floor(Math.random() * SIMULATION_ZONES.length)];
  // Realistic natural fluctuation (+- 4 dB)
  const fluctuation = (Math.random() * 8) - 4;
  const currentDb = parseFloat(Math.max(32, zone.baseDb + fluctuation).toFixed(1));
  const hzFluctuation = Math.round((Math.random() * 60) - 30);
  const currentHz = Math.max(50, zone.dominantHz + hzFluctuation);

  const lowP = zone.dominantHz < 200 ? 65 : zone.dominantHz < 2000 ? 25 : 15;
  const midP = zone.dominantHz >= 200 && zone.dominantHz <= 3000 ? 60 : 25;
  const highP = Math.max(5, 100 - lowP - midP);

  const payload = {
    decibel: currentDb,
    latitude: zone.lat + (Math.random() * 0.0004 - 0.0002),
    longitude: zone.lng + (Math.random() * 0.0004 - 0.0002),
    accuracy: parseFloat((3 + Math.random() * 3).toFixed(1)),
    locationName: zone.name,
    source: 'Live Stream Contributor',
    dominantFrequency: currentHz,
    frequencyBand: currentHz < 250 ? 'Low (Rumble)' : currentHz < 4000 ? 'Mid (Speech/Urban)' : 'High (Machinery/Siren)',
    frequencyDistribution: { lowPercent: lowP, midPercent: midP, highPercent: highP },
    estimatedSource: zone.source,
    timestamp: new Date().toISOString()
  };

  insertReading(payload).then(async (savedReading) => {
    const updatedCells = await getHeatmapCells();
    const updatedStats = await getStats();

    io.emit('reading:new', savedReading);
    io.emit('heatmap:update', updatedCells);
    io.emit('stats:update', updatedStats);
  }).catch((err) => {
    console.error('Error during simulated reading broadcast:', err.message);
  });
}

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`[Socket.IO] Client connected: ${socket.id} (Total: ${connectedClients})`);

  getHeatmapCells().then((cells) => {
    socket.emit('heatmap:init', cells);
  }).catch((err) => {
    console.error('Error fetching heatmap on connect:', err.message);
  });

  socket.emit('simulation:status', { active: isSimulating });

  socket.on('disconnect', () => {
    connectedClients = Math.max(0, connectedClients - 1);
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Remaining: ${connectedClients})`);
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'NoiseSense Central API',
      connectedSockets: connectedClients,
      storageEngine: stats.storageEngine,
      totalReadings: stats.totalReadings,
      simulationActive: isSimulating
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

app.get('/api/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const readings = await getRecentReadings(limit);
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve readings', details: err.message });
  }
});

app.get('/api/heatmap', async (req, res) => {
  try {
    const cells = await getHeatmapCells();
    res.json(cells);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve heatmap data', details: err.message });
  }
});

app.post('/api/readings', async (req, res) => {
  try {
    const {
      decibel, latitude, longitude, accuracy, locationName, source, timestamp,
      dominantFrequency, frequencyBand, frequencyDistribution, estimatedSource
    } = req.body;

    if (decibel === undefined || decibel === null || isNaN(decibel)) {
      return res.status(400).json({ error: 'Valid decibel reading is required (numeric).' });
    }
    const dbValue = parseFloat(decibel);
    if (dbValue < 20 || dbValue > 140) {
      return res.status(400).json({ error: 'Decibel reading must be within physical range (20 - 140 dB).' });
    }

    if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordinates are out of physical bounds.' });
    }

    const savedReading = await insertReading({
      decibel: dbValue,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ? parseFloat(accuracy) : 5.0,
      locationName: locationName || undefined,
      source: source || 'Mobile Contributor',
      timestamp: timestamp || new Date().toISOString(),
      dominantFrequency: dominantFrequency ? parseFloat(dominantFrequency) : undefined,
      frequencyBand: frequencyBand || undefined,
      frequencyDistribution: frequencyDistribution || undefined,
      estimatedSource: estimatedSource || undefined
    });

    const updatedCells = await getHeatmapCells();
    const updatedStats = await getStats();

    io.emit('reading:new', savedReading);
    io.emit('heatmap:update', updatedCells);
    io.emit('stats:update', updatedStats);

    return res.status(201).json({
      success: true,
      reading: savedReading,
      message: 'Reading recorded, aggregated, and broadcast.'
    });
  } catch (err) {
    console.error('Error inserting reading:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// POST /api/simulation/toggle - Turn live simulated stream on/off
app.post('/api/simulation/toggle', (req, res) => {
  isSimulating = !isSimulating;

  if (isSimulating) {
    console.log('[Simulation] Started real-time multi-node stream (every 3s)');
    // Emit one reading immediately
    triggerSimulatedReading();
    simulationInterval = setInterval(triggerSimulatedReading, 3000);
  } else {
    console.log('[Simulation] Stopped real-time stream');
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
  }

  io.emit('simulation:status', { active: isSimulating });
  res.json({ active: isSimulating, message: isSimulating ? 'Live stream simulation active' : 'Live stream stopped' });
});

app.post('/api/seed-area', async (req, res) => {
  try {
    const { latitude, longitude, locationName } = req.body;
    if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const name = locationName || 'Local Area';

    const createdReadings = await seedAreaReadings(lat, lng, name);
    const updatedCells = await getHeatmapCells();
    const updatedStats = await getStats();

    io.emit('heatmap:update', updatedCells);
    io.emit('stats:update', updatedStats);
    for (const r of createdReadings) {
      io.emit('reading:new', r);
    }

    res.json({
      success: true,
      message: `Seeded 5 sample noise readings around ${name}.`,
      readings: createdReadings,
      cells: updatedCells
    });
  } catch (err) {
    console.error('Error seeding area readings:', err);
    res.status(500).json({ error: 'Failed to seed area readings', details: err.message });
  }
});

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
