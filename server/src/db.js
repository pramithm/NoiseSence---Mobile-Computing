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

// Pre-seeded demo readings with rich acoustic frequency profiles
const SEED_READINGS = [
  {
    id: 'seed-1',
    decibel: 39.4,
    latitude: 37.7758,
    longitude: -122.4182,
    accuracy: 4.2,
    locationName: 'University Library - 3rd Floor Silence Zone',
    category: 'Quiet',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 120,
    frequencyBand: 'Low (Rumble)',
    frequencyDistribution: { lowPercent: 58, midPercent: 32, highPercent: 10 },
    estimatedSource: 'HVAC Airflow / Whisper Quiet'
  },
  {
    id: 'seed-2',
    decibel: 72.8,
    latitude: 37.7741,
    longitude: -122.4205,
    accuracy: 5.1,
    locationName: 'Student Union Cafeteria',
    category: 'Moderate',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 580,
    frequencyBand: 'Mid (Speech/Urban)',
    frequencyDistribution: { lowPercent: 24, midPercent: 62, highPercent: 14 },
    estimatedSource: 'Active Social Babble & Cutlery'
  },
  {
    id: 'seed-3',
    decibel: 83.2,
    latitude: 37.7765,
    longitude: -122.4221,
    accuracy: 6.0,
    locationName: 'University Ave Bus Stop & Transit Hub',
    category: 'Loud',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 85,
    frequencyBand: 'Low (Rumble)',
    frequencyDistribution: { lowPercent: 68, midPercent: 22, highPercent: 10 },
    estimatedSource: 'Diesel Transit Bus & Traffic Tires'
  },
  {
    id: 'seed-4',
    decibel: 91.5,
    latitude: 37.7732,
    longitude: -122.4170,
    accuracy: 3.8,
    locationName: 'Engineering Hall Expansion Construction',
    category: 'Hazardous',
    timestamp: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 3400,
    frequencyBand: 'High (Machinery/Siren)',
    frequencyDistribution: { lowPercent: 35, midPercent: 25, highPercent: 40 },
    estimatedSource: 'Pneumatic Drill & Steel Grinding'
  },
  {
    id: 'seed-5',
    decibel: 48.7,
    latitude: 37.7770,
    longitude: -122.4160,
    accuracy: 5.5,
    locationName: 'Memorial Quad & Botanical Garden',
    category: 'Quiet',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 2400,
    frequencyBand: 'High (Machinery/Siren)',
    frequencyDistribution: { lowPercent: 20, midPercent: 45, highPercent: 35 },
    estimatedSource: 'Fountain Water & Ambient Breeze'
  },
  {
    id: 'seed-6',
    decibel: 64.3,
    latitude: 37.7745,
    longitude: -122.4148,
    accuracy: 4.9,
    locationName: 'Computer Science Innovation Lab',
    category: 'Moderate',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 450,
    frequencyBand: 'Mid (Speech/Urban)',
    frequencyDistribution: { lowPercent: 30, midPercent: 55, highPercent: 15 },
    estimatedSource: 'Collaborative Discussion & Keyboards'
  },
  {
    id: 'seed-7',
    decibel: 76.1,
    latitude: 37.7725,
    longitude: -122.4215,
    accuracy: 6.4,
    locationName: 'Campus South Perimeter Road',
    category: 'Loud',
    timestamp: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    source: 'Demonstration Baseline',
    dominantFrequency: 110,
    frequencyBand: 'Low (Rumble)',
    frequencyDistribution: { lowPercent: 62, midPercent: 28, highPercent: 10 },
    estimatedSource: 'Vehicle Traffic & Acceleration'
  }
];

export function categorizeDecibels(db) {
  if (db < 50) return { label: 'Quiet', color: '#10b981', level: 'safe' };
  if (db < 70) return { label: 'Moderate', color: '#06b6d4', level: 'acceptable' };
  if (db < 85) return { label: 'Loud', color: '#f59e0b', level: 'elevated' };
  return { label: 'Hazardous', color: '#ef4444', level: 'harmful' };
}

