import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Crosshair,
  Filter,
  RefreshCw,
  Info,
  Zap,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Volume2,
  TrendingUp,
  Clock,
  Compass,
  Search,
  X,
  Mic,
  MapPin
} from 'lucide-react';
import type { HeatmapCell, NoiseReading } from '../types';
import { searchPlaces, calculateDistanceMeters, type GeocodedPlace } from '../services/geolocation';

interface MapTabProps {
  cells: HeatmapCell[];
  recentReadings: NoiseReading[];
  onRefreshMap: () => void;
  userCoords?: { lat: number; lng: number } | null;
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  onNavigateToMeasureWithPlace?: (place: { name: string; lat: number; lng: number }) => void;
}

export const MapTab: React.FC<MapTabProps> = ({
  cells,
  recentReadings,
  onRefreshMap,
  userCoords,
  isSimulating = false,
  onToggleSimulation,
  onNavigateToMeasureWithPlace
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const [viewMode, setViewMode] = useState<'heatmap' | 'points' | 'both'>('both');
  const [activeTabDrawer, setActiveTabDrawer] = useState<'summary' | 'frequencies' | 'who' | 'samples'>('summary');

  // Place Search & Noise Analysis State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [searchedPlaceInfo, setSearchedPlaceInfo] = useState<{
    place: GeocodedPlace;
    nearestCell: HeatmapCell | null;
    distanceMeters: number | null;
  } | null>(null);

  // Initial center prioritizes real user coordinates, then most recent reading, then campus
  const getInitialCenter = useCallback((): [number, number] => {
    if (userCoords && userCoords.lat && userCoords.lng) {
      return [userCoords.lat, userCoords.lng];
    }
    if (recentReadings.length > 0 && recentReadings[0].latitude) {
      return [recentReadings[0].latitude, recentReadings[0].longitude];
    }
    return [37.7750, -122.4194];
  }, [userCoords, recentReadings]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const center = getInitialCenter();
    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: 15,
      zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | NoiseSense',
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [getInitialCenter]);

  // Auto-center on user coordinates when first discovered
  const hasAutoCenteredRef = useRef(false);
  useEffect(() => {
    if (userCoords && userCoords.lat && userCoords.lng && mapInstanceRef.current && !hasAutoCenteredRef.current) {
      mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 16, { animate: true });
      hasAutoCenteredRef.current = true;
    }
  }, [userCoords]);

  // Sync selectedCell if cells change (e.g. live updates)
  useEffect(() => {
    if (selectedCell) {
      const updated = cells.find(c => c.cellId === selectedCell.cellId);
      if (updated) setSelectedCell(updated);
    }
  }, [cells, selectedCell]);

  // Render heatmap circles and point markers
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // 1. Draw Grid Cells / Heatmap Overlays
    if (viewMode === 'heatmap' || viewMode === 'both') {
      cells.forEach((cell) => {
        if (selectedCategory !== 'All' && cell.category !== selectedCategory) return;

        const radius = Math.min(115, 60 + Math.min(cell.readingCount * 8, 55));
        
        const circle = L.circle([cell.latitude, cell.longitude], {
          radius: radius,
          color: cell.color,
          fillColor: cell.color,
          fillOpacity: 0.35,
          weight: 2
        });

        const radarCircle = L.circle([cell.latitude, cell.longitude], {
          radius: radius * 1.35,
          color: cell.color,
          fillColor: cell.color,
          fillOpacity: 0.12,
          weight: 1,
          dashArray: '4, 4'
        });

        const centerIcon = L.divIcon({
          className: 'custom-cell-badge-icon',
          html: `<div class="map-cell-db-badge" style="background-color: ${cell.color}; color: #ffffff;">
                   <div class="map-badge-flex">
                     <strong>${cell.averageDb}</strong> <small>dB</small>
                   </div>
                   <div class="map-badge-hz">${cell.dominantFrequency || 440} Hz</div>
                 </div>`,
          iconSize: [60, 36],
          iconAnchor: [30, 18]
        });

        const badgeMarker = L.marker([cell.latitude, cell.longitude], { icon: centerIcon });

        const clickHandler = () => {
          setSelectedCell(cell);
          setSearchedPlaceInfo(null);
        };

        circle.on('click', clickHandler);
        radarCircle.on('click', clickHandler);
        badgeMarker.on('click', clickHandler);

        layerGroup.addLayer(radarCircle);
        layerGroup.addLayer(circle);
        layerGroup.addLayer(badgeMarker);
      });
    }

    // 2. Draw Individual Reading Pins
    if (viewMode === 'points' || viewMode === 'both') {
      recentReadings.slice(0, 40).forEach((reading) => {
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
            <div class="popup-freq">
              <strong>Dominant Pitch:</strong> ${reading.dominantFrequency || 440} Hz
            </div>
            <div class="popup-source">
              <strong>Source:</strong> ${reading.estimatedSource || reading.source}
            </div>
            <div class="popup-meta">
              <span>${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)}</span> · 
              <span>${new Date(reading.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        `);

        layerGroup.addLayer(marker);
      });
    }

    // 3. Draw User Current Location Pulse
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
      userMarker.bindTooltip('Your Current GPS Location', { permanent: false, direction: 'top' });
      layerGroup.addLayer(userMarker);
    }
  }, [cells, recentReadings, selectedCategory, viewMode, userCoords]);

  // Handle Place Search Execution
  const handleExecuteSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowSearchResults(true);
    const results = await searchPlaces(searchQuery);
    setSearchResults(results);
    setIsSearching(false);

    if (results.length === 1) {
      handleSelectPlace(results[0]);
    }
  };

  // When user selects a place from search
  const handleSelectPlace = (place: GeocodedPlace) => {
    setShowSearchResults(false);
    setSelectedCell(null);

    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([place.lat, place.lng], 16, { duration: 1.2 });

    // Drop or move Search Pin Marker
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }

    const searchIcon = L.divIcon({
      className: 'search-place-pin-icon',
      html: `<div class="search-pin-wrapper">
               <div class="search-pin-beacon"></div>
               <div class="search-pin-head">📍</div>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const marker = L.marker([place.lat, place.lng], { icon: searchIcon }).addTo(mapInstanceRef.current);
    searchMarkerRef.current = marker;

    // Calculate How Much Noise Is In That Location
    let closestCell: HeatmapCell | null = null;
    let minDistance = Infinity;

    for (const cell of cells) {
      const dist = calculateDistanceMeters(place.lat, place.lng, cell.latitude, cell.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        closestCell = cell;
      }
    }

    // If within 2500m (2.5km), associate noise reading
    const isNearby = minDistance <= 2500;
    setSearchedPlaceInfo({
      place,
      nearestCell: isNearby ? closestCell : null,
      distanceMeters: isNearby ? Math.round(minDistance) : null
    });
  };

  const centerUser = () => {
    if (userCoords && userCoords.lat && userCoords.lng && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userCoords.lat, userCoords.lng], 17, { duration: 1 });
    }
  };

  const centerLatest = () => {
    if (recentReadings.length > 0 && mapInstanceRef.current) {
      const r = recentReadings[0];
      mapInstanceRef.current.flyTo([r.latitude, r.longitude], 16, { duration: 1 });
    }
  };

  return (
    <div className="map-page-wrapper">
      {/* Search Bar & Map Controls Overlay */}
      <div className="map-search-and-controls">
        {/* Place Search Box */}
        <form onSubmit={handleExecuteSearch} className="map-search-form">
          <div className="map-search-input-wrap">
            <Search size={16} className="search-bar-icon" />
            <input
              type="text"
              placeholder="Search any place, college, street, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="map-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearchResults(false);
                }}
                className="search-clear-btn"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" disabled={isSearching} className="btn-map-search">
            {isSearching ? <RefreshCw size={14} className="spin-icon" /> : 'Search'}
          </button>
        </form>

        {/* Search Results Dropdown Menu */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="search-results-dropdown animate-fade-in">
            <div className="search-results-header">
              <span>Matching Locations ({searchResults.length})</span>
              <button
                type="button"
                onClick={() => setShowSearchResults(false)}
                className="btn-icon-subtle"
              >
                <X size={13} />
              </button>
            </div>
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectPlace(item)}
                className="search-result-row"
              >
                <MapPin size={15} className="text-teal flex-shrink-0" />
                <div className="result-text-block">
                  <strong className="result-title">{item.shortName}</strong>
                  <span className="result-full-address">{item.displayName}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls Toolbar: Filters & Quick Centering */}
        <div className="map-controls-bar">
          <div className="map-filter-group">
            <Filter size={14} className="text-secondary" />
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

          <div className="map-view-actions">
            {onToggleSimulation && (
              <button
                onClick={onToggleSimulation}
                className={`btn-map-control ${isSimulating ? 'btn-stream-active' : ''}`}
                title="Toggle Live Stream Simulator"
              >
                <Zap size={14} className={isSimulating ? 'pulse-icon' : ''} />
                <span className="control-btn-text">{isSimulating ? 'Stream ON' : 'Live Stream'}</span>
              </button>
            )}

            <button
              onClick={() => setViewMode(viewMode === 'both' ? 'heatmap' : viewMode === 'heatmap' ? 'points' : 'both')}
              className="btn-map-control"
              title={`Toggle View Mode (Currently: ${viewMode})`}
            >
              <Layers size={14} />
              <span className="control-btn-text">{viewMode.toUpperCase()}</span>
            </button>

            <button
              onClick={centerUser}
              className="btn-map-control"
              title="Fly to My Current GPS Location"
            >
              <Crosshair size={14} />
              <span className="control-btn-text">My GPS</span>
            </button>

            <button
              onClick={centerLatest}
              className="btn-map-control"
              title="Fly to Latest Contributed Reading"
            >
              <Compass size={14} />
              <span className="control-btn-text">Latest</span>
            </button>

            <button
              onClick={onRefreshMap}
              className="btn-map-control"
              title="Refresh Map Data"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Full Map Canvas Container */}
      <div ref={mapContainerRef} className="leaflet-map-container" />

      {/* Floating Searched Location Sound Intelligence Card */}
      {searchedPlaceInfo && (
        <div className="searched-place-card animate-slide-up">
          <div className="flex-between">
            <div className="flex-row-center gap-2">
              <span className="searched-badge">📍 Searched Place</span>
              <span className="coord-mini font-mono text-xs text-secondary">
                {searchedPlaceInfo.place.lat.toFixed(4)}, {searchedPlaceInfo.place.lng.toFixed(4)}
              </span>
            </div>
            <button
              onClick={() => setSearchedPlaceInfo(null)}
              className="btn-icon-subtle"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          <h3 className="searched-place-name">{searchedPlaceInfo.place.shortName}</h3>
          <p className="searched-place-full text-xs text-secondary mb-3">
            {searchedPlaceInfo.place.displayName}
          </p>

          {/* Sound Level Report for this Place */}
          {searchedPlaceInfo.nearestCell ? (
            <div className="location-sound-report">
              <div className="sound-report-metric">
                <span className="report-label">Sound Level in this Location:</span>
                <div className="flex-row-center gap-2 mt-1">
                  <span
                    className="report-db-badge"
                    style={{
                      backgroundColor: `${searchedPlaceInfo.nearestCell.color}20`,
                      color: searchedPlaceInfo.nearestCell.color,
                      borderColor: searchedPlaceInfo.nearestCell.color
                    }}
                  >
                    {searchedPlaceInfo.nearestCell.averageDb} dB(A)
                  </span>
                  <span className="report-category" style={{ color: searchedPlaceInfo.nearestCell.color }}>
                    {searchedPlaceInfo.nearestCell.category}
                  </span>
                </div>
              </div>

              <div className="sound-report-details mt-2">
                <div className="report-detail-item">
                  <span className="detail-label">Dominant Frequency:</span>
                  <strong>{searchedPlaceInfo.nearestCell.dominantFrequency || 440} Hz</strong>
                </div>
                <div className="report-detail-item">
                  <span className="detail-label">Likely Sound Source:</span>
                  <strong>{searchedPlaceInfo.nearestCell.estimatedSource || 'Ambient Urban'}</strong>
                </div>
                <div className="report-detail-item">
                  <span className="detail-label">Sensor Proximity:</span>
                  <span>Reading within ~{searchedPlaceInfo.distanceMeters}m</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="location-sound-report report-unmeasured">
              <div className="sound-report-metric">
                <span className="report-label">Sound Level in this Location:</span>
                <div className="flex-row-center gap-2 mt-1">
                  <span className="report-db-badge baseline-badge">
                    ~45.0 dB(A)
                  </span>
                  <span className="text-xs font-semibold text-secondary">
                    Estimated Ambient Baseline
                  </span>
                </div>
              </div>
              <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                No active mobile sensor contributions recorded in this specific micro-zone yet.
              </p>
            </div>
          )}

          {/* Action button: Measure sound in this searched location */}
          <button
            onClick={() => {
              if (onNavigateToMeasureWithPlace) {
                onNavigateToMeasureWithPlace({
                  name: searchedPlaceInfo.place.shortName,
                  lat: searchedPlaceInfo.place.lat,
                  lng: searchedPlaceInfo.place.lng
                });
              }
            }}
            className="btn-measure-here"
          >
            <Mic size={16} />
            <span>Measure Sound at {searchedPlaceInfo.place.shortName}</span>
          </button>
        </div>
      )}

      {/* Floating Status & Legend */}
      <div className="map-floating-status">
        <span className="pulse-dot"></span>
        <span className="font-semibold text-xs">Real-Time Grid</span>
        <span className="text-xs text-secondary">({cells.length} Active Zones)</span>
      </div>

      <div className="map-floating-legend">
        <div className="legend-title-row">
          <Info size={13} />
          <span>Noise Scale & Frequencies</span>
        </div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#10b981' }}></span>
            <span>&lt;50 dB · Quiet / Ambient</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#06b6d4' }}></span>
            <span>50-70 dB · Moderate / Speech</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#f59e0b' }}></span>
            <span>70-85 dB · Loud / Traffic</span>
          </div>
          <div className="legend-item">
            <span className="legend-color-dot" style={{ backgroundColor: '#ef4444' }}></span>
            <span>&gt;85 dB · Hazardous / Mechanical</span>
          </div>
        </div>
      </div>

      {/* Selected Cell Detail Drawer */}
      {selectedCell && !searchedPlaceInfo && (
        <div className="cell-detail-drawer animate-slide-up">
          <div className="drawer-handle"></div>
          
          <div className="drawer-header">
            <div>
              <div className="drawer-tag-row">
                <span className="drawer-grid-id">Micro-Grid: {selectedCell.cellId}</span>
                <span
                  className="drawer-category-pill"
                  style={{ color: selectedCell.color, borderColor: selectedCell.color, backgroundColor: `${selectedCell.color}15` }}
                >
                  {selectedCell.category}
                </span>
                {selectedCell.frequencyBand && (
                  <span className="drawer-band-pill">
                    {selectedCell.frequencyBand}
                  </span>
                )}
              </div>
              <h3 className="drawer-title">
                {selectedCell.recentSamples?.[0]?.locationName || `Zone (${selectedCell.latitude}, ${selectedCell.longitude})`}
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

          <div className="drawer-tab-nav">
            <button
              onClick={() => setActiveTabDrawer('summary')}
              className={`drawer-tab-btn ${activeTabDrawer === 'summary' ? 'drawer-tab-active' : ''}`}
            >
              Acoustic Overview
            </button>
            <button
              onClick={() => setActiveTabDrawer('frequencies')}
              className={`drawer-tab-btn ${activeTabDrawer === 'frequencies' ? 'drawer-tab-active' : ''}`}
            >
              Frequency Spectrum
            </button>
            <button
              onClick={() => setActiveTabDrawer('who')}
              className={`drawer-tab-btn ${activeTabDrawer === 'who' ? 'drawer-tab-active' : ''}`}
            >
              WHO Health Guidelines
            </button>
            <button
              onClick={() => setActiveTabDrawer('samples')}
              className={`drawer-tab-btn ${activeTabDrawer === 'samples' ? 'drawer-tab-active' : ''}`}
            >
              Live Samples ({selectedCell.readingCount})
            </button>
          </div>

          {activeTabDrawer === 'summary' && (
            <div className="drawer-tab-content">
              <div className="drawer-metrics-row">
                <div className="drawer-metric-item">
                  <span className="drawer-metric-label">Average Decibel</span>
                  <span className="drawer-metric-val" style={{ color: selectedCell.color }}>
                    {selectedCell.averageDb} dB(A)
                  </span>
                </div>
                <div className="drawer-metric-item">
                  <span className="drawer-metric-label">Noise Range</span>
                  <span className="drawer-metric-val">
                    {selectedCell.minDb} – {selectedCell.maxDb} dB
                  </span>
                </div>
                <div className="drawer-metric-item">
                  <span className="drawer-metric-label">Dominant Frequency</span>
                  <span className="drawer-metric-val text-cyan">
                    {selectedCell.dominantFrequency || 440} Hz
                  </span>
                </div>
                <div className="drawer-metric-item">
                  <span className="drawer-metric-label">Crowd Samples</span>
                  <span className="drawer-metric-val">
                    {selectedCell.readingCount}
                  </span>
                </div>
              </div>

              <div className="drawer-source-box">
                <div className="flex-row-center gap-2">
                  <Activity size={16} className="text-teal" />
                  <span className="font-semibold text-xs">Acoustic Source Signature:</span>
                </div>
                <p className="drawer-source-text">
                  {selectedCell.estimatedSource || 'General Ambient Activity'}
                </p>
              </div>

              {selectedCell.hourlyTrend && (
                <div className="trend-curve-box">
                  <span className="text-xs font-semibold text-secondary flex-row-center gap-1 mb-2">
                    <TrendingUp size={13} />
                    Hourly Decibel Fluctuation Trend:
                  </span>
                  <div className="trend-bars-row">
                    {selectedCell.hourlyTrend.map((t, idx) => {
                      const heightPercent = Math.min(100, Math.max(15, ((t.db - 30) / 70) * 100));
                      return (
                        <div key={idx} className="trend-bar-col">
                          <span className="trend-bar-val">{t.db}</span>
                          <div className="trend-bar-track">
                            <div
                              className="trend-bar-fill"
                              style={{
                                height: `${heightPercent}%`,
                                backgroundColor:
                                  t.db < 50 ? '#10b981' : t.db < 70 ? '#06b6d4' : t.db < 85 ? '#f59e0b' : '#ef4444'
                              }}
                            />
                          </div>
                          <span className="trend-bar-hour">{t.hour}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTabDrawer === 'frequencies' && (
            <div className="drawer-tab-content">
              <div className="freq-analysis-box">
                <div className="freq-header-row">
                  <div>
                    <h4 className="font-bold text-sm">Acoustic Frequency Band Energy</h4>
                    <p className="text-xs text-secondary">
                      Spectral energy distribution recorded across micro-grid audio sensors
                    </p>
                  </div>
                  <div className="peak-hz-badge">
                    <span>Peak Pitch:</span>
                    <strong>{selectedCell.dominantFrequency || 440} Hz</strong>
                  </div>
                </div>

                <div className="freq-meter-group">
                  <div className="freq-meter-item">
                    <div className="freq-meter-label-row">
                      <span className="freq-band-name">Sub-Bass & Low Rumble (20 – 250 Hz)</span>
                      <span className="freq-band-percent">{selectedCell.frequencyDistribution?.lowPercent || 35}%</span>
                    </div>
                    <div className="freq-meter-track">
                      <div
                        className="freq-meter-fill bg-amber"
                        style={{ width: `${selectedCell.frequencyDistribution?.lowPercent || 35}%` }}
                      />
                    </div>
                    <span className="freq-band-desc">Associated with diesel engines, vehicular chassis rumble, HVAC fans.</span>
                  </div>

                  <div className="freq-meter-item">
                    <div className="freq-meter-label-row">
                      <span className="freq-band-name">Mid-Range Urban & Speech (250 – 4000 Hz)</span>
                      <span className="freq-band-percent">{selectedCell.frequencyDistribution?.midPercent || 50}%</span>
                    </div>
                    <div className="freq-meter-track">
                      <div
                        className="freq-meter-fill bg-cyan"
                        style={{ width: `${selectedCell.frequencyDistribution?.midPercent || 50}%` }}
                      />
                    </div>
                    <span className="freq-band-desc">Human speech dialogue, classroom discussion, foot traffic, cafe ambience.</span>
                  </div>

                  <div className="freq-meter-item">
                    <div className="freq-meter-label-row">
                      <span className="freq-band-name">High-Frequency Treble (4000 – 20000 Hz)</span>
                      <span className="freq-band-percent">{selectedCell.frequencyDistribution?.highPercent || 15}%</span>
                    </div>
                    <div className="freq-meter-track">
                      <div
                        className="freq-meter-fill bg-rose"
                        style={{ width: `${selectedCell.frequencyDistribution?.highPercent || 15}%` }}
                      />
                    </div>
                    <span className="freq-band-desc">Machinery squeal, brakes, whistles, high ventilation hiss.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTabDrawer === 'who' && (
            <div className="drawer-tab-content">
              {selectedCell.whoGuideline ? (
                <div className="who-guideline-card">
                  <div className="who-status-banner">
                    {selectedCell.whoGuideline.compliance === 'Compliant' ? (
                      <div className="who-badge-status who-safe">
                        <ShieldCheck size={18} />
                        <span>WHO Guideline: Fully Compliant</span>
                      </div>
                    ) : selectedCell.whoGuideline.compliance === 'Caution' ? (
                      <div className="who-badge-status who-caution">
                        <Volume2 size={18} />
                        <span>WHO Guideline: Moderate Ambient (Caution)</span>
                      </div>
                    ) : (
                      <div className="who-badge-status who-exceeded">
                        <AlertTriangle size={18} />
                        <span>WHO Guideline: Noise Limit Exceeded</span>
                      </div>
                    )}
                  </div>

                  <div className="who-details-grid">
                    <div className="who-detail-item">
                      <span className="who-label">WHO Daytime Threshold:</span>
                      <strong className="who-val">55.0 dB</strong>
                    </div>
                    <div className="who-detail-item">
                      <span className="who-label">WHO Nighttime Threshold:</span>
                      <strong className="who-val">45.0 dB</strong>
                    </div>
                    <div className="who-detail-item">
                      <span className="who-label">Max Safe Exposure:</span>
                      <strong className="who-val">{selectedCell.whoGuideline.maxSafeExposure}</strong>
                    </div>
                    <div className="who-detail-item">
                      <span className="who-label">Current Zone Level:</span>
                      <strong className="who-val" style={{ color: selectedCell.color }}>
                        {selectedCell.averageDb} dB
                      </strong>
                    </div>
                  </div>

                  <div className="who-advice-box">
                    <span className="font-semibold text-xs text-secondary block mb-1">Health Recommendation:</span>
                    <p className="text-xs leading-relaxed">{selectedCell.whoGuideline.healthAdvice}</p>
                  </div>
                </div>
              ) : (
                <div className="empty-state-box">
                  <p className="text-xs text-secondary">Acoustic assessment computed automatically based on decibel levels.</p>
                </div>
              )}
            </div>
          )}

          {activeTabDrawer === 'samples' && (
            <div className="drawer-tab-content">
              <div className="drawer-samples-list">
                {selectedCell.recentSamples && selectedCell.recentSamples.length > 0 ? (
                  selectedCell.recentSamples.map((s) => (
                    <div key={s.id} className="drawer-sample-row">
                      <div>
                        <span className="font-semibold text-xs block">{s.locationName || 'Acoustic Sample'}</span>
                        <span className="text-xs text-secondary">
                          <Clock size={11} className="inline mr-1 opacity-70" />
                          {new Date(s.timestamp).toLocaleTimeString()} · {s.estimatedSource || 'Ambient'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm block" style={{ color: selectedCell.color }}>
                          {s.decibel} dB
                        </span>
                        <span className="text-xs text-cyan font-mono">
                          {s.dominantFrequency || 440} Hz
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-secondary py-3 text-center">No individual samples recorded yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
