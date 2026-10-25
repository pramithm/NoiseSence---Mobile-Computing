export interface AudioMeterOptions {
  calibrationOffset?: number; // Decibel offset tuning (default ~96 dB)
  smoothingFactor?: number;   // 0 to 1 smoothing for instantaneous readings
  onDecibelUpdate?: (currentDb: number, peakDb: number) => void;
  onSpectrumUpdate?: (frequencyData: Uint8Array) => void;
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

  private onDecibelUpdate?: (currentDb: number, peakDb: number) => void;
  private onSpectrumUpdate?: (frequencyData: Uint8Array) => void;

  constructor(options: AudioMeterOptions = {}) {
    if (options.calibrationOffset !== undefined) this.calibrationOffset = options.calibrationOffset;
    if (options.smoothingFactor !== undefined) this.smoothingFactor = options.smoothingFactor;
    this.onDecibelUpdate = options.onDecibelUpdate;
    this.onSpectrumUpdate = options.onSpectrumUpdate;
  }

  public setCalibrationOffset(offset: number) {
    this.calibrationOffset = offset;
  }

  public getCalibrationOffset(): number {
    return this.calibrationOffset;
  }

  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

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
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.isRunning = true;
      this.currentDb = 35.0;
      this.peakDb = 35.0;

      this.processAudioLoop();
      return true;
    } catch (err) {
      console.error('Failed to initialize AudioContext / microphone:', err);
      this.stop();
      throw err;
    }
  }

  private processAudioLoop = () => {
    if (!this.isRunning || !this.analyser) return;

    const bufferLength = this.analyser.fftSize;
    const timeData = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(timeData);

    // Calculate Root Mean Square (RMS)
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumSquares += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    // Calculate estimated sound pressure level in dB
    // 20 * log10(rms) + calibrationOffset
    const minRms = 1e-5;
    const rawDb = 20 * Math.log10(Math.max(rms, minRms)) + this.calibrationOffset;

    // Constrain to plausible decibel bounds (30 dB to 125 dB)
    const clampedDb = Math.min(Math.max(rawDb, 30.0), 125.0);

    // Exponential smoothing
    this.currentDb = this.smoothingFactor * clampedDb + (1 - this.smoothingFactor) * this.currentDb;
    if (this.currentDb > this.peakDb) {
      this.peakDb = this.currentDb;
    } else {
      // Slow peak decay
      this.peakDb = Math.max(this.currentDb, this.peakDb - 0.15);
    }

    if (this.onDecibelUpdate) {
      this.onDecibelUpdate(
        parseFloat(this.currentDb.toFixed(1)),
        parseFloat(this.peakDb.toFixed(1))
      );
    }

    // Spectrum frequency data for visualizer canvas
    if (this.onSpectrumUpdate) {
      const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(frequencyData);
      this.onSpectrumUpdate(frequencyData);
    }

    this.animationFrameId = requestAnimationFrame(this.processAudioLoop);
  };

  public stop() {
    this.isRunning = false;

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
      currentDb: parseFloat(this.currentDb.toFixed(1)),
      peakDb: parseFloat(this.peakDb.toFixed(1)),
      calibrationOffset: this.calibrationOffset
    };
  }
}
