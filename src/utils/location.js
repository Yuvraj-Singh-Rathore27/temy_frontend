/** Live location durations offered (minutes; must match the server). */
export const LIVE_DURATIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 480, label: '8 hours' },
];

export const canUseLocation = () => 'geolocation' in navigator;

/** 'granted' | 'prompt' | 'denied' | 'unknown' (not every browser supports the Permissions API). */
export async function locationPermission() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Human explanation for a GeolocationPositionError. */
export function locationErrorMessage(error) {
  if (!window.isSecureContext) return 'Location only works on a secure (https) page or on localhost.';
  switch (error?.code) {
    case 1:
      return 'Location access is blocked. Allow it for this site in your browser settings (the 🔒 icon in the address bar), then try again.';
    case 2:
      return "Your location couldn't be found. Check that location services are turned on for your device.";
    case 3:
      return 'Finding your location took too long. Try again, ideally near a window or with Wi-Fi on.';
    default:
      return 'Could not get your location.';
  }
}

/** One accurate position: { latitude, longitude, accuracy }. Rejects with a friendly message. */
export function getCurrentPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!canUseLocation()) return reject(new Error('This browser cannot share location.'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toCoords(position)),
      (error) => reject(new Error(locationErrorMessage(error))),
      { enableHighAccuracy: true, timeout, maximumAge: 10_000 },
    );
  });
}

export function toCoords(position) {
  return {
    latitude: Number(position.coords.latitude.toFixed(6)),
    longitude: Number(position.coords.longitude.toFixed(6)),
    accuracy: Math.round(position.coords.accuracy),
  };
}

/** Free links, no API key needed. */
export const googleMapsUrl = ({ latitude, longitude }) => `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
export const directionsUrl = ({ latitude, longitude }) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

export function formatAccuracy(meters) {
  if (meters == null) return '';
  return meters >= 1000 ? `±${(meters / 1000).toFixed(1)} km` : `±${meters} m`;
}

/** Distance in metres between two points (haversine). */
export function distanceMeters(a, b) {
  const R = 6_371_000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
