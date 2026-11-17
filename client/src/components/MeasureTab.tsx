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
  Send,
  Activity,
  Radio,
  SlidersHorizontal,
  Compass,
  MapPinned,
  Info
} from 'lucide-react';
import { AudioNoiseMeter } from '../services/audioMeter';
import { requestCurrentLocation, reverseGeocode, CAMPUS_PRESETS } from '../services/geolocation';
import { submitReading } from '../services/api';
import { saveToOfflineQueue } from '../services/offlineQueue';
import type { GeolocationState, FrequencyBreakdown } from '../types';

interface MeasureTabProps {
  onReadingSubmitted?: (submittedCoords?: { lat: number; lng: number }) => void;
  onNavigateToMap?: () => void;
  onNavigateToHistory?: () => void;
  isOnline: boolean;
  initialTargetPlace?: { name: string; lat: number; lng: number } | null;
}

export const MeasureTab: React.FC<MeasureTabProps> = ({
  onReadingSubmitted,
  onNavigateToMap,
  onNavigateToHistory,
  isOnline,
  initialTargetPlace
}) => {
  // Audio state
  const [isSampling, setIsSampling] = useState<boolean>(false);
  const [currentDb, setCurrentDb] = useState<number>(42.0);
  const [peakDb, setPeakDb] = useState<number>(42.0);
  const [calibrationOffset, setCalibrationOffset] = useState<number>(96.0);
  const [showCalibration, setShowCalibration] = useState<boolean>(false);

  // Sensor mode state (real microphone vs simulated sensor for mobile testing on HTTP)
  const [useSimulatedSensor, setUseSimulatedSensor] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  });
  const [activeSensorIsSimulated, setActiveSensorIsSimulated] = useState<boolean>(false);
  const [showMobileHttpHelp, setShowMobileHttpHelp] = useState<boolean>(false);

  // Frequency analysis state
  const [frequencyData, setFrequencyData] = useState<FrequencyBreakdown>({
    lowPercent: 28,
    midPercent: 54,
    highPercent: 18,
    dominantHz: 440,
    bandName: 'Mid (Speech/Urban)',
    estimatedSource: 'Human Conversation / Ambient'
  });
  const [octaveBands, setOctaveBands] = useState<number[]>([15, 25, 45, 60, 50, 30, 20, 10]);

  // 10-second capture progress
  const [sampleProgress, setSampleProgress] = useState<number>(0);
  const [, setSampleSamples] = useState<number[]>([]);
  const [capturedAverage, setCapturedAverage] = useState<number | null>(null);

  // Location mode: 'gps' | 'preset' | 'searched'
  const [locationMode, setLocationMode] = useState<'gps' | 'preset' | 'searched'>(
    initialTargetPlace ? 'searched' : 'gps'
  );

  // Geolocation state
  const [geoState, setGeoState] = useState<GeolocationState>({
    latitude: initialTargetPlace?.lat || null,
    longitude: initialTargetPlace?.lng || null,
    accuracy: 5,
    error: null,
    loading: false,
    permission: 'unknown'
  });
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>(
    initialTargetPlace?.name || 'Resolving real location...'
  );
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Status & submission feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const meterRef = useRef<AudioNoiseMeter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const getCategoryDetails = (db: number) => {
    if (db < 50) return { label: 'Quiet', color: 'var(--color-emerald)', desc: 'Library / Study standard' };
    if (db < 70) return { label: 'Moderate', color: 'var(--color-cyan)', desc: 'Normal conversation' };
    if (db < 85) return { label: 'Loud', color: 'var(--color-amber)', desc: 'Heavy traffic noise' };
    return { label: 'Hazardous', color: 'var(--color-rose)', desc: 'Potential hearing hazard' };
  };

  const activeDisplayDb = capturedAverage !== null ? capturedAverage : currentDb;
  const category = getCategoryDetails(activeDisplayDb);

  const handleSpectrumUpdate = useCallback((freqData: Uint8Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = 36;
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const value = freqData[i * 3] || 0;
      const percent = value / 255;
      const barHeight = Math.max(3, percent * height);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(1, percent > 0.7 ? '#ef4444' : percent > 0.4 ? '#f59e0b' : '#10b981');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
  }, []);

  const handleFrequencyUpdate = useCallback((breakdown: FrequencyBreakdown, bands: number[]) => {
    setFrequencyData(breakdown);
    setOctaveBands(bands);
  }, []);

  // Fetch real device GPS & reverse geocode address
  const fetchLiveDeviceGps = useCallback(async () => {
    setLocationMode('gps');
    setSelectedPreset(null);
    setGeoState(prev => ({ ...prev, loading: true, error: null }));
    setIsGeocoding(true);

    try {
      const result = await requestCurrentLocation();
      setGeoState(result);

      if (result.latitude && result.longitude) {
        const placeName = await reverseGeocode(result.latitude, result.longitude);
        setLocationLabel(placeName);
      } else if (result.error) {
        setLocationLabel('GPS unavailable - enter location manually or select preset');
      }
    } catch (err) {
      console.error('Location error:', err);
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  useEffect(() => {
    if (initialTargetPlace) {
      setLocationMode('searched');
      setLocationLabel(initialTargetPlace.name);
      setGeoState({
        latitude: initialTargetPlace.lat,
        longitude: initialTargetPlace.lng,
        accuracy: 5,
        error: null,
        loading: false,
        permission: 'granted'
      });
    } else {
      fetchLiveDeviceGps();
    }
  }, [initialTargetPlace, fetchLiveDeviceGps]);

  const handlePresetSelect = (presetName: string) => {
    const found = CAMPUS_PRESETS.find(p => p.name === presetName);
    if (found) {
      setLocationMode('preset');
      setSelectedPreset(presetName);
      setLocationLabel(found.name);
      setGeoState({
        latitude: found.lat,
        longitude: found.lng,
        accuracy: found.accuracy,
        error: null,
        loading: false,
        permission: 'granted'
      });
    }
  };

  const startSampling = async (forceSim?: boolean | React.MouseEvent) => {
    setErrorMessage(null);
    setSubmissionSuccess(false);
    setCapturedAverage(null);
    setSampleSamples([]);
    setSampleProgress(0);

    const shouldSim = typeof forceSim === 'boolean' ? forceSim : useSimulatedSensor;

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
          onSpectrumUpdate: handleSpectrumUpdate,
          onFrequencyUpdate: handleFrequencyUpdate
        });
      }

      const { isSimulated } = await meterRef.current.start(shouldSim);
      setActiveSensorIsSimulated(isSimulated);
      if (isSimulated && !useSimulatedSensor) {
        setUseSimulatedSensor(true);
      }
      setIsSampling(true);

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
      console.warn('Microphone error, falling back to simulated acoustic sensor:', err);
      // Auto-fallback so the user is never blocked on mobile!
      startSampling(true);
    }
  };

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

    setSampleSamples(samples => {
      if (samples.length > 0) {
        const sum = samples.reduce((a, b) => a + b, 0);
        const avg = parseFloat((sum / samples.length).toFixed(1));
        setCapturedAverage(avg);
      }
      return samples;
    });
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (meterRef.current) meterRef.current.stop();
    };
  }, []);

  const handleCalibrationChange = (val: number) => {
    setCalibrationOffset(val);
    if (meterRef.current) {
      meterRef.current.setCalibrationOffset(val);
    }
  };

  const handleSubmit = async () => {
    if (!geoState.latitude || !geoState.longitude) {
      setErrorMessage('Valid location coordinates required. Enable GPS or choose a preset.');
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
      locationName: locationLabel || `Location (${geoState.latitude.toFixed(4)}, ${geoState.longitude.toFixed(4)})`,
      source: activeSensorIsSimulated ? 'Mobile Simulated Sensor' : (locationMode === 'gps' ? 'Live Mobile GPS' : 'Campus Preset Contributor'),
      dominantFrequency: frequencyData.dominantHz,
      frequencyBand: frequencyData.bandName,
      frequencyDistribution: {
        lowPercent: frequencyData.lowPercent,
        midPercent: frequencyData.midPercent,
        highPercent: frequencyData.highPercent
      },
      estimatedSource: frequencyData.estimatedSource,
      timestamp: new Date().toISOString()
    };

    try {
      if (isOnline) {
        const res = await submitReading(payload);
        if (res && res.reading && res.reading.id) {
          try {
            const myIds = JSON.parse(localStorage.getItem('noisesense_my_submission_ids') || '[]');
            localStorage.setItem('noisesense_my_submission_ids', JSON.stringify([res.reading.id, ...myIds]));
          } catch {}
        }
      } else {
        const cached = saveToOfflineQueue(payload);
        if (cached && cached.id) {
          try {
            const myIds = JSON.parse(localStorage.getItem('noisesense_my_submission_ids') || '[]');
            localStorage.setItem('noisesense_my_submission_ids', JSON.stringify([cached.id, ...myIds]));
          } catch {}
        }
      }

      setSubmissionSuccess(true);
      onReadingSubmitted?.({ lat: geoState.latitude, lng: geoState.longitude });
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('Submission failed, queueing offline:', error);
      const cached = saveToOfflineQueue(payload);
      if (cached && cached.id) {
        try {
          const myIds = JSON.parse(localStorage.getItem('noisesense_my_submission_ids') || '[]');
          localStorage.setItem('noisesense_my_submission_ids', JSON.stringify([cached.id, ...myIds]));
        } catch {}
      }
      setSubmissionSuccess(true);
      onReadingSubmitted?.({ lat: geoState.latitude, lng: geoState.longitude });
    } finally {
      setIsSubmitting(false);
    }
  };

  const minGauge = 30;
  const maxGauge = 110;
  const normalizedValue = Math.min(Math.max((activeDisplayDb - minGauge) / (maxGauge - minGauge), 0), 1);
  const strokeDashoffset = 440 - (440 * 0.75 * normalizedValue);

  const OCTAVE_LABELS = ['63Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz'];

  return (
    <div className="tab-page-container">
      <div className="page-header">
        <h2 className="page-title">Acoustic Sound & Frequency Sensing</h2>
        <p className="page-subtitle">
          Real-time Web Audio API decibel estimation, FFT frequency breakdown, and GPS place resolution
        </p>
      </div>

      {errorMessage && (
        <div className="alert-box alert-error">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {submissionSuccess && (
        <div className="alert-box alert-success animate-fade-in">
          <CheckCircle2 size={18} />
          <div className="flex-1">
            <strong>Reading Successfully Submitted & Broadcast!</strong>
            <p className="text-xs mt-0.5">
              Recorded <strong>{activeDisplayDb.toFixed(1)} dB ({frequencyData.dominantHz} Hz)</strong> at{' '}
              <strong>{locationLabel}</strong> ({geoState.latitude?.toFixed(4)}, {geoState.longitude?.toFixed(4)}).
            </p>
          </div>
          <div className="flex-row-center gap-2">
            <button onClick={onNavigateToMap} className="btn-sm-inline">
              View on Map
            </button>
            {onNavigateToHistory && (
              <button onClick={onNavigateToHistory} className="btn-sm-inline" style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
                View in History
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sensor Mode Badge / Notification */}
      <div className="sensor-mode-banner" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 14px',
        marginBottom: '14px',
        borderRadius: '10px',
        background: useSimulatedSensor ? 'rgba(6, 182, 212, 0.08)' : 'rgba(16, 185, 129, 0.08)',
        border: `1px solid ${useSimulatedSensor ? 'rgba(6, 182, 212, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} className={useSimulatedSensor ? 'text-cyan' : 'text-emerald'} />
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
              {useSimulatedSensor ? 'Simulated Sensor Mode (Active)' : 'Physical Microphone Mode (Active)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (isSampling) stopSampling();
                setUseSimulatedSensor(!useSimulatedSensor);
              }}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer'
              }}
            >
              Switch to {useSimulatedSensor ? 'Physical Mic' : 'Simulated Sensor'}
            </button>
            <button
              type="button"
              onClick={() => setShowMobileHttpHelp(!showMobileHttpHelp)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Mobile browser permission help"
            >
              <Info size={15} />
            </button>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {useSimulatedSensor
            ? 'Mobile browsers block physical mic access on local HTTP (10.142.102.61:5173). Simulated mode is enabled so 10s sampling, visualizer, and map submissions work seamlessly!'
            : 'Hardware microphone requested. If your mobile browser blocks mic access on HTTP, switch to Simulated Sensor above.'}
        </p>

        {showMobileHttpHelp && (
          <div style={{
            marginTop: '4px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(0, 0, 0, 0.2)',
            fontSize: '11px',
            lineHeight: '1.5'
          }}>
            <strong>To use your phone\'s real hardware microphone on local Wi-Fi:</strong>
            <ol style={{ paddingLeft: '16px', margin: '4px 0 0 0' }}>
              <li>In Chrome on your phone, open <code>chrome://flags</code></li>
              <li>Search for: <code>unsafely-treat-insecure-origin-as-secure</code></li>
              <li>Add: <code>{typeof window !== 'undefined' ? window.location.origin : 'http://10.142.102.61:5173'}</code></li>
              <li>Set to <strong>Enabled</strong> and tap <strong>Relaunch</strong>.</li>
            </ol>
            <span style={{ display: 'block', marginTop: '4px', opacity: 0.85 }}>
              Or deploy to Cloud (Vercel + Render) for automatic free HTTPS!
            </span>
          </div>
        )}
      </div>

      {/* Main Gauge & Visualizer Card */}
      <div className="gauge-card">
        <div className="gauge-top-bar">
          <span
            className="category-pill"
            style={{ color: category.color, borderColor: category.color, backgroundColor: `${category.color}15` }}
          >
            {category.label}
          </span>

          <div className="flex-row-center gap-2">
            <div className="frequency-dominant-badge">
              <Activity size={12} className="text-cyan" />
              <span>Pitch:</span>
              <strong>{frequencyData.dominantHz} Hz</strong>
            </div>

            <div className="gauge-peak-badge">
              <span>Peak:</span>
              <strong>{peakDb.toFixed(1)} dB</strong>
            </div>

            <button
              type="button"
              onClick={() => setShowCalibration(!showCalibration)}
              className={`btn-calibration-toggle ${showCalibration ? 'calibration-active' : ''}`}
              title="Microphone Calibration Offset"
            >
              <Sliders size={13} />
              <span className="cal-btn-text">Calibrate</span>
            </button>
          </div>
        </div>

        {/* SVG Circular Decibel Arc Gauge */}
        <div className="gauge-svg-wrapper">
          <svg className="gauge-svg" viewBox="0 0 200 200">
            <circle
              className="gauge-bg-circle"
              cx="100"
              cy="100"
              r="70"
              strokeDasharray="440"
              strokeDashoffset="110"
              strokeLinecap="round"
            />
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
            width={320}
            height={46}
            className="spectrum-canvas"
          />
        </div>

        {/* Sound Signature Banner */}
        <div className="sound-signature-pill">
          <Radio size={13} className="text-teal" />
          <span className="text-xs font-semibold">Detected Profile:</span>
          <span className="text-xs text-primary font-bold">{frequencyData.estimatedSource}</span>
        </div>

        {/* 10-Second Progress Indicator */}
        {isSampling && (
          <div className="sampling-progress-wrapper animate-fade-in mt-3">
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

        {/* Capture / Sampling Controls - Centered & Prominently Positioned */}
        <div className="gauge-actions-row mt-3">
          {!isSampling ? (
            <button
              type="button"
              onClick={startSampling}
              className="btn-measure-start"
              id="start-sample-btn"
            >
              <Play size={18} fill="currentColor" />
              <span>{capturedAverage ? 'Re-sample 10s Average' : 'Start 10s Sample'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopSampling}
              className="btn-measure-stop"
              id="stop-sample-btn"
            >
              <MicOff size={18} />
              <span>Stop & Freeze Sample</span>
            </button>
          )}
        </div>

        {capturedAverage !== null && !isSampling && (
          <div className="captured-avg-banner animate-fade-in mt-2">
            <Sparkles size={14} className="text-teal" />
            <span>10s Exposure Average Captured: <strong>{capturedAverage} dB(A)</strong></span>
          </div>
        )}

        {/* Calibration Drawer */}
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

      {/* Real-time Frequency Spectrum & Octave Bands Card */}
      <div className="frequency-card">
        <div className="frequency-card-header">
          <div className="flex-row-center gap-2">
            <SlidersHorizontal size={17} className="text-teal" />
            <h3 className="panel-title">Real-Time Frequency Octave Bands</h3>
          </div>
          <span className="frequency-dominant-badge">
            Peak: <strong>{frequencyData.dominantHz} Hz</strong>
          </span>
        </div>

        <div className="octave-eq-grid">
          {OCTAVE_LABELS.map((label, idx) => {
            const val = octaveBands[idx] || 10;
            return (
              <div key={label} className="octave-col">
                <span className="octave-val">{val}%</span>
                <div className="octave-track">
                  <div
                    className="octave-fill"
                    style={{
                      height: `${Math.max(8, val)}%`,
                      backgroundColor: idx < 2 ? '#f59e0b' : idx < 6 ? '#06b6d4' : '#ef4444'
                    }}
                  />
                </div>
                <span className="octave-label">{label}</span>
              </div>
            );
          })}
        </div>

        <div className="band-breakdown-row mt-4">
          <div className="band-summary-item">
            <div className="band-summary-top">
              <span className="text-xs font-semibold">Low (20–250 Hz)</span>
              <span className="font-mono font-bold text-amber text-xs">{frequencyData.lowPercent}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill bg-amber" style={{ width: `${frequencyData.lowPercent}%` }} />
            </div>
            <small className="text-secondary text-xs">Rumble, engines, HVAC</small>
          </div>

          <div className="band-summary-item">
            <div className="band-summary-top">
              <span className="text-xs font-semibold">Mid (250–4000 Hz)</span>
              <span className="font-mono font-bold text-cyan text-xs">{frequencyData.midPercent}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill bg-cyan" style={{ width: `${frequencyData.midPercent}%` }} />
            </div>
            <small className="text-secondary text-xs">Human speech, dialogue</small>
          </div>

          <div className="band-summary-item">
            <div className="band-summary-top">
              <span className="text-xs font-semibold">High (4000+ Hz)</span>
              <span className="font-mono font-bold text-rose text-xs">{frequencyData.highPercent}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill bg-rose" style={{ width: `${frequencyData.highPercent}%` }} />
            </div>
            <small className="text-secondary text-xs">Sirens, grinding, hiss</small>
          </div>
        </div>
      </div>

      {/* Geolocation & Place Name Panel */}
      <div className="location-panel-card">
        <div className="panel-header-row">
          <div className="flex-row-center gap-2">
            <Navigation size={18} className="text-cyan" />
            <div>
              <h3 className="panel-title">Location & Geographic Tagging</h3>
              <p className="text-xs text-secondary">
                {locationMode === 'gps'
                  ? 'Real-Time Device GPS with Reverse Geocoded Address'
                  : locationMode === 'searched'
                  ? 'Target Place Selected from Map Search'
                  : 'Preset Simulation Location Active'}
              </p>
            </div>
          </div>
        </div>

        {/* Location Source Selector Tabs */}
        <div className="location-mode-selector">
          <button
            type="button"
            onClick={fetchLiveDeviceGps}
            className={`location-mode-btn ${locationMode === 'gps' ? 'location-mode-active' : ''}`}
          >
            <Compass size={14} className={geoState.loading ? 'spin-icon' : ''} />
            <span>Use Real Device GPS</span>
          </button>
          <button
            type="button"
            onClick={() => setLocationMode('preset')}
            className={`location-mode-btn ${locationMode === 'preset' ? 'location-mode-active' : ''}`}
          >
            <MapPinned size={14} />
            <span>Choose Demo Preset</span>
          </button>
        </div>

        {/* Real Address Card */}
        <div className="resolved-address-box">
          <div className="flex-between">
            <span className="text-xs font-semibold text-secondary flex-row-center gap-1">
              <MapPin size={13} className="text-teal" />
              Detected Location Name:
            </span>
            {locationMode === 'gps' && (
              <button
                type="button"
                onClick={fetchLiveDeviceGps}
                disabled={geoState.loading || isGeocoding}
                className="btn-refresh-address"
                title="Refresh current GPS position and resolve address"
              >
                <RotateCcw size={12} className={geoState.loading || isGeocoding ? 'spin-icon' : ''} />
                <span>{isGeocoding ? 'Resolving...' : 'Refresh Address'}</span>
              </button>
            )}
          </div>
          <input
            type="text"
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            className="text-input-primary font-bold mt-1"
            placeholder="e.g. My College Campus, Room 204"
          />
          <small className="text-xs text-secondary mt-1 block">
            This name will be saved and displayed on the live noise map and in history logs.
          </small>
        </div>

        {/* Coordinates Details Grid */}
        <div className="coordinates-grid mt-3">
          <div className="coordinate-item">
            <span className="coord-label">Latitude</span>
            <span className="coord-val">
              {geoState.latitude ? geoState.latitude.toFixed(6) : 'Searching GPS...'}
            </span>
          </div>
          <div className="coordinate-item">
            <span className="coord-label">Longitude</span>
            <span className="coord-val">
              {geoState.longitude ? geoState.longitude.toFixed(6) : 'Searching GPS...'}
            </span>
          </div>
          <div className="coordinate-item">
            <span className="coord-label">GPS Precision</span>
            <span className="coord-accuracy">
              {geoState.accuracy ? `±${geoState.accuracy.toFixed(1)}m` : '±5m'}
            </span>
          </div>
        </div>

        {/* Demo Preset Chips (Only shown if user selects 'preset' mode) */}
        {locationMode === 'preset' && (
          <div className="preset-selector-group animate-fade-in mt-3">
            <label className="input-label">Select Demo Zone Preset:</label>
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
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || isSampling || !geoState.latitude}
          className="btn-submit-reading"
        >
          {isSubmitting ? (
            <>
              <RotateCcw size={18} className="spin-icon" />
              <span>Transmitting Reading & Frequency Snapshot...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Submit & Broadcast Reading ({activeDisplayDb.toFixed(1)} dB · {frequencyData.dominantHz} Hz)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
