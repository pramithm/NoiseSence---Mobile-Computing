import type { FrequencyBreakdown } from '../types';

export interface AudioMeterOptions {
  calibrationOffset?: number; // Decibel offset tuning (default ~96 dB)
  smoothingFactor?: number;   // 0 to 1 smoothing for instantaneous readings
  onDecibelUpdate?: (currentDb: number, peakDb: number) => void;
  onSpectrumUpdate?: (frequencyData: Uint8Array) => void;
  onFrequencyUpdate?: (breakdown: FrequencyBreakdown, octaveBands: number[]) => void;
}

export class AudioNoiseMeter {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  
  private calibrationOffset: number = 96.0;
  private smoothingFactor: number = 0.3;
  private currentDb: number = 30.0;
  private peakDb: number = 30.0;
  private isRunning: boolean = false;
  private isSimulated: boolean = false;
  private simAngle: number = 0;

  private onDecibelUpdate?: (currentDb: number, peakDb: number) => void;
  private onSpectrumUpdate?: (frequencyData: Uint8Array) => void;
  private onFrequencyUpdate?: (breakdown: FrequencyBreakdown, octaveBands: number[]) => void;

  private latestBreakdown: FrequencyBreakdown = {
    lowPercent: 30,
    midPercent: 55,
    highPercent: 15,
    dominantHz: 440,
    bandName: 'Mid (Speech/Urban)',
    estimatedSource: 'Human Conversation / Ambient'
  };

  constructor(options: AudioMeterOptions = {}) {
    if (options.calibrationOffset !== undefined) this.calibrationOffset = options.calibrationOffset;
    if (options.smoothingFactor !== undefined) this.smoothingFactor = options.smoothingFactor;
    this.onDecibelUpdate = options.onDecibelUpdate;
    this.onSpectrumUpdate = options.onSpectrumUpdate;
    this.onFrequencyUpdate = options.onFrequencyUpdate;
  }

  public setCalibrationOffset(offset: number) {
    this.calibrationOffset = offset;
  }

  public getCalibrationOffset(): number {
    return this.calibrationOffset;
  }

  public async start(forceSimulation = false): Promise<{ isSimulated: boolean }> {
    if (this.isRunning) return { isSimulated: this.isSimulated };

    if (forceSimulation) {
      this.isSimulated = true;
      this.isRunning = true;
      this.currentDb = 55.0;
      this.peakDb = 55.0;
      this.processSimulatedAudioLoop();
      return { isSimulated: true };
    }

    const hasMedia = typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');

    if (!hasMedia) {
      console.warn('Microphone API unavailable (insecure HTTP context). Using simulated acoustic sensor mode.');
      this.isSimulated = true;
      this.isRunning = true;
      this.currentDb = 55.0;
      this.peakDb = 55.0;
      this.processSimulatedAudioLoop();
      return { isSimulated: true };
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.45;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.isRunning = true;
      this.isSimulated = false;
      this.currentDb = 35.0;
      this.peakDb = 35.0;

      this.processAudioLoop();
      return { isSimulated: false };
    } catch (err) {
      console.warn('Microphone access blocked or failed, falling back to simulated acoustic sensor:', err);
      this.isSimulated = true;
      this.isRunning = true;
      this.currentDb = 55.0;
      this.peakDb = 55.0;
      this.processSimulatedAudioLoop();
      return { isSimulated: true };
    }
  }

  private processSimulatedAudioLoop = () => {
    if (!this.isRunning || !this.isSimulated) return;

    this.simAngle += 0.08;
    // Ambient acoustic fluctuation (between 48 and 78 dB)
    const targetDb = 59.0 + Math.sin(this.simAngle) * 9.5 + Math.sin(this.simAngle * 2.3) * 4.2 + (Math.random() * 4 - 2);
    this.currentDb = this.smoothingFactor * targetDb + (1 - this.smoothingFactor) * this.currentDb;
    if (this.currentDb > this.peakDb) {
      this.peakDb = this.currentDb;
    } else {
      this.peakDb = Math.max(this.currentDb, this.peakDb - 0.2);
    }

    if (this.onDecibelUpdate) {
      this.onDecibelUpdate(
        parseFloat(this.currentDb.toFixed(1)),
        parseFloat(this.peakDb.toFixed(1))
      );
    }

    // 256-bin simulated audio spectrum
    const binCount = 256;
    const frequencyData = new Uint8Array(binCount);
    for (let i = 0; i < binCount; i++) {
      const centerFactor = Math.exp(-Math.pow((i - 48) / 36, 2));
      const jitter = (Math.sin(this.simAngle * 3 + i * 0.25) + 1) * 0.5;
      const val = Math.min(255, Math.max(0, Math.round((centerFactor * 165 + jitter * 75) * (this.currentDb / 70))));
      frequencyData[i] = val;
    }

    if (this.onSpectrumUpdate) {
      this.onSpectrumUpdate(frequencyData);
    }

    const dominantHz = Math.round(440 + Math.sin(this.simAngle) * 90 + (Math.random() * 20 - 10));
    const octaveBands = [24, 42, 70, 84, 72, 50, 32, 18];
    this.latestBreakdown = {
      lowPercent: 28,
      midPercent: 58,
      highPercent: 14,
      dominantHz,
      bandName: 'Mid (Speech/Urban)',
      estimatedSource: this.currentDb > 70 ? 'Commercial Hub & Social Buzz' : 'Conversational Dialogue & Footfall'
    };

    if (this.onFrequencyUpdate) {
      this.onFrequencyUpdate(this.latestBreakdown, octaveBands);
    }

    this.animationFrameId = requestAnimationFrame(this.processSimulatedAudioLoop);
  };

