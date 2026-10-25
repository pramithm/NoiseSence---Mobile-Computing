import React from 'react';
import { Activity, Wifi, WifiOff, RefreshCw, Moon, Sun, Database } from 'lucide-react';
import type { SocketStatus } from '../services/socket';
import { resetDemoSeed } from '../services/api';

interface HeaderProps {
  socketStatus: SocketStatus;
  storageEngine?: string;
  offlineCount: number;
  onSyncOffline: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onRefreshData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  socketStatus,
  storageEngine,
  offlineCount,
  onSyncOffline,
  isDarkMode,
  onToggleTheme,
  onRefreshData
}) => {
  const [isResetting, setIsResetting] = React.useState(false);

  const handleResetDemo = async () => {
    if (confirm('Reset demonstration data to standard campus baseline?')) {
      setIsResetting(true);
      try {
        await resetDemoSeed();
        onRefreshData();
      } catch (err) {
        console.error('Failed to reset seed:', err);
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <header className="header-container">
      <div className="header-content">
        {/* Brand */}
        <div className="brand-group">
          <div className="brand-logo-glow">
            <Activity className="brand-icon" size={24} />
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">NoiseSense</h1>
              <span className="pwa-badge">PWA</span>
            </div>
            <p className="brand-subtitle">Acoustic Environmental Intelligence</p>
          </div>
        </div>

        {/* Status Indicators & Actions */}
        <div className="header-actions">
          {/* Real-time Socket Indicator */}
          <div
            className={`status-pill ${
              socketStatus === 'connected'
                ? 'status-connected'
                : socketStatus === 'connecting'
                ? 'status-connecting'
                : 'status-disconnected'
            }`}
            title={`WebSocket: ${socketStatus}`}
          >
            {socketStatus === 'connected' ? (
              <>
                <span className="pulse-dot"></span>
                <Wifi size={14} />
                <span className="pill-text">Live Sync</span>
              </>
            ) : socketStatus === 'connecting' ? (
              <>
                <RefreshCw size={14} className="spin-icon" />
                <span className="pill-text">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span className="pill-text">Offline</span>
              </>
            )}
          </div>

          {/* Database / Storage badge */}
          {storageEngine && (
            <div className="storage-pill" title={`Data Engine: ${storageEngine}`}>
              <Database size={13} />
              <span className="pill-text">{storageEngine.includes('Postgre') ? 'PostGIS' : 'Local DB'}</span>
            </div>
          )}

          {/* Offline Pending Items Badge */}
          {offlineCount > 0 && (
            <button
              onClick={onSyncOffline}
              className="offline-sync-btn"
              title="Click to sync offline measurements"
            >
              <RefreshCw size={13} className="spin-on-hover" />
              <span>{offlineCount} Pending</span>
            </button>
          )}

          {/* Reset Demo Data */}
          <button
            onClick={handleResetDemo}
            disabled={isResetting}
            className="header-icon-btn"
            title="Reset to Demo Baseline Readings"
          >
            <RefreshCw size={16} className={isResetting ? 'spin-icon' : ''} />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="header-icon-btn"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
    </header>
  );
};
