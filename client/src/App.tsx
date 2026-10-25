import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { BottomNav, type ActiveTab } from './components/BottomNav';
import { DashboardTab } from './components/DashboardTab';
import { MeasureTab } from './components/MeasureTab';
import { MapTab } from './components/MapTab';
import { HistoryTab } from './components/HistoryTab';
import { fetchStats, fetchReadings, fetchHeatmap } from './services/api';
import { initSocket, disconnectSocket, type SocketStatus } from './services/socket';
import { getOfflineQueue, syncOfflineQueue } from './services/offlineQueue';
import { requestCurrentLocation } from './services/geolocation';
import type { DashboardStats, HeatmapCell, NoiseReading } from './types';

export const App: React.FC = () => {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('noisesense_theme') === 'dark';
  });

  // Real-time network & socket state
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState<number>(() => getOfflineQueue().length);

  // Domain data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Sync offline readings
  const handleSyncOffline = useCallback(async () => {
    try {
      const result = await syncOfflineQueue();
      setOfflineCount(getOfflineQueue().length);
      if (result.synced > 0) {
        // Refresh domain data
        loadAllData();
      }
    } catch (err) {
      console.warn('Sync failed:', err);
    }
  }, []);

  // Theme toggle
  const handleToggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('noisesense_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Apply dark/light class on document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  // Network online/offline event handlers
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleSyncOffline();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSocketStatus('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleSyncOffline]);

  // Fetch all initial data
  const loadAllData = useCallback(async () => {
    try {
      const [statsData, heatmapData, readingsData] = await Promise.all([
        fetchStats().catch(() => null),
        fetchHeatmap().catch(() => []),
        fetchReadings(100).catch(() => [])
      ]);

      if (statsData) setStats(statsData);
      if (heatmapData) setCells(heatmapData);
      if (readingsData) setReadings(readingsData);
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  }, []);

  // Setup real-time Socket.IO and listeners
  useEffect(() => {
    loadAllData();

    // Fetch user coords for map centering
    requestCurrentLocation().then(res => {
      if (res.latitude && res.longitude) {
        setUserCoords({ lat: res.latitude, lng: res.longitude });
      }
    });

    initSocket({
      onStatusChange: (status) => setSocketStatus(status),
      onHeatmapUpdate: (updatedCells) => {
        setCells(updatedCells);
      },
      onNewReading: (newReading) => {
        setReadings(prev => [newReading, ...prev.filter(r => r.id !== newReading.id)].slice(0, 100));
      },
      onStatsUpdate: (updatedStats) => {
        setStats(updatedStats);
      }
    });

    return () => {
      disconnectSocket();
    };
  }, [loadAllData]);

  // Callback when a new reading is submitted from MeasureTab
  const handleReadingSubmitted = () => {
    setOfflineCount(getOfflineQueue().length);
    loadAllData();
  };

  return (
    <div className={`app-root ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <Header
        socketStatus={socketStatus}
        storageEngine={stats?.storageEngine}
        offlineCount={offlineCount}
        onSyncOffline={handleSyncOffline}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onRefreshData={loadAllData}
      />

      <main className="app-main-content">
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            cells={cells}
            recentReadings={readings}
            onNavigateToMeasure={() => setActiveTab('measure')}
            onNavigateToMap={() => setActiveTab('map')}
          />
        )}

        {activeTab === 'measure' && (
          <MeasureTab
            onReadingSubmitted={handleReadingSubmitted}
            onNavigateToMap={() => setActiveTab('map')}
            isOnline={isOnline && socketStatus === 'connected'}
          />
        )}

        {activeTab === 'map' && (
          <MapTab
            cells={cells}
            recentReadings={readings}
            onRefreshMap={loadAllData}
            userCoords={userCoords}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            readings={readings}
            onSyncOffline={handleSyncOffline}
            onRefreshReadings={loadAllData}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMeasuring={activeTab === 'measure'}
      />
    </div>
  );
};

export default App;
