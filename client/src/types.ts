export type NoiseCategory = 'Quiet' | 'Moderate' | 'Loud' | 'Hazardous';

export interface FrequencyBreakdown {
  lowPercent: number;    // 20 - 250 Hz (Rumble, Engines, HVAC)
  midPercent: number;    // 250 - 4000 Hz (Human Speech, Urban Activity)
  highPercent: number;   // 4000 - 20000 Hz (Brakes, Whistles, Grinding)
  dominantHz: number;    // Peak frequency component in Hz
  bandName: 'Low (Rumble)' | 'Mid (Speech/Urban)' | 'High (Machinery/Siren)';
  estimatedSource: string; // e.g. "Human Voice & Dialogue", "Traffic Transit", "HVAC / Ambient"
}

export interface WhoGuidelineInfo {
  compliance: 'Compliant' | 'Caution' | 'Exceeded';
  daytimeLimit: number;   // WHO recommended 55 dB
  nighttimeLimit: number; // WHO recommended 45 dB
  maxSafeExposure: string;// e.g. "Unlimited", "8 hours", "15 minutes"
  healthAdvice: string;
}

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
  dominantFrequency?: number;
  frequencyBand?: string;
  frequencyDistribution?: {
    lowPercent: number;
    midPercent: number;
    highPercent: number;
  };
  estimatedSource?: string;
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
  dominantFrequency?: number;
  frequencyBand?: string;
  frequencyDistribution?: {
    lowPercent: number;
    midPercent: number;
    highPercent: number;
  };
  estimatedSource?: string;
  whoGuideline?: WhoGuidelineInfo;
  hourlyTrend?: Array<{ hour: string; db: number }>;
  recentSamples?: Array<{
    id: string;
    decibel: number;
    timestamp: string;
    locationName?: string;
    dominantFrequency?: number;
    estimatedSource?: string;
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
  frequencyAverages?: {
    lowPercent: number;
    midPercent: number;
    highPercent: number;
    predominantSource: string;
  };
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
  dominantFrequency?: number;
  frequencyBand?: string;
  estimatedSource?: string;
}
