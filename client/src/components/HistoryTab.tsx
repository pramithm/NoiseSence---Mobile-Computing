import React, { useState } from 'react';
import {
  Download,
  Search,
  RefreshCw,
  Trash2,
  Clock,
  WifiOff,
  Radio,
  Activity,
  User,
  CheckCircle2,
  MapPin
} from 'lucide-react';
import type { NoiseReading, OfflineReading } from '../types';
import { getOfflineQueue, removeFromOfflineQueue } from '../services/offlineQueue';

interface HistoryTabProps {
  readings: NoiseReading[];
  onSyncOffline: () => void;
  onRefreshReadings: () => void;
  onNavigateToMapWithCoords?: (coords: { lat: number; lng: number }) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  readings,
  onSyncOffline,
  onRefreshReadings,
  onNavigateToMapWithCoords
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');
  const [offlineItems, setOfflineItems] = useState<OfflineReading[]>(() => getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load readings submitted from this device
  const [mySubmissionIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('noisesense_my_submission_ids');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

  const mySubmissions = readings.filter(r => mySubmissionIds.has(r.id));
  const latestUserReading = mySubmissions.length > 0 ? mySubmissions[0] : null;

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await onSyncOffline();
    setOfflineItems(getOfflineQueue());
    setIsSyncing(false);
  };

  const handleRemoveOfflineItem = (id: string) => {
    removeFromOfflineQueue(id);
    setOfflineItems(getOfflineQueue());
  };

  const filteredReadings = readings.filter((r) => {
    if (scopeFilter === 'mine' && !mySubmissionIds.has(r.id)) return false;
    const matchesCat = filterCategory === 'All' || r.category === filterCategory;
    const matchesSearch =
      searchQuery === '' ||
      r.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.estimatedSource && r.estimatedSource.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const exportToCSV = () => {
    if (readings.length === 0) return;

    const headers = ['ID', 'Decibel_dBA', 'Category', 'DominantFrequency_Hz', 'Estimated_Source', 'Latitude', 'Longitude', 'Accuracy_m', 'Location', 'Source', 'Timestamp'];
    const rows = readings.map((r) => [
      r.id,
      r.decibel,
      r.category,
      r.dominantFrequency || 440,
      `"${(r.estimatedSource || 'Ambient').replace(/"/g, '""')}"`,
      r.latitude,
      r.longitude,
      r.accuracy,
      `"${r.locationName.replace(/"/g, '""')}"`,
      `"${r.source.replace(/"/g, '""')}"`,
      r.timestamp
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `noisesense_acoustic_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="tab-page-container">
      <div className="page-header flex-between">
        <div>
          <h2 className="page-title">Measurement Log & Spectral History</h2>
          <p className="page-subtitle">
            Chronological audit of crowdsourced acoustic contributions with frequency analysis
          </p>
        </div>
        <button
          onClick={exportToCSV}
          disabled={readings.length === 0}
          className="btn-secondary-glass flex-row-center gap-1.5"
          title="Export data as CSV for project evaluation"
        >
          <Download size={15} />
          <span>Export CSV</span>
        </button>
      </div>

      {offlineItems.length > 0 && (
        <div className="offline-panel-card animate-fade-in">
          <div className="offline-panel-header">
            <div className="flex-row-center gap-2">
              <WifiOff size={18} className="text-amber" />
              <div>
                <h3 className="font-semibold text-sm">Offline Cached Readings ({offlineItems.length})</h3>
                <p className="text-xs text-secondary">
                  These measurements were recorded without internet and are stored locally.
                </p>
              </div>
            </div>
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="btn-sync-action"
            >
              <RefreshCw size={14} className={isSyncing ? 'spin-icon' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync All'}</span>
            </button>
          </div>

          <div className="offline-items-list">
            {offlineItems.map((item) => (
              <div key={item.id} className="offline-item-row">
                <div>
                  <span className="font-semibold text-sm">{item.decibel} dB</span>
                  <span className="text-xs text-secondary block">{item.locationName}</span>
                </div>
                <div className="flex-row-center gap-2">
                  <span className="badge-offline">Cached</span>
                  <button
                    onClick={() => handleRemoveOfflineItem(item.id)}
                    className="btn-icon-danger"
                    title="Remove from queue"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest Submission Highlight Card (Requirement 3) */}
      {latestUserReading && (
        <div className="my-submission-hero-card animate-fade-in">
          <div className="flex-row-center gap-3">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div className="flex-row-center gap-2">
                <span className="badge-my-reading">
                  <User size={11} /> Your Recent Submission
                </span>
                <span className="text-xs text-secondary">
                  {new Date(latestUserReading.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '3px 0 0 0', color: 'var(--text-primary)' }}>
                {latestUserReading.decibel.toFixed(1)} dB(A) — {latestUserReading.locationName}
              </h4>
              <span className="text-xs text-secondary mt-0.5 block">
                Pitch: <strong>{latestUserReading.dominantFrequency} Hz</strong> · Source: <strong>{latestUserReading.estimatedSource}</strong>
              </span>
            </div>
          </div>

          {onNavigateToMapWithCoords && (
            <button
              type="button"
              onClick={() => onNavigateToMapWithCoords({ lat: latestUserReading.latitude, lng: latestUserReading.longitude })}
              className="btn-sm-inline"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <MapPin size={13} />
              <span>Locate on Map</span>
            </button>
          )}
        </div>
      )}

      {/* Scope Filter Chips: All vs My Submissions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setScopeFilter('all')}
          className={`filter-pill ${scopeFilter === 'all' ? 'filter-pill-active' : ''}`}
        >
          All Contributions ({readings.length})
        </button>
        <button
          type="button"
          onClick={() => setScopeFilter('mine')}
          className={`filter-pill ${scopeFilter === 'mine' ? 'filter-pill-active' : ''}`}
        >
          <User size={12} className="inline mr-1" />
          My Submissions ({mySubmissions.length})
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="history-filters-bar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by area, frequency, or source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="history-category-chips">
          {['All', 'Quiet', 'Moderate', 'Loud', 'Hazardous'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`filter-pill ${filterCategory === cat ? 'filter-pill-active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Readings Table */}
      <div className="history-list-card">
        <div className="history-list-header">
          <span className="font-semibold text-sm">
            Recorded Readings ({filteredReadings.length})
          </span>
          <button
            onClick={onRefreshReadings}
            className="btn-icon-subtle"
            title="Refresh list"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {filteredReadings.length === 0 ? (
          <div className="empty-state-box">
            <Radio size={36} className="text-secondary opacity-50" />
            <h4 className="empty-state-title">No readings match current filter</h4>
            <p className="empty-state-desc">
              Try adjusting your category filter or search keywords.
            </p>
          </div>
        ) : (
          <div className="readings-table-wrapper">
            <table className="readings-table">
              <thead>
                <tr>
                  <th>Sound Level</th>
                  <th>Pitch (Hz)</th>
                  <th>Detected Source</th>
                  <th>Location / Area</th>
                  <th>Coordinates</th>
                  <th>Source</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredReadings.map((r) => {
                  const isMine = mySubmissionIds.has(r.id);
                  const dbColor =
                    r.decibel < 50
                      ? 'var(--color-emerald)'
                      : r.decibel < 70
                      ? 'var(--color-cyan)'
                      : r.decibel < 85
                      ? 'var(--color-amber)'
                      : 'var(--color-rose)';

                  return (
                    <tr key={r.id} className={`reading-table-row ${isMine ? 'row-my-reading' : ''}`}>
                      <td>
                        <div className="flex-row-center gap-1.5 flex-wrap">
                          <span className="table-db-val" style={{ color: dbColor }}>
                            {r.decibel.toFixed(1)} dB
                          </span>
                          <span
                            className="table-cat-badge"
                            style={{
                              color: dbColor,
                              borderColor: dbColor,
                              backgroundColor: `${dbColor}15`
                            }}
                          >
                            {r.category}
                          </span>
                          {isMine && (
                            <span className="badge-my-reading">
                              <User size={10} /> You
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs font-bold text-cyan">
                          <Activity size={11} className="inline mr-1" />
                          {r.dominantFrequency || 440} Hz
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-primary block">
                          {r.estimatedSource || 'Ambient Acoustic'}
                        </span>
                      </td>
                      <td>
                        <div className="table-location-cell">
                          <span className="font-medium text-primary">{r.locationName}</span>
                          <small className="text-secondary">Accuracy ±{r.accuracy}m</small>
                        </div>
                      </td>
                      <td className="table-coord-cell">
                        {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                      </td>
                      <td className="table-source-cell">{r.source}</td>
                      <td className="table-time-cell">
                        <Clock size={12} className="inline mr-1 opacity-70" />
                        {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
