// Prozeduraler Sound via WebAudio — keine Audiodateien nötig.
// Jet-Turbine oder Kolbenmotor (Propeller) je nach EngineType.
import type { EngineType } from '../aircraft/JetCatalog';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private abNoise: AudioBufferSourceNode | null = null;
  private abGain: GainNode | null = null;
  private propNoise: AudioBufferSourceNode | null = null;
  private propNoiseGain: GainNode | null = null;
  private propNoiseFilter: BiquadFilterNode | null = null;
  private lockOsc: OscillatorNode | null = null;
  private lockGain: GainNode | null = null;
  private muted = false;
  private masterVolume = 1;
  private engineMode: EngineType = 'jet';

  // Muss nach User-Geste aufgerufen werden (Browser-Autoplay-Policy)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();

    // Rausch-Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Triebwerk: zwei Sägezähne, leicht verstimmt
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 63;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Afterburner-Rauschen (Jet)
    this.abGain = this.ctx.createGain();
    this.abGain.gain.value = 0;
    const abFilter = this.ctx.createBiquadFilter();
    abFilter.type = 'bandpass';
    abFilter.frequency.value = 900;
    this.abNoise = this.ctx.createBufferSource();
    this.abNoise.buffer = this.noiseBuffer;
    this.abNoise.loop = true;
    this.abNoise.connect(abFilter);
    abFilter.connect(this.abGain);
    this.abGain.connect(this.ctx.destination);
    this.abNoise.start();

    // Propeller-Rauschen (Bandpass, RPM-gekoppelt)
    this.propNoiseGain = this.ctx.createGain();
    this.propNoiseGain.gain.value = 0;
    this.propNoiseFilter = this.ctx.createBiquadFilter();
    this.propNoiseFilter.type = 'bandpass';
    this.propNoiseFilter.frequency.value = 180;
    this.propNoiseFilter.Q.value = 0.7;
    this.propNoise = this.ctx.createBufferSource();
    this.propNoise.buffer = this.noiseBuffer;
    this.propNoise.loop = true;
    this.propNoise.connect(this.propNoiseFilter);
    this.propNoiseFilter.connect(this.propNoiseGain);
    this.propNoiseGain.connect(this.ctx.destination);
    this.propNoise.start();

    // Lock-Ton
    this.lockGain = this.ctx.createGain();
    this.lockGain.gain.value = 0;
    this.lockOsc = this.ctx.createOscillator();
    this.lockOsc.type = 'square';
    this.lockOsc.frequency.value = 1100;
    this.lockOsc.connect(this.lockGain);
    this.lockGain.connect(this.ctx.destination);
    this.lockOsc.start();
  }

  setEngineMode(mode: EngineType) {
    this.engineMode = mode;
    if (!this.ctx) return;
    // Sofort Filter/Typen anpassen
    if (mode === 'piston') {
      if (this.engineOsc) this.engineOsc.type = 'triangle';
      if (this.engineOsc2) this.engineOsc2.type = 'sawtooth';
      if (this.engineFilter) {
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 320;
      }
      if (this.abGain) this.abGain.gain.value = 0;
    } else {
      if (this.engineOsc) this.engineOsc.type = 'sawtooth';
      if (this.engineOsc2) this.engineOsc2.type = 'sawtooth';
      if (this.engineFilter) {
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 500;
      }
      if (this.propNoiseGain) this.propNoiseGain.gain.value = 0;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m && this.engineGain) this.engineGain.gain.value = 0;
    if (m && this.abGain) this.abGain.gain.value = 0;
    if (m && this.lockGain) this.lockGain.gain.value = 0;
    if (m && this.propNoiseGain) this.propNoiseGain.gain.value = 0;
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  get isMuted() {
    return this.muted;
  }

  get volume() {
    return this.masterVolume;
  }

  private vol(n: number) {
    return n * this.masterVolume;
  }

  /**
   * @param speedNorm 0..1+
   * @param throttle 0..1
   * @param afterburner Jet-WEP
   * @param rpm Optional Prop-RPM 0..1 (defaults to throttle)
   */
  updateEngine(
    speedNorm: number,
    throttle: number,
    afterburner: boolean,
    dt: number,
    rpm?: number
  ) {
    if (!this.ctx || !this.engineGain || this.muted) return;

    if (this.engineMode === 'piston') {
      this.updatePiston(speedNorm, throttle, dt, rpm ?? throttle);
      return;
    }

    const g = this.engineGain.gain;
    const target = this.vol(0.05 + throttle * 0.1);
    g.value += (target - g.value) * Math.min(1, dt * 5);
    const freq = 45 + speedNorm * 120 + throttle * 30;
    this.engineOsc!.frequency.value = freq;
    this.engineOsc2!.frequency.value = freq * 1.03;
    if (this.propNoiseGain) {
      this.propNoiseGain.gain.value += (0 - this.propNoiseGain.gain.value) * Math.min(1, dt * 6);
    }
    if (this.abGain) {
      const ab = this.abGain.gain;
      const t = afterburner ? this.vol(0.16) : 0;
      ab.value += (t - ab.value) * Math.min(1, dt * 6);
    }
  }

  /** Kolbenmotor: tiefes Brummen + Propeller-Rauschen, Pitch ~ RPM */
  private updatePiston(speedNorm: number, throttle: number, dt: number, rpm: number) {
    const r = Math.max(0.05, rpm);
    // Grundbrummen (Zylinder-Takte) — tiefere Frequenzen
    const base = 28 + r * 55 + speedNorm * 18;
    this.engineOsc!.frequency.value = base;
    this.engineOsc2!.frequency.value = base * 1.08 + 2;
    if (this.engineFilter) {
      this.engineFilter.frequency.value = 180 + r * 220 + throttle * 80;
    }
    const g = this.engineGain!.gain;
    const target = this.vol(0.07 + throttle * 0.14 + r * 0.04);
    g.value += (target - g.value) * Math.min(1, dt * 4);

    // Prop-Blatt-Rauschen
    if (this.propNoiseGain && this.propNoiseFilter) {
      this.propNoiseFilter.frequency.value = 90 + r * 280;
      const pn = this.vol(0.04 + r * 0.12);
      this.propNoiseGain.gain.value += (pn - this.propNoiseGain.gain.value) * Math.min(1, dt * 5);
    }
    if (this.abGain) {
      this.abGain.gain.value += (0 - this.abGain.gain.value) * Math.min(1, dt * 8);
    }
  }

  cannonShot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    // Props: dumpferer MG-Sound
    const low = this.engineMode === 'piston' ? 1400 : 2500;
    const end = this.engineMode === 'piston' ? 180 : 300;
    f.frequency.setValueAtTime(low, t);
    f.frequency.exponentialRampToValueAtTime(end, t + 0.08);
    g.gain.setValueAtTime(this.engineMode === 'piston' ? 0.28 : 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (this.engineMode === 'piston' ? 0.12 : 0.09));
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.14);
  }

  missileLaunch() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.65);
  }

  /** Kurzes Zischen/Pop beim Flare-Auswurf */
  flarePop() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f);
    f.connect(g);
    g.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.4);
  }

  explosion(big = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 900 : 1400, t);
    f.frequency.exponentialRampToValueAtTime(60, t + (big ? 1.4 : 0.7));
    g.gain.setValueAtTime(big ? 0.5 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.5 : 0.8));
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + (big ? 1.6 : 0.9));
  }

  setLockTone(progress: number) {
    // 0 = aus, 0<x<1 = suchend (Piep-Intervall), 1 = LOCK (Dauerton)
    if (!this.ctx || !this.lockGain || this.muted) return;
    if (progress <= 0) { this.lockGain.gain.value = 0; return; }
    if (progress >= 1) {
      this.lockGain.gain.value = 0.06;
      this.lockOsc!.frequency.value = 1400;
      return;
    }
    // gepulst
    const t = this.ctx.currentTime;
    const interval = 0.3 - progress * 0.2;
    this.lockGain.gain.value = (t % interval) < interval * 0.4 ? 0.05 : 0;
    this.lockOsc!.frequency.value = 1000 + progress * 300;
  }

  stallWarning(on: boolean) {
    if (!this.ctx || this.muted) return;
    // einfacher Dauerton über lockGain würde kollidieren — eigener kurzer Beep
    if (!on) return;
    const t = this.ctx.currentTime;
    if (this._lastStallBeep && t - this._lastStallBeep < 0.5) return;
    this._lastStallBeep = t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 700;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.32);
  }
  private _lastStallBeep = 0;
}
