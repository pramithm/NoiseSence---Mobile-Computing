# NoiseSense — Mobile Crowdsourced Acoustic Intelligence System

> **Capstone Project:** Mobile Computing  
> A mobile-first Progressive Web App (PWA) with real-time client-server communication, interactive spatial noise mapping, and distributed acoustic sensing.

---

## 🌟 Overview & Key Concepts

**NoiseSense** transforms everyday smartphones into a distributed participatory noise pollution monitoring grid. It demonstrates core **Mobile Computing** principles:

1. **Mobile Sensor Access**: Uses the **Web Audio API** (`AudioContext`, `AnalyserNode`) to sample ambient sound in real time, calculate Root Mean Square (RMS) energy, and compute calibrated decibel SPL estimates.
2. **Location & Geospatial Tagging**: Integrates the **Geolocation API** for coordinate capture, precision tracking ($\pm \text{accuracy in meters}$), and spatial micro-grid cell aggregation ($\sim 200\text{m}$ resolution).
3. **Real-Time Client-to-Client Sync**: Implements **Socket.IO** bidirectional WebSockets so when one phone records and submits a noise level, all other phones' maps and dashboards update instantly without page reloads.
4. **Disconnection-Tolerant Mobile Operation**: Equipped with an **Offline Measurement Cache** that queues readings when internet connectivity is dropped and automatically flushes and synchronizes once back online.
5. **Calibrated Sampling**: Features a standard 10-second continuous sampling window with progress indicator and average calculation to mitigate transient outlier spikes (such as key clinks or pocket friction).

---

## 🏗️ Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │                    Connected Clients                   │
                               │  Phone A (Mobile PWA)     Phone B (Map Display)        │
                               └──────────────┬────────────────────────▲────────────────┘
                                              │                        │
                   1. Sample dB & GPS Tag     │                        │ 4. Real-time Live
                   2. POST /api/readings      │                        │    Socket.IO Broadcast
                                              ▼                        │    ('heatmap:update')
                               ┌───────────────────────────────────────┴────────────────┐
                               │                 NoiseSense Central Server              │
                               │                (Node.js / Express / Socket.IO)         │
                               ├────────────────────────────────────────────────────────┤
                               │ • Input Validation (decibel bounds 30-140 dB, lat/lng) │
                               │ • Spatial Micro-Grid Aggregation (~200m cells)         │
                               │ • Real-time Event Broadcaster                          │
                               └──────────────────────────────┬─────────────────────────┘
                                                              │
                                                              ▼
                               ┌────────────────────────────────────────────────────────┐
                               │                     Database Layer                     │
                               │ • PostgreSQL with PostGIS (Production: Supabase/Neon)  │
                               │ • Local JSON Persistent Engine (Zero-setup Dev)        │
                               └────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
Mobile Computing/
├── client/                     # Frontend Mobile PWA (React + TypeScript + Vite)
│   ├── public/
│   │   ├── favicon.svg         # Acoustic waveform icon
│   │   ├── manifest.json       # PWA Install manifest
│   │   └── icon-192.svg        # App icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx      # Live sync beacon, dark/light toggle, DB badge
│   │   │   ├── BottomNav.tsx   # Mobile bottom dock / desktop capsule navigation
│   │   │   ├── DashboardTab.tsx# Environmental status, 4 metrics, live stream
│   │   │   ├── MeasureTab.tsx  # SVG decibel gauge, 10s timer, canvas visualizer, GPS
│   │   │   ├── MapTab.tsx      # Leaflet interactive map with noise cells & pins
│   │   │   └── HistoryTab.tsx  # Reading logs, search, CSV export, offline queue
│   │   ├── services/
│   │   │   ├── api.ts          # REST endpoints client
│   │   │   ├── socket.ts       # Socket.IO client connection manager
│   │   │   ├── audioMeter.ts   # Web Audio API RMS & dBA decibel calculator
│   │   │   ├── geolocation.ts  # GPS location & campus preset coordinates
│   │   │   └── offlineQueue.ts # LocalStorage / IndexedDB queue & auto-sync
│   │   ├── App.tsx             # Root React orchestrator
│   │   ├── index.css           # Design system tokens, glassmorphism, animations
│   │   └── types.ts            # Domain TypeScript interfaces
│   └── package.json
│
├── server/                     # Central Backend (Express + Socket.IO)
│   ├── src/
│   │   ├── index.js            # Express API, Socket.IO server, endpoints
│   │   └── db.js               # Spatial grid aggregation, PostGIS / local store
│   ├── data/
│   │   └── store.json          # Persistent file store fallback
│   └── package.json
│
├── package.json                # Root package with concurrent dev scripts
├── Reference1.txt              # Architecture and Feasibility Plan
└── Reference2.txt              # Online Deployment Plan
```

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js**: v18 or higher (tested on Node v24 LTS)
- **npm**: v9 or higher

### Quick Start (Runs both Frontend & Backend)

From the root directory:

```bash
# 1. Install root, server, and client dependencies
npm run install:all

# 2. Start both the Backend (port 5000) and Client (port 5173) concurrently
npm run dev
```

- **Frontend**: Open `http://localhost:5173` in your browser.
- **Backend API**: Running at `http://localhost:5000`.
- **Health Check**: `http://localhost:5000/api/health`.

---

## 📱 Testing on Multiple Mobile Phones

For your live capstone demonstration:

### Option A: Local Wi-Fi (No cloud setup needed)
1. Ensure your laptop and test phones are connected to the same Wi-Fi.
2. Find your laptop's local IP (e.g. `192.168.1.150` via `ipconfig`).
3. In `client/.env.local`:
   ```env
   VITE_API_URL=http://192.168.1.150:5000
   ```
4. Start with `npm run dev -- --host` in `client`.
5. Open `http://192.168.1.150:5173` on both phones!

### Option B: Cloud Deployment (Per Reference 2)
- **Database**: Create a free PostgreSQL instance on [Supabase](https://supabase.com) and copy the connection string.
- **Backend**: Deploy `server/` to [Render](https://render.com) as a Web Service. Set environment variables:
  ```env
  DATABASE_URL=postgresql://...
  PORT=5000
  ```
- **Frontend**: Deploy `client/` to [Vercel](https://vercel.com). Set environment variable:
  ```env
  VITE_API_URL=https://your-noisesense-backend.onrender.com
  ```

---

## 📊 Standard Acoustic Scale

| Noise Range | Category | Color | Typical Ambient Example | Comfort Status |
| :--- | :--- | :--- | :--- | :--- |
| **< 50 dB** | Quiet | Green (`#10b981`) | Quiet Library, Botanical Garden | Optimal / Tranquil |
| **50 – 70 dB** | Moderate | Cyan (`#06b6d4`) | Classroom, Normal Conversation, Cafe | Standard Ambient |
| **70 – 85 dB** | Loud | Amber (`#f59e0b`) | Main Street, Heavy Bus Transit | Elevated Fatigue |
| **> 85 dB** | Hazardous | Red (`#ef4444`) | Construction Drilling, Heavy Machinery | Safety Alert |

---

## 🛠️ API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, active sockets, and storage engine |
| `GET` | `/api/stats` | Aggregated dashboard metrics (avg, peak, quietest, counts) |
| `GET` | `/api/readings?limit=50` | Recent crowdsourced readings log |
| `GET` | `/api/heatmap` | Spatial micro-grid cells with average dB and bounds |
| `POST` | `/api/readings` | Submit new reading (triggers real-time `heatmap:update` broadcast) |
| `POST` | `/api/reset-seed` | Reset data to standard campus baseline for demonstrations |
