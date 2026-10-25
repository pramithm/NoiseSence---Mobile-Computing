import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const { Pool } = pg;
let pool = null;
let usePostgres = false;

// Default campus demo coordinates (around a lively university campus)
const CAMPUS_CENTER = { lat: 37.7749, lng: -122.4194 }; // San Francisco / Campus reference

// Pre-seeded demo readings to ensure the map and dashboard look rich immediately
const SEED_READINGS = [
  {
    id: 'seed-1',
    decibel: 39.4,
    latitude: 37.7758,
    longitude: -122.4182,
    accuracy: 4.2,
    locationName: 'University Library - 3rd Floor Silence Zone',
    category: 'Quiet',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-2',
    decibel: 72.8,
    latitude: 37.7741,
    longitude: -122.4205,
    accuracy: 5.1,
    locationName: 'Student Union Cafeteria',
    category: 'Moderate',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-3',
    decibel: 83.2,
    latitude: 37.7765,
    longitude: -122.4221,
    accuracy: 6.0,
    locationName: 'University Ave Bus Stop & Transit Hub',
    category: 'Loud',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-4',
    decibel: 91.5,
    latitude: 37.7732,
    longitude: -122.4170,
    accuracy: 3.8,
    locationName: 'Engineering Hall Expansion Construction',
    category: 'Hazardous',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-5',
    decibel: 48.7,
    latitude: 37.7770,
    longitude: -122.4160,
    accuracy: 5.5,
    locationName: 'Memorial Quad & Botanical Garden',
    category: 'Quiet',
    timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-6',
    decibel: 64.3,
    latitude: 37.7745,
    longitude: -122.4148,
    accuracy: 4.9,
    locationName: 'Computer Science Innovation Lab',
    category: 'Moderate',
    timestamp: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    source: 'Demonstration Baseline'
  },
  {
    id: 'seed-7',
    decibel: 76.1,
    latitude: 37.7725,
    longitude: -122.4215,
    accuracy: 6.4,
    locationName: 'Campus South Perimeter Road',
    category: 'Loud',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    source: 'Demonstration Baseline'
  }
];

// Helper to determine noise category
export function categorizeDecibels(db) {
  if (db < 50) return { label: 'Quiet', color: '#10b981', level: 'safe' };
  if (db < 70) return { label: 'Moderate', color: '#06b6d4', level: 'acceptable' };
  if (db < 85) return { label: 'Loud', color: '#f59e0b', level: 'elevated' };
  return { label: 'Hazardous', color: '#ef4444', level: 'harmful' };
}

// In-memory / file fallback store
let memoryStore = {
  readings: [...SEED_READINGS],
  updatedAt: new Date().toISOString()
};

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(memoryStore, null, 2));
  } else {
    try {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.readings) && parsed.readings.length > 0) {
        memoryStore = parsed;
      }
    } catch (e) {
      console.warn('Could not read existing store.json, using defaults:', e.message);
    }
  }
}

function persistStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(memoryStore, null, 2));
  } catch (err) {
    console.error('Failed to persist store.json:', err.message);
  }
}

export async function initDatabase() {
  ensureDataDirectory();

  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    try {
      console.log('Attempting PostgreSQL connection...');
      pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const client = await pool.connect();
      console.log('Connected to PostgreSQL successfully.');
      usePostgres = true;

      // Create schema with PostGIS extension support if available
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE TABLE IF NOT EXISTS noise_readings (
          id VARCHAR(64) PRIMARY KEY,
          decibel NUMERIC(5,2) NOT NULL,
          latitude NUMERIC(9,6) NOT NULL,
          longitude NUMERIC(9,6) NOT NULL,
          accuracy NUMERIC(6,2),
          location_name VARCHAR(255),
          category VARCHAR(32),
          source VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_noise_coords ON noise_readings (latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_noise_created ON noise_readings (created_at DESC);
      `);

      // Check if table is empty, seed if necessary
      const res = await client.query('SELECT COUNT(*) FROM noise_readings');
      if (parseInt(res.rows[0].count, 10) === 0) {
        console.log('Seeding PostgreSQL with initial demonstration readings...');
        for (const r of SEED_READINGS) {
          await client.query(
            `INSERT INTO noise_readings (id, decibel, latitude, longitude, accuracy, location_name, category, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [r.id, r.decibel, r.latitude, r.longitude, r.accuracy, r.locationName, r.category, r.source, r.timestamp]
          );
        }
      }
      client.release();
    } catch (error) {
      console.warn('PostgreSQL connection failed, falling back to local persistent store:', error.message);
      usePostgres = false;
    }
  } else {
    console.log('No DATABASE_URL configured. Running on local persistent file store.');
    usePostgres = false;
  }

  return { usePostgres };
}

// Spatial grid resolution (~0.002 deg is approx 200m)
const GRID_SIZE = 0.002;

export function snapToGrid(lat, lng) {
  const cellLat = Math.round(lat / GRID_SIZE) * GRID_SIZE;
  const cellLng = Math.round(lng / GRID_SIZE) * GRID_SIZE;
  const cellId = `cell_${cellLat.toFixed(3)}_${cellLng.toFixed(3)}`;
  return { cellId, cellLat: parseFloat(cellLat.toFixed(4)), cellLng: parseFloat(cellLng.toFixed(4)) };
}

