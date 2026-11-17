import type { DashboardStats, HeatmapCell, NoiseReading } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin
);

export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchReadings(limit = 50): Promise<NoiseReading[]> {
  const res = await fetch(`${API_BASE}/api/readings?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchHeatmap(): Promise<HeatmapCell[]> {
  const res = await fetch(`${API_BASE}/api/heatmap`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function submitReading(reading: {
  decibel: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationName?: string;
  source?: string;
  timestamp?: string;
}): Promise<{ success: boolean; reading: NoiseReading; message: string }> {
  const res = await fetch(`${API_BASE}/api/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }
  return res.json();
}

export async function resetDemoSeed(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/api/reset-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function toggleSimulation(): Promise<{ active: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/simulation/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function seedArea(latitude: number, longitude: number, locationName: string): Promise<{
  success: boolean;
  message: string;
  readings: NoiseReading[];
  cells: HeatmapCell[];
}> {
  const res = await fetch(`${API_BASE}/api/seed-area`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, locationName })
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export { API_BASE };
