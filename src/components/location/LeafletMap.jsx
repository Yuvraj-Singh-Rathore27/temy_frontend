import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// OpenStreetMap tiles: free, no key. Attribution is required by their licence.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** A CSS pin (no image files, so nothing breaks with bundlers). */
function pinIcon(live) {
  return L.divIcon({
    className: '',
    html: `<span class="temu-pin${live ? ' temu-pin-live' : ''}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/**
 * Leaflet map with a pin (and an accuracy circle). Non-interactive maps are used
 * as previews inside bubbles. Loaded lazily (see LocationMap.jsx).
 */
export default function LeafletMap({ latitude, longitude, accuracy, live = false, interactive = false, zoom = 15, className }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      attributionControl: true,
    });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    markerRef.current = L.marker([latitude, longitude], { icon: pinIcon(live), keyboard: false }).addTo(map);
    circleRef.current = L.circle([latitude, longitude], {
      radius: accuracy ?? 0,
      color: '#6366f1',
      weight: 1,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
    mapRef.current = map;
    // The container may get its final size after mount (modals, lazy layout).
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Position updates are handled below without recreating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Follow live updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current.setLatLng([latitude, longitude]);
    markerRef.current.setIcon(pinIcon(live));
    circleRef.current.setLatLng([latitude, longitude]).setRadius(accuracy ?? 0);
    if (!interactive) map.setView([latitude, longitude], map.getZoom(), { animate: true });
  }, [latitude, longitude, accuracy, live, interactive]);

  return <div ref={containerRef} className={className} role="img" aria-label={`Map at ${latitude}, ${longitude}`} />;
}
