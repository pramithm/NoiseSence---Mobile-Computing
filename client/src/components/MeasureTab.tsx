import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MicOff,
  Navigation,
  CheckCircle2,
  Sliders,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  MapPin,
  Send
} from 'lucide-react';
import { AudioNoiseMeter } from '../services/audioMeter';
import { requestCurrentLocation, CAMPUS_PRESETS } from '../services/geolocation';
import { submitReading } from '../services/api';
import { saveToOfflineQueue } from '../services/offlineQueue';
import type { GeolocationState } from '../types';

interface MeasureTabProps {
  onReadingSubmitted?: () => void;
  onNavigateToMap?: () => void;
  isOnline: boolean;
}

export const MeasureTab: React.FC<MeasureTabProps> = ({
  onReadingSubmitted,
  onNavigateToMap,
  isOnline
}) => {
  // Audio state
  const [isSampling, setIsSampling] = useState<boolean>(false);
  const [currentDb, setCurrentDb] = useState<number>(42.0);
  const [peakDb, setPeakDb] = useState<number>(42.0);
  const [calibrationOffset, setCalibrationOffset] = useState<number>(96.0);
  const [showCalibration, setShowCalibration] = useState<boolean>(false);

  // 10-second capture progress
  const [sampleProgress, setSampleProgress] = useState<number>(0);
  const [, setSampleSamples] = useState<number[]>([]);
  const [capturedAverage, setCapturedAverage] = useState<number | null>(null);

  // Geolocation state
  const [geoState, setGeoState] = useState<GeolocationState>({
    latitude: CAMPUS_PRESETS[0].lat,
    longitude: CAMPUS_PRESETS[0].lng,
    accuracy: 4,
    error: null,
    loading: false,
    permission: 'unknown'
  });
  const [selectedPreset, setSelectedPreset] = useState<string>(CAMPUS_PRESETS[0].name);
  const [locationLabel, setLocationLabel] = useState<string>(CAMPUS_PRESETS[0].name);

  // Status & submission feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // AudioMeter reference & Canvas reference
  const meterRef = useRef<AudioNoiseMeter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Category determination
  const getCategoryDetails = (db: number) => {
    if (db < 50) return { label: 'Quiet', color: 'var(--color-emerald)', desc: 'Library / Study standard' };
    if (db < 70) return { label: 'Moderate', color: 'var(--color-cyan)', desc: 'Normal conversation' };
    if (db < 85) return { label: 'Loud', color: 'var(--color-amber)', desc: 'Heavy traffic noise' };
    return { label: 'Hazardous', color: 'var(--color-rose)', desc: 'Potential hearing hazard' };
  };

  const activeDisplayDb = capturedAverage !== null ? capturedAverage : currentDb;
  const category = getCategoryDetails(activeDisplayDb);

  // Draw Audio Spectrum Visualizer
  const handleSpectrumUpdate = useCallback((freqData: Uint8Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = 32;
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const value = freqData[i * 2] || 0;
      const percent = value / 255;
      const barHeight = Math.max(3, percent * height);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      // Gradient color based on intensity
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(1, percent > 0.7 ? '#ef4444' : percent > 0.4 ? '#f59e0b' : '#10b981');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
  }, []);

  // Request location on mount
  useEffect(() => {
    refreshLocation();
  }, []);

  const refreshLocation = async () => {
    setGeoState(prev => ({ ...prev, loading: true, error: null }));
    const result = await requestCurrentLocation();
    setGeoState(result);
    if (result.latitude && result.longitude) {
      // Find closest preset or format coordinates
      const matched = CAMPUS_PRESETS.find(
        p => Math.abs(p.lat - result.latitude!) < 0.001 && Math.abs(p.lng - result.longitude!) < 0.001
      );
      if (matched) {
        setSelectedPreset(matched.name);
        setLocationLabel(matched.name);
      } else {
        setLocationLabel(`Lat ${result.latitude.toFixed(4)}, Lng ${result.longitude.toFixed(4)}`);
      }
    }
  };

  // Select Preset Handler
  const handlePresetSelect = (presetName: string) => {
    setSelectedPreset(presetName);
    const found = CAMPUS_PRESETS.find(p => p.name === presetName);
    if (found) {
      setLocationLabel(found.name);
      setGeoState(prev => ({
        ...prev,
        latitude: found.lat,
        longitude: found.lng,
        accuracy: found.accuracy,
        error: null
      }));
    }
  };

  // Start 10-Second Acoustic Sample
  const startSampling = async () => {
    setErrorMessage(null);
    setSubmissionSuccess(false);
    setCapturedAverage(null);
    setSampleSamples([]);
    setSampleProgress(0);

    try {
      if (!meterRef.current) {
        meterRef.current = new AudioNoiseMeter({
          calibrationOffset,
          smoothingFactor: 0.35,
          onDecibelUpdate: (db, peak) => {
            setCurrentDb(db);
            setPeakDb(peak);
            setSampleSamples(prev => [...prev, db]);
          },
          onSpectrumUpdate: handleSpectrumUpdate
        });
      }

      await meterRef.current.start();
      setIsSampling(true);

      // Start 10-second countdown
      const startTime = Date.now();
      const durationMs = 10000;

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / durationMs) * 100);
        setSampleProgress(progress);

        if (elapsed >= durationMs) {
          stopSampling();
        }
      }, 100);
    } catch (err: unknown) {
      const error = err as Error;
      setIsSampling(false);
      setErrorMessage(`Microphone access error: ${error.message || 'Permission denied'}. Please allow microphone permissions.`);
    }
  };

  // Stop sampling & compute representative average
  const stopSampling = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }

    setIsSampling(false);

    // Calculate average over collected samples
    setSampleSamples(samples => {
      if (samples.length > 0) {
        const sum = samples.reduce((a, b) => a + b, 0);
        const avg = parseFloat((sum / samples.length).toFixed(1));
        setCapturedAverage(avg);
      }
      return samples;
    });
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (meterRef.current) meterRef.current.stop();
    };
  }, []);

  // Update calibration
  const handleCalibrationChange = (val: number) => {
    setCalibrationOffset(val);
    if (meterRef.current) {
      meterRef.current.setCalibrationOffset(val);
    }
  };

  // Submit reading to backend or offline queue
  const handleSubmit = async () => {
    if (!geoState.latitude || !geoState.longitude) {
      setErrorMessage('Location coordinates required. Please select a campus zone or enable GPS.');
      return;
    }

    const decibelToSubmit = capturedAverage !== null ? capturedAverage : currentDb;
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      decibel: decibelToSubmit,
      latitude: geoState.latitude,
      longitude: geoState.longitude,
      accuracy: geoState.accuracy || 5.0,
      locationName: locationLabel || 'Mobile Acoustic Measurement',
      source: 'Mobile Client (Web Audio API)',
      timestamp: new Date().toISOString()
    };

    try {
      if (isOnline) {
        await submitReading(payload);
      } else {
        saveToOfflineQueue(payload);
      }

      setSubmissionSuccess(true);
      onReadingSubmitted?.();
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('Submission failed, queueing offline:', error);
      saveToOfflineQueue(payload);
      setSubmissionSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // SVG Gauge calculations
  // Gauge range: 30 to 110 dB (span = 80 dB)
  const minGauge = 30;
  const maxGauge = 110;
  const normalizedValue = Math.min(Math.max((activeDisplayDb - minGauge) / (maxGauge - minGauge), 0), 1);
  const strokeDashoffset = 440 - (440 * 0.75 * normalizedValue);

  return (
    <div className="tab-page-container">
      {/* Title & Status */}
      <div className="page-header">
        <h2 className="page-title">Acoustic Sound Sensing</h2>
        <p className="page-subtitle">
          Web Audio API continuous acoustic estimation with 10-second noise averaging
        </p>
      </div>

      {/* Error / Alert Display */}
      {errorMessage && (
        <div className="alert-box alert-error">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Submission Success Toast */}
      {submissionSuccess && (
        <div className="alert-box alert-success animate-fade-in">
          <CheckCircle2 size={18} />
          <div className="flex-1">
            <strong>Reading Broadcast Successfully!</strong>
            <p className="text-xs mt-0.5">
              {isOnline
                ? 'Updated live map and synchronized with all connected peers via Socket.IO.'
                : 'Network unavailable. Stored in local offline queue and will sync automatically.'}
            </p>
          </div>
          <button onClick={onNavigateToMap} className="btn-sm-inline">
            View on Map
          </button>
        </div>
      )}

      {/* Main Gauge & Visualizer Card */}
      <div className="gauge-card">
        {/* Gauge Top Bar */}
        <div className="gauge-top-bar">
          <span
            className="category-pill"
            style={{ color: category.color, borderColor: category.color, backgroundColor: `${category.color}15` }}
          >
            {category.label}
          </span>

          <div className="gauge-peak-badge">
            <span>Peak:</span>
            <strong>{peakDb.toFixed(1)} dB</strong>
          </div>
        </div>

        {/* SVG Circular Decibel Arc Gauge */}
        <div className="gauge-svg-wrapper">
          <svg className="gauge-svg" viewBox="0 0 200 200">
            {/* Background Track */}
            <circle
              className="gauge-bg-circle"
              cx="100"
              cy="100"
              r="70"
              strokeDasharray="440"
              strokeDashoffset="110"
              strokeLinecap="round"
            />
            {/* Active Arc */}
            <circle
              className="gauge-progress-circle"
              cx="100"
              cy="100"
              r="70"
              stroke={category.color}
              strokeDasharray="440"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Central Numerical Display */}
          <div className="gauge-center-content">
            <span className="gauge-db-number" style={{ color: category.color }}>
              {activeDisplayDb.toFixed(1)}
            </span>
            <span className="gauge-db-unit">dB(A)</span>
            <span className="gauge-db-subtext">{category.desc}</span>
          </div>
        </div>

        {/* Real-time Spectrum Visualizer Canvas */}
        <div className="visualizer-container">
          <canvas
            ref={canvasRef}
            width={280}
            height={42}
            className="spectrum-canvas"
          />
        </div>

        {/* 10-Second Progress Indicator */}
        {isSampling && (
          <div className="sampling-progress-wrapper animate-fade-in">
            <div className="sampling-progress-header">
              <span className="sampling-progress-label">
                <Sparkles size={14} className="spin-icon" />
                Sampling 10-second exposure...
              </span>
              <span className="sampling-progress-time">
                {Math.ceil((100 - sampleProgress) / 10)}s remaining
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${sampleProgress}%`, backgroundColor: category.color }}
              />
            </div>
          </div>
        )}

        {/* Capture / Sampling Controls */}
        <div className="gauge-actions-row">
          {!isSampling ? (
            <button onClick={startSampling} className="btn-measure-start">
              <Play size={20} fill="currentColor" />
              <span>{capturedAverage ? 'Re-sample (10s)' : 'Start 10s Sample'}</span>
            </button>
          ) : (
            <button onClick={stopSampling} className="btn-measure-stop">
              <MicOff size={20} />
              <span>Stop & Freeze</span>
            </button>
          )}

          <button
            onClick={() => setShowCalibration(!showCalibration)}
            className={`btn-icon-secondary ${showCalibration ? 'active-icon-btn' : ''}`}
            title="Audio Hardware Calibration"
          >
            <Sliders size={18} />
          </button>
        </div>

        {/* Microphone Calibration Offset Accordion */}
        {showCalibration && (
          <div className="calibration-drawer animate-fade-in">
            <div className="calibration-header">
              <span className="font-semibold text-xs">Microphone Calibration Offset</span>
              <span className="calibration-val">{calibrationOffset > 0 ? `+${calibrationOffset}` : calibrationOffset} dB</span>
            </div>
            <input
              type="range"
              min="70"
              max="120"
              step="1"
              value={calibrationOffset}
              onChange={(e) => handleCalibrationChange(parseFloat(e.target.value))}
              className="calibration-slider"
            />
            <p className="calibration-note">
              Adjust if your device microphone reads consistently high or low compared to a reference sound meter. Default is 96 dB.
            </p>
          </div>
        )}
      </div>

      {/* Geolocation & Metadata Panel */}
      <div className="location-panel-card">
        <div className="panel-header-row">
          <div className="flex-row-center gap-2">
            <Navigation size={18} className="text-cyan" />
            <h3 className="panel-title">Geographic Location Tagging</h3>
          </div>
          <button
            onClick={refreshLocation}
            disabled={geoState.loading}
            className="btn-link-action"
            title="Refresh GPS Fix"
          >
            <RotateCcw size={13} className={geoState.loading ? 'spin-icon' : ''} />
            <span>GPS Fix</span>
          </button>
        </div>

        {/* GPS Coordinate Display */}
        <div className="coordinates-grid">
          <div className="coordinate-item">
            <span className="coord-label">Latitude</span>
            <span className="coord-val">
              {geoState.latitude ? geoState.latitude.toFixed(6) : 'Searching...'}
            </span>
          </div>
          <div className="coordinate-item">
            <span className="coord-label">Longitude</span>
            <span className="coord-val">
              {geoState.longitude ? geoState.longitude.toFixed(6) : 'Searching...'}
            </span>
          </div>
          <div className="coordinate-item">
            <span className="coord-label">GPS Accuracy</span>
            <span className="coord-accuracy">
              {geoState.accuracy ? `±${geoState.accuracy.toFixed(1)}m` : '±5m'}
            </span>
          </div>
        </div>

        {/* Quick Campus Presets (Ideal for classroom testing & presentations) */}
        <div className="preset-selector-group">
          <label className="input-label">Campus Zone Preset:</label>
          <div className="preset-chips-row">
            {CAMPUS_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => handlePresetSelect(p.name)}
                className={`preset-chip ${selectedPreset === p.name ? 'preset-chip-active' : ''}`}
              >
                <MapPin size={12} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Location Name / Notes */}
        <div className="form-group mt-3">
          <label className="input-label">Area Description / Notes:</label>
          <input
            type="text"
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            placeholder="e.g., Library 3rd Floor Quiet Study"
            className="text-input"
          />
        </div>

        {/* Submit Reading CTA */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || isSampling}
          className="btn-submit-reading"
        >
          {isSubmitting ? (
            <>
              <RotateCcw size={18} className="spin-icon" />
              <span>Transmitting Reading...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Submit & Broadcast Reading ({activeDisplayDb.toFixed(1)} dB)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
