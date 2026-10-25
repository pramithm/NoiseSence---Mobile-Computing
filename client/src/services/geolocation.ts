import type { GeolocationState } from '../types';

export const CAMPUS_PRESETS = [
  { name: 'Library Quiet Zone', lat: 37.7758, lng: -122.4182, accuracy: 4 },
  { name: 'Student Union Cafeteria', lat: 37.7741, lng: -122.4205, accuracy: 5 },
  { name: 'University Ave Bus Stop', lat: 37.7765, lng: -122.4221, accuracy: 6 },
  { name: 'Engineering Hall Expansion', lat: 37.7732, lng: -122.4170, accuracy: 4 },
  { name: 'Memorial Botanical Quad', lat: 37.7770, lng: -122.4160, accuracy: 5 },
  { name: 'CS Innovation Hub', lat: 37.7745, lng: -122.4148, accuracy: 5 }
];

export async function requestCurrentLocation(): Promise<GeolocationState> {
  if (!navigator.geolocation) {
    return {
      latitude: CAMPUS_PRESETS[0].lat,
      longitude: CAMPUS_PRESETS[0].lng,
      accuracy: 10,
      error: 'Geolocation is not supported by this browser. Using campus reference.',
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
          msg = 'Location permission denied by user.';
          perm = 'denied';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location signal currently unavailable.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        // Fallback to campus default preset for testing/classroom demo
        resolve({
          latitude: CAMPUS_PRESETS[0].lat,
          longitude: CAMPUS_PRESETS[0].lng,
          accuracy: 8,
          error: `${msg} (Demo coordinates active)`,
          loading: false,
          permission: perm
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000
      }
    );
  });
}
