import React from 'react';
import {
  Volume2,
  Mic,
  MapPin,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Radio,
  Layers,
  Clock
} from 'lucide-react';
import type { DashboardStats, HeatmapCell, NoiseReading } from '../types';

interface DashboardTabProps {
  stats: DashboardStats | null;
  cells: HeatmapCell[];
  recentReadings: NoiseReading[];
  onNavigateToMeasure: () => void;
  onNavigateToMap: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  stats,
  cells,
  recentReadings,
  onNavigateToMeasure,
  onNavigateToMap
}) => {
  const avgDb = stats?.averageNoise ?? 55.4;
  
  const getEnvironmentalStatus = (db: number) => {
    if (db < 50) {
      return {
        badge: 'Acoustic Comfort: Optimal',
        color: 'var(--color-emerald)',
        icon: ShieldCheck,
        desc: 'Current campus baseline is tranquil. Ideal for focused research, reading, and study.'
      };
    }
    if (db < 70) {
      return {
        badge: 'Acoustic Comfort: Moderate',
        color: 'var(--color-cyan)',
        icon: Volume2,
        desc: 'Normal ambient urban/campus background. Typical conversation and active communal spaces.'
      };
    }
    if (db < 85) {
      return {
        badge: 'Acoustic Comfort: Elevated',
        color: 'var(--color-amber)',
        icon: AlertTriangle,
        desc: 'Elevated traffic and transit sound. Prolonged exposure during work may increase fatigue.'
      };
    }
    return {
      badge: 'Acoustic Alert: Hazardous',
      color: 'var(--color-rose)',
      icon: AlertTriangle,
      desc: 'Noise crosses physical safety guideline thresholds. Hearing protection or relocation recommended.'
    };
  };

  const status = getEnvironmentalStatus(avgDb);
  const StatusIcon = status.icon;

  return (
    <div className="tab-page-container">
      {/* Hero Environmental Intelligence Banner */}
      <section className="hero-card">
        <div className="hero-gradient-overlay" />
        <div className="hero-content">
          <div className="hero-header-row">
            <span className="hero-badge" style={{ borderColor: status.color, color: status.color }}>
              <StatusIcon size={14} />
              {status.badge}
            </span>
            <span className="live-broadcast-pill">
              <span className="pulse-dot"></span>
              Live Synced
            </span>
          </div>

          <div className="hero-main-row">
            <div className="hero-number-block">
              <span className="hero-db-val">{avgDb.toFixed(1)}</span>
              <div className="hero-unit-block">
                <span className="hero-db-unit">dB(A)</span>
                <span className="hero-db-label">Campus Average</span>
              </div>
            </div>

            <p className="hero-description">{status.desc}</p>
          </div>

          <div className="hero-actions-row">
            <button onClick={onNavigateToMeasure} className="btn-primary-gradient">
              <Mic size={18} />
              <span>Record Live Sample</span>
              <ArrowRight size={16} />
            </button>
            <button onClick={onNavigateToMap} className="btn-secondary-glass">
              <MapPin size={17} />
              <span>Explore Spatial Map</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4 Metric Summary Cards */}
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon-box bg-emerald-light">
            <Radio size={20} className="text-emerald" />
          </div>
          <div>
            <div className="metric-value">{stats?.totalReadings ?? 0}</div>
            <div className="metric-label">Crowdsourced Readings</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box bg-cyan-light">
            <Layers size={20} className="text-cyan" />
          </div>
          <div>
            <div className="metric-value">{stats?.activeCells ?? cells.length}</div>
            <div className="metric-label">Monitored Grid Cells</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box bg-amber-light">
            <TrendingUp size={20} className="text-amber" />
          </div>
          <div>
            <div className="metric-value">{(stats?.maxNoise ?? 91.5).toFixed(1)} <span className="metric-unit">dB</span></div>
            <div className="metric-label">Peak Recorded Noise</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-box bg-rose-light">
            <ShieldCheck size={20} className="text-rose" />
          </div>
          <div>
            <div className="metric-value">{(stats?.minNoise ?? 39.4).toFixed(1)} <span className="metric-unit">dB</span></div>
            <div className="metric-label">Quietest Zone Record</div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Layout on larger screens */}
      <div className="dashboard-columns">
        {/* Monitored Zones Overview */}
        <section className="dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Active Geographic Zones</h2>
              <p className="section-subtitle">Real-time aggregated micro-grid cells</p>
            </div>
            <button onClick={onNavigateToMap} className="text-link-btn">
              View Map <ArrowRight size={14} />
            </button>
          </div>

          <div className="zones-list">
            {cells.slice(0, 4).map((cell) => (
              <div key={cell.cellId} className="zone-row-card">
                <div className="zone-row-left">
                  <div
                    className="zone-level-pill"
                    style={{ backgroundColor: `${cell.color}20`, color: cell.color, borderColor: cell.color }}
                  >
                    {cell.averageDb} dB
                  </div>
                  <div className="zone-details">
                    <span className="zone-name">
                      {cell.recentSamples?.[0]?.locationName || `Grid ${cell.cellId.replace('cell_', '')}`}
                    </span>
                    <span className="zone-meta">
                      {cell.readingCount} {cell.readingCount === 1 ? 'measurement' : 'measurements'} · Peak {cell.maxDb} dB
                    </span>
                  </div>
                </div>
                <span className="zone-category-tag" style={{ color: cell.color }}>
                  {cell.category}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Live Incoming Feed */}
        <section className="dashboard-section-card">
          <div className="section-header-row">
            <div className="flex-row-center gap-2">
              <span className="pulse-dot"></span>
              <div>
                <h2 className="section-title">Live Sensing Feed</h2>
                <p className="section-subtitle">Readings stream across participant devices</p>
              </div>
            </div>
          </div>

          <div className="feed-list">
            {recentReadings.slice(0, 5).map((reading) => (
              <div key={reading.id} className="feed-item">
                <div className="feed-item-top">
                  <span className="feed-location">{reading.locationName}</span>
                  <span
                    className="feed-db-badge"
                    style={{
                      color:
                        reading.decibel < 50
                          ? 'var(--color-emerald)'
                          : reading.decibel < 70
                          ? 'var(--color-cyan)'
                          : reading.decibel < 85
                          ? 'var(--color-amber)'
                          : 'var(--color-rose)'
                    }}
                  >
                    {reading.decibel.toFixed(1)} dB
                  </span>
                </div>
                <div className="feed-item-bottom">
                  <span className="feed-source">{reading.source}</span>
                  <span className="feed-time">
                    <Clock size={12} />
                    {new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Noise Level Scale Educational Card */}
      <section className="scale-guide-card">
        <h3 className="scale-guide-title">Standard Acoustic Scale Reference</h3>
        <div className="scale-bar-track">
          <div className="scale-segment bg-emerald">
            <span>&lt; 50 dB</span>
            <small>Quiet / Library</small>
          </div>
          <div className="scale-segment bg-cyan">
            <span>50 - 70 dB</span>
            <small>Moderate / Conversation</small>
          </div>
          <div className="scale-segment bg-amber">
            <span>70 - 85 dB</span>
            <small>Loud / Heavy Traffic</small>
          </div>
          <div className="scale-segment bg-rose">
            <span>&gt; 85 dB</span>
            <small>Hazardous / Machinery</small>
          </div>
        </div>
      </section>
    </div>
  );
};
