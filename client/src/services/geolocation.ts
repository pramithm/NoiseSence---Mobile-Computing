import type { GeolocationState } from '../types';

export interface GeocodedPlace {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  category?: string;
}

export const CAMPUS_PRESETS = [
  { name: 'HITEC City Cyber Towers, Hyderabad', lat: 17.4504, lng: 78.3808, accuracy: 4 },
  { name: 'Osmania University Arts College, Hyderabad', lat: 17.4138, lng: 78.5284, accuracy: 4 },
  { name: 'KBR National Park (Jubilee Hills), Hyderabad', lat: 17.4277, lng: 78.4208, accuracy: 4 },
  { name: 'Hussain Sagar Tank Bund, Hyderabad', lat: 17.4239, lng: 78.4738, accuracy: 5 },
  { name: 'Charminar Heritage Plaza, Hyderabad', lat: 17.3616, lng: 78.4747, accuracy: 5 },
  { name: 'Gachibowli Financial District, Hyderabad', lat: 17.4401, lng: 78.3489, accuracy: 5 },
  { name: 'JNTU College of Engineering (Kukatpally)', lat: 17.4933, lng: 78.3914, accuracy: 4 }
];

/**
 * Reverse geocodes coordinates to a human-readable place name using OpenStreetMap Nominatim.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Geocoding error ${res.status}`);
    const data = await res.json();

    if (data && data.address) {
      const addr = data.address;
      // Build a clean, concise place name
      const specific = addr.amenity || addr.building || addr.road || addr.suburb || addr.neighbourhood || addr.village;
      const broader = addr.city || addr.town || addr.municipality || addr.county || addr.state;

      if (specific && broader && specific !== broader) {
        return `${specific}, ${broader}`;
      } else if (specific) {
        return specific;
      } else if (broader) {
        return broader;
      } else if (data.display_name) {
        // Return first 2 comma-separated segments
        return data.display_name.split(',').slice(0, 2).join(',').trim();
      }
    }
    return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  } catch (err) {
    console.warn('Reverse geocoding failed or timed out:', err);
    return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
}

/**
 * Searches places by name or address using OpenStreetMap Nominatim.
 */
export async function searchPlaces(query: string): Promise<GeocodedPlace[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Search error ${res.status}`);
    const results = await res.json();

    return results.map((item: { display_name: string; lat: string; lon: string; type?: string }) => {
      const parts = item.display_name.split(',');
      const shortName = parts.slice(0, 2).join(',').trim();
      return {
        displayName: item.display_name,
        shortName: shortName || item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        category: item.type
      };
    });
  } catch (err) {
    console.warn('Place search failed:', err);
    return [];
  }
}

/**
 * Calculates distance in meters between two lat/lng coordinates (Haversine formula).
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function requestCurrentLocation(): Promise<GeolocationState> {
  if (!navigator.geolocation) {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      error: 'Geolocation is not supported by this browser.',
      loading: false,
      permission: 'denied'
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          loading: false,
          permission: 'granted'
        });
      },
      (err) => {
        let msg = 'Unable to retrieve location.';
        let perm: 'denied' | 'prompt' = 'prompt';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied by user. Please allow location permissions in browser settings.';
          perm = 'denied';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'GPS signal currently unavailable.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS request timed out.';
        }
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
          error: msg,
          loading: false,
          permission: perm
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 5000
      }
    );
  });
}
