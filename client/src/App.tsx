import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { BottomNav, type ActiveTab } from './components/BottomNav';
import { DashboardTab } from './components/DashboardTab';
import { MeasureTab } from './components/MeasureTab';
import { MapTab } from './components/MapTab';
import { HistoryTab } from './components/HistoryTab';
import { fetchStats, fetchReadings, fetchHeatmap, toggleSimulation } from './services/api';
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
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Domain data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Target place passed from Map Search to Measure
  const [targetPlaceForMeasurement, setTargetPlaceForMeasurement] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);

  // Sync offline readings
  const handleSyncOffline = useCallback(async () => {
    try {
      const result = await syncOfflineQueue();
      setOfflineCount(getOfflineQueue().length);
      if (result.synced > 0) {
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

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

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

  const handleToggleSimulation = async () => {
    try {
      const res = await toggleSimulation();
      setIsSimulating(res.active);
    } catch (err) {
      console.error('Failed to toggle simulation:', err);
    }
  };

  useEffect(() => {
    loadAllData();

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
      },
      onSimulationChange: (active) => {
        setIsSimulating(active);
      }
    });

    return () => {
      disconnectSocket();
    };
  }, [loadAllData]);

  const handleReadingSubmitted = (submittedCoords?: { lat: number; lng: number }) => {
    setOfflineCount(getOfflineQueue().length);
    if (submittedCoords) {
      setUserCoords(submittedCoords);
    }
    setTargetPlaceForMeasurement(null);
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
        isSimulating={isSimulating}
        onToggleSimulation={handleToggleSimulation}
      />

      <main className="app-main-content">
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            cells={cells}
            recentReadings={readings}
            onNavigateToMeasure={() => {
              setTargetPlaceForMeasurement(null);
              setActiveTab('measure');
            }}
            onNavigateToMap={() => setActiveTab('map')}
            isSimulating={isSimulating}
            onToggleSimulation={handleToggleSimulation}
          />
        )}

        {activeTab === 'measure' && (
          <MeasureTab
            onReadingSubmitted={handleReadingSubmitted}
            onNavigateToMap={() => setActiveTab('map')}
            isOnline={isOnline && socketStatus === 'connected'}
            initialTargetPlace={targetPlaceForMeasurement}
          />
        )}

        {activeTab === 'map' && (
          <MapTab
            cells={cells}
            recentReadings={readings}
            onRefreshMap={loadAllData}
            userCoords={userCoords}
            isSimulating={isSimulating}
            onToggleSimulation={handleToggleSimulation}
            onNavigateToMeasureWithPlace={(place) => {
              setTargetPlaceForMeasurement(place);
              setActiveTab('measure');
            }}
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
