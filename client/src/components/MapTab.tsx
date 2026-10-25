import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Crosshair,
  Filter,
  RefreshCw,
  Info
} from 'lucide-react';
import type { HeatmapCell, NoiseReading } from '../types';

interface MapTabProps {
  cells: HeatmapCell[];
  recentReadings: NoiseReading[];
  onRefreshMap: () => void;
  userCoords?: { lat: number; lng: number } | null;
}

export const MapTab: React.FC<MapTabProps> = ({
  cells,
  recentReadings,
  onRefreshMap,
  userCoords
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const [viewMode, setViewMode] = useState<'heatmap' | 'points' | 'both'>('both');

  // Default center: Campus coordinates
  const DEFAULT_CENTER: [number, number] = [37.7750, -122.4194];

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 16,
      zoomControl: false
    });

    // Add high quality tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | NoiseSense',
      maxZoom: 19
    }).addTo(map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render heatmap circles and point markers whenever cells or recentReadings change
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // 1. Draw Grid Cells / Heatmap Overlays
    if (viewMode === 'heatmap' || viewMode === 'both') {
      cells.forEach((cell) => {
        if (selectedCategory !== 'All' && cell.category !== selectedCategory) return;

        // Visual radius scaled slightly by sample count (minimum 55m, max 110m)
        const radius = Math.min(110, 55 + Math.min(cell.readingCount * 8, 55));
        
        // Color based on dB level
        const circle = L.circle([cell.latitude, cell.longitude], {
          radius: radius,
          color: cell.color,
          fillColor: cell.color,
          fillOpacity: 0.38,
          weight: 2
        });

        // Custom HTML Marker / Label in center of cell
        const centerIcon = L.divIcon({
          className: 'custom-cell-badge-icon',
          html: `<div class="map-cell-db-badge" style="background-color: ${cell.color}; color: #ffffff;">
                   <strong>${cell.averageDb}</strong> <small>dB</small>
                 </div>`,
          iconSize: [52, 28],
          iconAnchor: [26, 14]
        });

        const badgeMarker = L.marker([cell.latitude, cell.longitude], { icon: centerIcon });

        const clickHandler = () => {
          setSelectedCell(cell);
        };

        circle.on('click', clickHandler);
        badgeMarker.on('click', clickHandler);

        layerGroup.addLayer(circle);
        layerGroup.addLayer(badgeMarker);
      });
    }

    // 2. Draw Individual Reading Pins
    if (viewMode === 'points' || viewMode === 'both') {
      recentReadings.slice(0, 30).forEach((reading) => {
        if (selectedCategory !== 'All' && reading.category !== selectedCategory) return;

        const color =
          reading.decibel < 50
            ? '#10b981'
            : reading.decibel < 70
            ? '#06b6d4'
            : reading.decibel < 85
            ? '#f59e0b'
            : '#ef4444';

        const pointIcon = L.divIcon({
          className: 'reading-pin-icon',
          html: `<div class="reading-pin-glow" style="border-color: ${color};">
                   <div class="reading-pin-core" style="background-color: ${color};"></div>
                 </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const marker = L.marker([reading.latitude, reading.longitude], { icon: pointIcon });
        marker.bindPopup(`
          <div class="map-reading-popup">
            <h4 class="popup-title">${reading.locationName}</h4>
            <div class="popup-db-row">
              <span class="popup-db" style="color: ${color}">${reading.decibel.toFixed(1)} dB</span>
              <span class="popup-cat">${reading.category}</span>
            </div>
            <div class="popup-meta">
              <span>${reading.source}</span> · 
              <span>${new Date(reading.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        `);

        layerGroup.addLayer(marker);
      });
    }

    // 3. Draw User Current Location Pulse if available
    if (userCoords && userCoords.lat && userCoords.lng) {
      const userIcon = L.divIcon({
        className: 'user-loc-icon',
        html: `<div class="user-location-marker">
                 <div class="user-location-pulse"></div>
                 <div class="user-location-dot"></div>
               </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon });
      userMarker.bindTooltip('Your Location', { permanent: false, direction: 'top' });
      layerGroup.addLayer(userMarker);
    }
  }, [cells, recentReadings, selectedCategory, viewMode, userCoords]);

  // Recenter map functions
  const centerCampus = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(DEFAULT_CENTER, 16, { animate: true });
    }
  };

  const centerUser = () => {
    if (userCoords && userCoords.lat && userCoords.lng && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 17, { animate: true });
    } else {
      centerCampus();
    }
  };

  return (
    <div className="map-page-wrapper">
      {/* Top Map Control Bar */}
      <div className="map-controls-bar">
        {/* Category Filters */}
        <div className="map-filter-group">
          <Filter size={15} className="text-secondary" />
          {['All', 'Quiet', 'Moderate', 'Loud', 'Hazardous'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`map-filter-chip ${selectedCategory === cat ? 'map-filter-chip-active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* View Mode & Recenter Buttons */}
        <div className="map-view-actions">
          <button
            onClick={() => setViewMode(viewMode === 'both' ? 'heatmap' : viewMode === 'heatmap' ? 'points' : 'both')}
            className="btn-map-control"
            title={`Toggle View Mode (Currently: ${viewMode})`}
          >
            <Layers size={16} />
            <span className="control-btn-text">{viewMode.toUpperCase()}</span>
          </button>

          <button
            onClick={centerUser}
            className="btn-map-control"
            title="Center on My Location"
          >
            <Crosshair size={16} />
            <span className="control-btn-text">Locate</span>
          </button>

          <button
            onClick={centerCampus}
            className="btn-map-control"
            title="Center Campus"
          >
            <Crosshair size={16} />
            <span className="control-btn-text">Campus</span>
          </button>

          <button
            onClick={onRefreshMap}
            className="btn-map-control"
            title="Refresh Map Data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Full Map Canvas Container */}
      <div ref={mapContainerRef} className="leaflet-map-container" />

      {/* Floating Real-time Live Badge */}
      <div className="map-floating-status">
        <span className="pulse-dot"></span>
        <span className="font-semibold text-xs">Live Sync</span>
        <span className="text-xs text-secondary">({cells.length} Active Zones)</span>
      </div>

      {/* Floating Legend */}
      <div className="map-floating-legend">
        <div className="legend-title-row">
          <Info size={13} />
          <span>Noise Scale</span>
        </div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#10b981' }}></span>
            <span>&lt;50 dB Quiet</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#06b6d4' }}></span>
            <span>50-70 dB Moderate</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#f59e0b' }}></span>
            <span>70-85 dB Loud</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#ef4444' }}></span>
            <span>&gt;85 dB Hazardous</span>
          </div>
        </div>
      </div>

      {/* Selected Cell Detail Modal / Bottom Drawer */}
      {selectedCell && (
        <div className="cell-detail-drawer animate-slide-up">
          <div className="drawer-handle"></div>
          <div className="drawer-header">
            <div>
              <span className="drawer-grid-id">Micro-Grid Cell: {selectedCell.cellId}</span>
              <h3 className="drawer-title">
                {selectedCell.recentSamples?.[0]?.locationName || `Lat ${selectedCell.latitude}, Lng ${selectedCell.longitude}`}
              </h3>
            </div>
            <button
              onClick={() => setSelectedCell(null)}
              className="drawer-close-btn"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="drawer-metrics-row">
            <div className="drawer-metric-item">
              <span className="drawer-metric-label">Average Noise</span>
              <span className="drawer-metric-val" style={{ color: selectedCell.color }}>
                {selectedCell.averageDb} dB
              </span>
            </div>
            <div className="drawer-metric-item">
              <span className="drawer-metric-label">Range</span>
              <span className="drawer-metric-val">
                {selectedCell.minDb} - {selectedCell.maxDb} dB
              </span>
            </div>
            <div className="drawer-metric-item">
              <span className="drawer-metric-label">Contributions</span>
              <span className="drawer-metric-val">
                {selectedCell.readingCount} {selectedCell.readingCount === 1 ? 'sample' : 'samples'}
              </span>
            </div>
            <div className="drawer-metric-item">
              <span className="drawer-metric-label">Category</span>
              <span className="drawer-metric-val" style={{ color: selectedCell.color }}>
                {selectedCell.category}
              </span>
            </div>
          </div>

          {selectedCell.recentSamples && selectedCell.recentSamples.length > 0 && (
            <div className="drawer-samples-list">
              <span className="text-xs font-semibold text-secondary mb-1 block">Recent Readings in this Cell:</span>
              {selectedCell.recentSamples.map((s) => (
                <div key={s.id} className="drawer-sample-row">
                  <span>{s.locationName || 'Acoustic sample'}</span>
                  <span className="font-semibold">{s.decibel} dB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