export function computeWhoGuideline(avgDb) {
  if (avgDb < 55) {
    return {
      compliance: 'Compliant',
      daytimeLimit: 55,
      nighttimeLimit: 45,
      maxSafeExposure: 'Continuous (No Limit)',
      healthAdvice: 'Acoustically safe environment for extended rest and concentration according to WHO environmental limits.'
    };
  }
  if (avgDb < 70) {
    return {
      compliance: 'Caution',
      daytimeLimit: 55,
      nighttimeLimit: 45,
      maxSafeExposure: 'Up to 8–12 hours',
      healthAdvice: 'Acceptable daytime background sound. Sensitive individuals may experience mild cognitive fatigue over prolonged periods.'
    };
  }
  if (avgDb < 85) {
    return {
      compliance: 'Exceeded',
      daytimeLimit: 55,
      nighttimeLimit: 45,
      maxSafeExposure: 'Limit to 4–8 hours without breaks',
      healthAdvice: 'Exceeds WHO community guideline limits. Chronic exposure contributes to cardiovascular stress and elevated annoyance.'
    };
  }
  return {
    compliance: 'Exceeded',
    daytimeLimit: 55,
    nighttimeLimit: 45,
    maxSafeExposure: 'Under 15–30 minutes without PPE',
    healthAdvice: 'Occupational hearing risk threshold exceeded. Certified ear protection or rapid egress strongly recommended.'
  };
}

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
          dominant_frequency NUMERIC(7,1),
          frequency_band VARCHAR(64),
          estimated_source VARCHAR(128),
          freq_low NUMERIC(4,1),
          freq_mid NUMERIC(4,1),
          freq_high NUMERIC(4,1),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_noise_coords ON noise_readings (latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_noise_created ON noise_readings (created_at DESC);
      `);

      const res = await client.query('SELECT COUNT(*) FROM noise_readings');
      if (parseInt(res.rows[0].count, 10) === 0) {
        console.log('Seeding PostgreSQL with initial demonstration readings...');
        for (const r of SEED_READINGS) {
          await client.query(
            `INSERT INTO noise_readings (
              id, decibel, latitude, longitude, accuracy, location_name, category, source,
              dominant_frequency, frequency_band, estimated_source, freq_low, freq_mid, freq_high, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              r.id, r.decibel, r.latitude, r.longitude, r.accuracy, r.locationName, r.category, r.source,
              r.dominantFrequency || 440, r.frequencyBand || 'Mid', r.estimatedSource || 'Ambient',
              r.frequencyDistribution?.lowPercent || 30,
              r.frequencyDistribution?.midPercent || 50,
              r.frequencyDistribution?.highPercent || 20,
              r.timestamp
            ]
          );
        }
      }
      client.release();
    } catch (error) {
      console.warn('PostgreSQL connection failed, using local store:', error.message);
      usePostgres = false;
    }
  } else {
    console.log('No DATABASE_URL configured. Running on local persistent file store.');
    usePostgres = false;
  }

  return { usePostgres };
}

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
    dominantFrequency: readingData.dominantFrequency || Math.round(200 + Math.random() * 800),
    frequencyBand: readingData.frequencyBand || (readingData.decibel < 50 ? 'Low (Rumble)' : 'Mid (Speech/Urban)'),
    frequencyDistribution: readingData.frequencyDistribution || {
      lowPercent: Math.round(25 + Math.random() * 30),
      midPercent: Math.round(40 + Math.random() * 25),
      highPercent: 15
    },
    estimatedSource: readingData.estimatedSource || (readingData.decibel > 80 ? 'Transit Traffic / Construction' : 'Ambient Conversation'),
    timestamp: readingData.timestamp || new Date().toISOString()
  };

  if (usePostgres && pool) {
    await pool.query(
      `INSERT INTO noise_readings (
        id, decibel, latitude, longitude, accuracy, location_name, category, source,
        dominant_frequency, frequency_band, estimated_source, freq_low, freq_mid, freq_high, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        reading.id, reading.decibel, reading.latitude, reading.longitude, reading.accuracy,
        reading.locationName, reading.category, reading.source,
        reading.dominantFrequency, reading.frequencyBand, reading.estimatedSource,
        reading.frequencyDistribution.lowPercent, reading.frequencyDistribution.midPercent, reading.frequencyDistribution.highPercent,
        reading.timestamp
      ]
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
      `SELECT id, decibel, latitude, longitude, accuracy, location_name AS "locationName",
              category, source, dominant_frequency AS "dominantFrequency", frequency_band AS "frequencyBand",
              estimated_source AS "estimatedSource", freq_low, freq_mid, freq_high, created_at AS "timestamp"
       FROM noise_readings
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map(r => ({
      ...r,
      decibel: parseFloat(r.decibel),
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      dominantFrequency: r.dominantFrequency ? parseFloat(r.dominantFrequency) : 440,
      frequencyDistribution: {
        lowPercent: r.freq_low ? parseFloat(r.freq_low) : 30,
        midPercent: r.freq_mid ? parseFloat(r.freq_mid) : 50,
        highPercent: r.freq_high ? parseFloat(r.freq_high) : 20
      }
    }));
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
        freqSums: { low: 0, mid: 0, high: 0 },
        dominantHzSum: 0,
        sources: {},
        readings: [],
        lastUpdated: r.timestamp
      });
    }

    const cell = cellMap.get(cellId);
    cell.totalDb += r.decibel;
    cell.count += 1;
    cell.minDb = Math.min(cell.minDb, r.decibel);
    cell.maxDb = Math.max(cell.maxDb, r.decibel);

    const freqDist = r.frequencyDistribution || { lowPercent: 30, midPercent: 50, highPercent: 20 };
    cell.freqSums.low += freqDist.lowPercent;
    cell.freqSums.mid += freqDist.midPercent;
    cell.freqSums.high += freqDist.highPercent;
    cell.dominantHzSum += (r.dominantFrequency || 440);

    const src = r.estimatedSource || 'Ambient Noise';
    cell.sources[src] = (cell.sources[src] || 0) + 1;

    if (new Date(r.timestamp) > new Date(cell.lastUpdated)) {
      cell.lastUpdated = r.timestamp;
    }
    if (cell.readings.length < 6) {
      cell.readings.push({
        id: r.id,
        decibel: r.decibel,
        timestamp: r.timestamp,
        locationName: r.locationName,
        dominantFrequency: r.dominantFrequency,
        estimatedSource: r.estimatedSource
      });
    }
  }

  const cells = Array.from(cellMap.values()).map(cell => {
    const avgDb = parseFloat((cell.totalDb / cell.count).toFixed(1));
    const cat = categorizeDecibels(avgDb);
    const avgLow = Math.round(cell.freqSums.low / cell.count);
    const avgMid = Math.round(cell.freqSums.mid / cell.count);
    const avgHigh = Math.round(cell.freqSums.high / cell.count);
    const avgHz = Math.round(cell.dominantHzSum / cell.count);

    // Most common source in this zone
    let prevailingSource = Object.keys(cell.sources).sort((a, b) => cell.sources[b] - cell.sources[a])[0] || 'Ambient Acoustic';

    // WHO compliance
    const whoGuideline = computeWhoGuideline(avgDb);

    // Simulated 6-hour acoustic trend curve for this zone
    const hourlyTrend = [
      { hour: '08:00', db: Math.max(35, parseFloat((avgDb - 8 + Math.random() * 4).toFixed(1))) },
      { hour: '11:00', db: Math.max(35, parseFloat((avgDb + 2 + Math.random() * 3).toFixed(1))) },
      { hour: '13:00', db: Math.max(35, parseFloat((avgDb + 4 + Math.random() * 3).toFixed(1))) },
      { hour: '15:00', db: Math.max(35, parseFloat((avgDb + 1 + Math.random() * 3).toFixed(1))) },
      { hour: '18:00', db: Math.max(35, parseFloat((avgDb + 5 + Math.random() * 4).toFixed(1))) },
      { hour: 'Now', db: avgDb }
    ];

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
      dominantFrequency: avgHz,
      frequencyBand: avgHz < 250 ? 'Low (Rumble)' : avgHz < 4000 ? 'Mid (Speech/Urban)' : 'High (Machinery/Siren)',
      frequencyDistribution: { lowPercent: avgLow, midPercent: avgMid, highPercent: avgHigh },
      estimatedSource: prevailingSource,
      whoGuideline,
      hourlyTrend,
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
      storageEngine: usePostgres ? 'PostgreSQL (PostGIS)' : 'Local File Persistence',
      frequencyAverages: { lowPercent: 33, midPercent: 45, highPercent: 22, predominantSource: 'Ambient Baseline' }
    };
  }

  const avg = readings.reduce((acc, r) => acc + r.decibel, 0) / readings.length;
  let max = readings[0];
  let min = readings[0];

  let lowSum = 0;
  let midSum = 0;
  let highSum = 0;

  for (const r of readings) {
    if (r.decibel > max.decibel) max = r;
    if (r.decibel < min.decibel) min = r;
    const dist = r.frequencyDistribution || { lowPercent: 30, midPercent: 50, highPercent: 20 };
    lowSum += dist.lowPercent;
    midSum += dist.midPercent;
    highSum += dist.highPercent;
  }

  return {
    totalReadings: readings.length,
    activeCells: cells.length,
    averageNoise: parseFloat(avg.toFixed(1)),
    maxNoise: max.decibel,
    minNoise: min.decibel,
    loudestArea: max.locationName || `${max.latitude}, ${max.longitude}`,
    quietestArea: min.locationName || `${min.latitude}, ${min.longitude}`,
    storageEngine: usePostgres ? 'PostgreSQL (PostGIS)' : 'Local Persistent Engine',
    frequencyAverages: {
      lowPercent: Math.round(lowSum / readings.length),
      midPercent: Math.round(midSum / readings.length),
      highPercent: Math.round(highSum / readings.length),
      predominantSource: max.estimatedSource || 'Urban Traffic & Social Activity'
    }
  };
}

export async function resetToDemoSeed() {
  if (usePostgres && pool) {
    await pool.query('DELETE FROM noise_readings');
    for (const r of SEED_READINGS) {
      await pool.query(
        `INSERT INTO noise_readings (
          id, decibel, latitude, longitude, accuracy, location_name, category, source,
          dominant_frequency, frequency_band, estimated_source, freq_low, freq_mid, freq_high, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          r.id, r.decibel, r.latitude, r.longitude, r.accuracy, r.locationName, r.category, r.source,
          r.dominantFrequency, r.frequencyBand, r.estimatedSource,
          r.frequencyDistribution.lowPercent, r.frequencyDistribution.midPercent, r.frequencyDistribution.highPercent,
          r.timestamp
        ]
      );
    }
  } else {
    memoryStore.readings = [...SEED_READINGS];
    persistStore();
  }
  return { success: true, count: SEED_READINGS.length };
}