export async function insertReading(readingData) {
  const categoryInfo = categorizeDecibels(readingData.decibel);
  const reading = {
    id: readingData.id || `read-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    decibel: parseFloat(readingData.decibel.toFixed(1)),
    latitude: parseFloat(readingData.latitude.toFixed(6)),
    longitude: parseFloat(readingData.longitude.toFixed(6)),
    accuracy: readingData.accuracy ? parseFloat(readingData.accuracy.toFixed(1)) : 5.0,
    locationName: readingData.locationName || `Lat ${readingData.latitude.toFixed(3)}, Lng ${readingData.longitude.toFixed(3)}`,
    category: categoryInfo.label,
    source: readingData.source || 'Live Mobile Contribution',
    timestamp: readingData.timestamp || new Date().toISOString()
  };

  if (usePostgres && pool) {
    await pool.query(
      `INSERT INTO noise_readings (id, decibel, latitude, longitude, accuracy, location_name, category, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [reading.id, reading.decibel, reading.latitude, reading.longitude, reading.accuracy, reading.locationName, reading.category, reading.source, reading.timestamp]
    );
  } else {
    memoryStore.readings.unshift(reading);
    persistStore();
  }

  return reading;
}

export async function getRecentReadings(limit = 50) {
  if (usePostgres && pool) {
    const res = await pool.query(
      `SELECT id, decibel, latitude, longitude, accuracy, location_name AS "locationName", category, source, created_at AS "timestamp"
       FROM noise_readings
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map(r => ({ ...r, decibel: parseFloat(r.decibel), latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) }));
  }

  return memoryStore.readings.slice(0, limit);
}

export async function getHeatmapCells() {
  const readings = await getRecentReadings(500);
  const cellMap = new Map();

  for (const r of readings) {
    const { cellId, cellLat, cellLng } = snapToGrid(r.latitude, r.longitude);
    if (!cellMap.has(cellId)) {
      cellMap.set(cellId, {
        cellId,
        lat: cellLat,
        lng: cellLng,
        totalDb: 0,
        count: 0,
        minDb: r.decibel,
        maxDb: r.decibel,
        readings: [],
        lastUpdated: r.timestamp
      });
    }

    const cell = cellMap.get(cellId);
    cell.totalDb += r.decibel;
    cell.count += 1;
    cell.minDb = Math.min(cell.minDb, r.decibel);
    cell.maxDb = Math.max(cell.maxDb, r.decibel);
    if (new Date(r.timestamp) > new Date(cell.lastUpdated)) {
      cell.lastUpdated = r.timestamp;
    }
    if (cell.readings.length < 5) {
      cell.readings.push({ id: r.id, decibel: r.decibel, timestamp: r.timestamp, locationName: r.locationName });
    }
  }

  const cells = Array.from(cellMap.values()).map(cell => {
    const avgDb = parseFloat((cell.totalDb / cell.count).toFixed(1));
    const cat = categorizeDecibels(avgDb);
    return {
      cellId: cell.cellId,
      latitude: cell.lat,
      longitude: cell.lng,
      averageDb: avgDb,
      minDb: parseFloat(cell.minDb.toFixed(1)),
      maxDb: parseFloat(cell.maxDb.toFixed(1)),
      readingCount: cell.count,
      category: cat.label,
      color: cat.color,
      level: cat.level,
      lastUpdated: cell.lastUpdated,
      recentSamples: cell.readings
    };
  });

  return cells;
}

export async function getStats() {
  const readings = await getRecentReadings(500);
  const cells = await getHeatmapCells();

  if (readings.length === 0) {
    return {
      totalReadings: 0,
      activeCells: 0,
      averageNoise: 0,
      maxNoise: 0,
      minNoise: 0,
      loudestArea: 'None',
      quietestArea: 'None',
      storageEngine: usePostgres ? 'PostgreSQL (PostGIS)' : 'Local File Persistence'
    };
  }

  const avg = readings.reduce((acc, r) => acc + r.decibel, 0) / readings.length;
  let max = readings[0];
  let min = readings[0];

  for (const r of readings) {
    if (r.decibel > max.decibel) max = r;
    if (r.decibel < min.decibel) min = r;
  }

  return {
    totalReadings: readings.length,
    activeCells: cells.length,
    averageNoise: parseFloat(avg.toFixed(1)),
    maxNoise: max.decibel,
    minNoise: min.decibel,
    loudestArea: max.locationName || `${max.latitude}, ${max.longitude}`,
    quietestArea: min.locationName || `${min.latitude}, ${min.longitude}`,
    storageEngine: usePostgres ? 'PostgreSQL (PostGIS)' : 'Local Persistent Engine'
  };
}

export async function resetToDemoSeed() {
  if (usePostgres && pool) {
    await pool.query('DELETE FROM noise_readings');
    for (const r of SEED_READINGS) {
      await pool.query(
        `INSERT INTO noise_readings (id, decibel, latitude, longitude, accuracy, location_name, category, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [r.id, r.decibel, r.latitude, r.longitude, r.accuracy, r.locationName, r.category, r.source, r.timestamp]
      );
    }
  } else {
    memoryStore.readings = [...SEED_READINGS];
    persistStore();
  }
  return { success: true, count: SEED_READINGS.length };
}