  private processAudioLoop = () => {
    if (!this.isRunning || !this.analyser || !this.audioContext) return;

    const bufferLength = this.analyser.fftSize;
    const timeData = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(timeData);

    // 1. Calculate Root Mean Square (RMS) energy
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumSquares += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    // 2. Calibrated decibel conversion
    const minRms = 1e-5;
    const rawDb = 20 * Math.log10(Math.max(rms, minRms)) + this.calibrationOffset;
    const clampedDb = Math.min(Math.max(rawDb, 30.0), 125.0);

    // 3. Smoothing & peak decay
    this.currentDb = this.smoothingFactor * clampedDb + (1 - this.smoothingFactor) * this.currentDb;
    if (this.currentDb > this.peakDb) {
      this.peakDb = this.currentDb;
    } else {
      this.peakDb = Math.max(this.currentDb, this.peakDb - 0.15);
    }

    if (this.onDecibelUpdate) {
      this.onDecibelUpdate(
        parseFloat(this.currentDb.toFixed(1)),
        parseFloat(this.peakDb.toFixed(1))
      );
    }

    // 4. Frequency domain analysis (FFT)
    const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(frequencyData);

    if (this.onSpectrumUpdate) {
      this.onSpectrumUpdate(frequencyData);
    }

    // 5. Compute Dominant Frequency & Energy Distribution across bands
    const sampleRate = this.audioContext.sampleRate;
    const binSize = sampleRate / this.analyser.fftSize; // Hz per bin

    let maxBinVal = 0;
    let maxBinIdx = 0;
    let lowEnergy = 0;  // 20 - 250 Hz
    let midEnergy = 0;  // 250 - 4000 Hz
    let highEnergy = 0; // 4000 - 20000 Hz

    // 8 Octave bands: 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz
    const octaveSums = [0, 0, 0, 0, 0, 0, 0, 0];
    const octaveCounts = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < frequencyData.length; i++) {
      const freq = i * binSize;
      const mag = frequencyData[i];

      if (mag > maxBinVal && freq >= 40) {
        maxBinVal = mag;
        maxBinIdx = i;
      }

      if (freq <= 250) {
        lowEnergy += mag;
      } else if (freq <= 4000) {
        midEnergy += mag;
      } else {
        highEnergy += mag;
      }

      // Map to 8 octave bands
      if (freq < 90) { octaveSums[0] += mag; octaveCounts[0]++; }
      else if (freq < 180) { octaveSums[1] += mag; octaveCounts[1]++; }
      else if (freq < 355) { octaveSums[2] += mag; octaveCounts[2]++; }
      else if (freq < 710) { octaveSums[3] += mag; octaveCounts[3]++; }
      else if (freq < 1420) { octaveSums[4] += mag; octaveCounts[4]++; }
      else if (freq < 2840) { octaveSums[5] += mag; octaveCounts[5]++; }
      else if (freq < 5680) { octaveSums[6] += mag; octaveCounts[6]++; }
      else { octaveSums[7] += mag; octaveCounts[7]++; }
    }

    const totalEnergy = Math.max(1, lowEnergy + midEnergy + highEnergy);
    const lowPercent = Math.round((lowEnergy / totalEnergy) * 100);
    const midPercent = Math.round((midEnergy / totalEnergy) * 100);
    const highPercent = Math.max(0, 100 - lowPercent - midPercent);

    const dominantHz = Math.round(maxBinIdx * binSize);

    // Determine band name & acoustic source signature
    let bandName: 'Low (Rumble)' | 'Mid (Speech/Urban)' | 'High (Machinery/Siren)' = 'Mid (Speech/Urban)';
    let estimatedSource = 'Human Conversation & Urban Ambient';

    if (this.currentDb < 45) {
      estimatedSource = 'Quiet Ambient / Low Noise Baseline';
    } else if (lowPercent > 50 || dominantHz < 220) {
      bandName = 'Low (Rumble)';
      estimatedSource = this.currentDb > 75
        ? 'Heavy Engine Rumble / Transit Bus'
        : 'HVAC Airflow / Distant Traffic';
    } else if (highPercent > 35 || dominantHz > 3500) {
      bandName = 'High (Machinery/Siren)';
      estimatedSource = this.currentDb > 75
        ? 'Machinery / Siren / Construction Grinding'
        : 'High Frequency Ventilation / Electronic Buzz';
    } else {
      bandName = 'Mid (Speech/Urban)';
      estimatedSource = this.currentDb > 68
        ? 'Active Social Space / Cafeteria Chatter'
        : 'Conversational Dialogue / Study Area';
    }

    const octaveBands = octaveSums.map((sum, idx) => {
      const count = Math.max(1, octaveCounts[idx]);
      return Math.round((sum / count) / 255 * 100);
    });

    this.latestBreakdown = {
      lowPercent,
      midPercent,
      highPercent,
      dominantHz: Math.max(50, dominantHz),
      bandName,
      estimatedSource
    };

    if (this.onFrequencyUpdate) {
      this.onFrequencyUpdate(this.latestBreakdown, octaveBands);
    }

    this.animationFrameId = requestAnimationFrame(this.processAudioLoop);
  };

  public getLatestFrequencyBreakdown(): FrequencyBreakdown {
    return this.latestBreakdown;
  }

  public stop() {
    this.isRunning = false;
    this.isSimulated = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      isSimulated: this.isSimulated,
      currentDb: parseFloat(this.currentDb.toFixed(1)),
      peakDb: parseFloat(this.peakDb.toFixed(1)),
      calibrationOffset: this.calibrationOffset,
      frequency: this.latestBreakdown
    };
  }
}
