export type NoiseCategory = 'Quiet' | 'Moderate' | 'Loud' | 'Hazardous';

export interface NoiseReading {
  id: string;
  decibel: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  locationName: string;
  category: NoiseCategory;
  source: string;
  timestamp: string;
}

export interface HeatmapCell {
  cellId: string;
  latitude: number;
  longitude: number;
  averageDb: number;
  minDb: number;
  maxDb: number;
  readingCount: number;
  category: NoiseCategory;
  color: string;
  level: string;
  lastUpdated: string;
  recentSamples?: Array<{
    id: string;
    decibel: number;
    timestamp: string;
    locationName?: string;
  }>;
}

export interface DashboardStats {
  totalReadings: number;
  activeCells: number;
  averageNoise: number;
  maxNoise: number;
  minNoise: number;
  loudestArea: string;
  quietestArea: string;
  storageEngine: string;
}

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export interface OfflineReading {
  id: string;
  decibel: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  locationName: string;
  source: string;
  timestamp: string;
  synced: boolean;
}
