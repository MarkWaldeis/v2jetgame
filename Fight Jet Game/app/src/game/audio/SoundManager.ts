// Prozeduraler Sound via WebAudio — keine Audiodateien nötig.
// Soft-Engine, Combat-SFX und UI-Klicks (Steel Ops).

import type { EngineType } from '../aircraft/JetCatalog';

type UiKind = 'click' | 'hover' | 'nav' | 'confirm' | 'deny' | 'purchase' | 'start';

/**
 * Singleton — Game + React-Menüs teilen denselben AudioContext.
 */
class SoundManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // ── Engine layers ──
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engOscA: OscillatorNode | null = null; // soft body
  private engOscB: OscillatorNode | null = null; // harmonic
  private engOscC: OscillatorNode | null = null; // sub rumble
  private whooshSrc: AudioBufferSourceNode | null = null;
  private whooshGain: GainNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private abSrc: AudioBufferSourceNode | null = null;
  private abGain: GainNode | null = null;
  private abFilter: BiquadFilterNode | null = null;
  private propSrc: AudioBufferSourceNode | null = null;
  private propGain: GainNode | null = null;
  private propFilter: BiquadFilterNode | null = null;

  // ── Lock tone ──
  private lockOsc: OscillatorNode | null = null;
  private lockGain: GainNode | null = null;
  private lockWasFull = false;

  private noiseBuffer: AudioBuffer | null = null;
  private softNoiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private masterVolume = 1;
  private engineMode: EngineType = 'jet';
  private gameplayActive = false;
  private lastStallBeep = 0;
  private lastHoverAt = 0;
  private lastUiAt = 0;
  private menuAmbGain: GainNode | null = null;
  private menuAmbOsc: OscillatorNode | null = null;
  private menuAmbOsc2: OscillatorNode | null = null;

  // ── Public API ──────────────────────────────────────────────────────────

  /** Nach User-Geste (Browser Autoplay Policy). Idempotent. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    // Master bus + light compression (smoother mix, less harsh peaks)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.noiseBuffer = this.makeNoise(ctx, 2, 1);
    this.softNoiseBuffer = this.makeNoise(ctx, 2, 0.55);

    this.buildEngineGraph(ctx);
    this.buildLockTone(ctx);
    this.buildMenuAmbience(ctx);
  }

  setEngineMode(mode: EngineType) {
    this.engineMode = mode;
    if (!this.ctx || !this.engOscA || !this.engOscB || !this.engFilter) return;
    if (mode === 'piston') {
      this.engOscA.type = 'triangle';
      this.engOscB.type = 'sine';
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 280;
      this.engFilter.Q.value = 0.6;
    } else {
      this.engOscA.type = 'triangle';
      this.engOscB.type = 'sine';
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 420;
      this.engFilter.Q.value = 0.55;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMuteGains();
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.now(), 0.05);
    }
  }

  get isMuted() {
    return this.muted;
  }

  get volume() {
    return this.masterVolume;
  }

  /** Im Menü Engine aus, leise Ambient an; im Flug umgekehrt. */
  setGameplayActive(active: boolean) {
    this.gameplayActive = active;
    if (!this.ctx) return;
    if (!active) {
      this.fadeGain(this.engGain, 0, 0.35);
      this.fadeGain(this.whooshGain, 0, 0.35);
      this.fadeGain(this.abGain, 0, 0.2);
      this.fadeGain(this.propGain, 0, 0.25);
      this.fadeGain(this.lockGain, 0, 0.1);
      this.fadeGain(this.menuAmbGain, this.muted ? 0 : 0.035, 0.6);
    } else {
      this.fadeGain(this.menuAmbGain, 0, 0.25);
    }
  }

  /**
   * @param speedNorm 0..1+
   * @param throttle 0..1
   * @param afterburner Jet-WEP
   * @param rpm Optional Prop-RPM 0..1
   */
  updateEngine(
    speedNorm: number,
    throttle: number,
    afterburner: boolean,
    dt: number,
    rpm?: number
  ) {
    if (!this.ctx || !this.engGain || this.muted || !this.gameplayActive) return;

    if (this.engineMode === 'piston') {
      this.updatePiston(speedNorm, throttle, dt, rpm ?? throttle);
      return;
    }
    this.updateJet(speedNorm, throttle, afterburner, dt);
  }

  // ── Combat one-shots ────────────────────────────────────────────────────

  cannonShot() {
    if (!this.ready()) return;
    const t = this.now();
    const low = this.engineMode === 'piston';
    // Punchy low thump + short metallic tick
    this.noiseBurst({
      t,
      duration: low ? 0.11 : 0.07,
      highpass: 80,
      lowpassStart: low ? 1200 : 2200,
      lowpassEnd: low ? 160 : 280,
      gain: low ? 0.22 : 0.16,
      q: 0.7,
    });
    this.tone({
      t,
      type: 'triangle',
      freq: low ? 140 : 220,
      freqEnd: low ? 60 : 90,
      duration: 0.06,
      gain: 0.07,
    });
  }

  missileLaunch() {
    if (!this.ready()) return;
    const t = this.now();
    // Whoosh + rising hiss
    this.noiseBurst({
      t,
      duration: 0.55,
      highpass: 200,
      lowpassStart: 500,
      lowpassEnd: 2800,
      gain: 0.18,
      q: 0.9,
      bandpass: true,
    });
    this.tone({
      t,
      type: 'sine',
      freq: 180,
      freqEnd: 520,
      duration: 0.4,
      gain: 0.06,
    });
  }

  flarePop() {
    if (!this.ready()) return;
    const t = this.now();
    this.noiseBurst({
      t,
      duration: 0.28,
      highpass: 1400,
      lowpassStart: 4000,
      lowpassEnd: 500,
      gain: 0.12,
      q: 0.5,
    });
    this.tone({
      t,
      type: 'sine',
      freq: 900,
      freqEnd: 280,
      duration: 0.15,
      gain: 0.04,
    });
  }

  explosion(big = false) {
    if (!this.ready()) return;
    const t = this.now();
    const dur = big ? 1.35 : 0.72;
    this.noiseBurst({
      t,
      duration: dur,
      highpass: 40,
      lowpassStart: big ? 700 : 1100,
      lowpassEnd: 45,
      gain: big ? 0.38 : 0.24,
      q: 0.55,
    });
    // Sub boom
    this.tone({
      t,
      type: 'sine',
      freq: big ? 55 : 75,
      freqEnd: 28,
      duration: big ? 0.9 : 0.45,
      gain: big ? 0.22 : 0.12,
    });
    if (big) {
      this.tone({
        t: t + 0.04,
        type: 'triangle',
        freq: 110,
        freqEnd: 40,
        duration: 0.5,
        gain: 0.08,
      });
    }
  }

  /** Spezieller Kill-Sound (über Explosion hinaus). */
  killConfirm(kind: 'air' | 'ground' = 'air') {
    if (!this.ready()) return;
    const t = this.now();
    // Impact layer already via explosion — add brass/phosphor fanfare
    if (kind === 'air') {
      // Rising success chord
      const notes = [392, 494, 587]; // G4 B4 D5
      notes.forEach((f, i) => {
        this.tone({
          t: t + i * 0.055,
          type: 'triangle',
          freq: f,
          freqEnd: f * 1.02,
          duration: 0.28,
          gain: 0.055 - i * 0.008,
        });
      });
      this.noiseBurst({
        t,
        duration: 0.35,
        highpass: 600,
        lowpassStart: 2400,
        lowpassEnd: 800,
        gain: 0.08,
        q: 1.2,
        bandpass: true,
      });
    } else {
      // Deeper ground thump + short stamp
      this.tone({
        t,
        type: 'sine',
        freq: 90,
        freqEnd: 45,
        duration: 0.4,
        gain: 0.14,
      });
      this.tone({
        t: t + 0.08,
        type: 'triangle',
        freq: 220,
        freqEnd: 180,
        duration: 0.22,
        gain: 0.05,
      });
      this.noiseBurst({
        t,
        duration: 0.45,
        highpass: 80,
        lowpassStart: 900,
        lowpassEnd: 120,
        gain: 0.12,
        q: 0.6,
      });
    }
  }

  /** Treffer-Tick (Kanone/Rakete am Ziel). */
  hitConfirm() {
    if (!this.ready()) return;
    const t = this.now();
    this.tone({
      t,
      type: 'sine',
      freq: 880,
      freqEnd: 440,
      duration: 0.07,
      gain: 0.04,
    });
  }

  /** Player takes damage. */
  damageHit() {
    if (!this.ready()) return;
    const t = this.now();
    this.noiseBurst({
      t,
      duration: 0.2,
      highpass: 120,
      lowpassStart: 800,
      lowpassEnd: 150,
      gain: 0.14,
      q: 0.8,
    });
    this.tone({
      t,
      type: 'sawtooth',
      freq: 120,
      freqEnd: 55,
      duration: 0.18,
      gain: 0.05,
    });
  }

  setLockTone(progress: number) {
    if (!this.ctx || !this.lockGain || !this.lockOsc || this.muted) return;
    const p = Math.max(0, Math.min(1, progress));

    // Edge: freshly acquired full lock
    if (p >= 1 && !this.lockWasFull) {
      this.lockAcquired();
      this.lockWasFull = true;
    } else if (p < 1) {
      this.lockWasFull = false;
    }

    if (p <= 0) {
      this.lockGain.gain.setTargetAtTime(0, this.now(), 0.04);
      return;
    }

    if (p >= 1) {
      // Soft continuous lock tone (not piercing square)
      this.lockOsc.type = 'sine';
      this.lockOsc.frequency.setTargetAtTime(920, this.now(), 0.02);
      this.lockGain.gain.setTargetAtTime(0.028, this.now(), 0.04);
      return;
    }

    // Searching: gentle pulsed beeps, rate increases with progress
    this.lockOsc.type = 'sine';
    const t = this.now();
    const interval = 0.42 - p * 0.28;
    const pulse = (t % interval) < interval * 0.22;
    this.lockOsc.frequency.setTargetAtTime(720 + p * 220, t, 0.02);
    this.lockGain.gain.setTargetAtTime(pulse ? 0.03 : 0.0001, t, 0.01);
  }

  private lockAcquired() {
    if (!this.ready()) return;
    const t = this.now();
    // Pleasant two-tone lock chime
    this.tone({ t, type: 'sine', freq: 660, freqEnd: 660, duration: 0.12, gain: 0.06 });
    this.tone({
      t: t + 0.09,
      type: 'sine',
      freq: 990,
      freqEnd: 990,
      duration: 0.18,
      gain: 0.055,
    });
  }

  stallWarning(on: boolean) {
    if (!this.ready() || !on) return;
    const t = this.now();
    if (t - this.lastStallBeep < 0.55) return;
    this.lastStallBeep = t;
    this.tone({
      t,
      type: 'sine',
      freq: 640,
      freqEnd: 520,
      duration: 0.22,
      gain: 0.045,
    });
  }

  waveStart() {
    if (!this.ready()) return;
    const t = this.now();
    const notes = [330, 415, 494];
    notes.forEach((f, i) => {
      this.tone({
        t: t + i * 0.08,
        type: 'triangle',
        freq: f,
        freqEnd: f * 1.01,
        duration: 0.22,
        gain: 0.05,
      });
    });
  }

  victory() {
    if (!this.ready()) return;
    const t = this.now();
    const melody = [392, 494, 587, 784];
    melody.forEach((f, i) => {
      this.tone({
        t: t + i * 0.14,
        type: 'triangle',
        freq: f,
        freqEnd: f,
        duration: 0.35,
        gain: 0.06,
      });
    });
    this.noiseBurst({
      t: t + 0.1,
      duration: 0.6,
      highpass: 400,
      lowpassStart: 2000,
      lowpassEnd: 600,
      gain: 0.06,
      q: 0.8,
      bandpass: true,
    });
  }

  gameOver() {
    if (!this.ready()) return;
    const t = this.now();
    this.tone({ t, type: 'triangle', freq: 220, freqEnd: 90, duration: 0.7, gain: 0.07 });
    this.tone({
      t: t + 0.12,
      type: 'sine',
      freq: 165,
      freqEnd: 70,
      duration: 0.85,
      gain: 0.05,
    });
    this.noiseBurst({
      t,
      duration: 0.9,
      highpass: 60,
      lowpassStart: 600,
      lowpassEnd: 80,
      gain: 0.1,
      q: 0.5,
    });
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  ui(kind: UiKind) {
    this.init();
    if (!this.ready()) return;
    const t = this.now();
    // Debounce hover spam
    if (kind === 'hover') {
      if (t - this.lastHoverAt < 0.045) return;
      this.lastHoverAt = t;
    } else {
      if (t - this.lastUiAt < 0.03) return;
      this.lastUiAt = t;
    }

    switch (kind) {
      case 'hover':
        this.tone({ t, type: 'sine', freq: 1400, freqEnd: 1600, duration: 0.04, gain: 0.012 });
        break;
      case 'click':
        this.tone({ t, type: 'triangle', freq: 520, freqEnd: 380, duration: 0.07, gain: 0.04 });
        this.noiseBurst({
          t,
          duration: 0.04,
          highpass: 800,
          lowpassStart: 3000,
          lowpassEnd: 1200,
          gain: 0.035,
          q: 0.8,
        });
        break;
      case 'nav':
        this.tone({ t, type: 'sine', freq: 440, freqEnd: 440, duration: 0.06, gain: 0.035 });
        this.tone({
          t: t + 0.05,
          type: 'sine',
          freq: 660,
          freqEnd: 660,
          duration: 0.08,
          gain: 0.03,
        });
        break;
      case 'confirm':
        this.tone({ t, type: 'triangle', freq: 494, freqEnd: 494, duration: 0.1, gain: 0.05 });
        this.tone({
          t: t + 0.08,
          type: 'triangle',
          freq: 740,
          freqEnd: 740,
          duration: 0.16,
          gain: 0.045,
        });
        break;
      case 'deny':
        this.tone({ t, type: 'triangle', freq: 220, freqEnd: 140, duration: 0.16, gain: 0.045 });
        break;
      case 'purchase':
        this.tone({ t, type: 'sine', freq: 660, freqEnd: 660, duration: 0.08, gain: 0.04 });
        this.tone({
          t: t + 0.07,
          type: 'sine',
          freq: 880,
          freqEnd: 990,
          duration: 0.14,
          gain: 0.04,
        });
        this.tone({
          t: t + 0.16,
          type: 'sine',
          freq: 1320,
          freqEnd: 1320,
          duration: 0.12,
          gain: 0.03,
        });
        break;
      case 'start':
        this.tone({ t, type: 'triangle', freq: 330, freqEnd: 330, duration: 0.1, gain: 0.05 });
        this.tone({
          t: t + 0.09,
          type: 'triangle',
          freq: 494,
          freqEnd: 494,
          duration: 0.12,
          gain: 0.05,
        });
        this.tone({
          t: t + 0.2,
          type: 'triangle',
          freq: 659,
          freqEnd: 784,
          duration: 0.28,
          gain: 0.055,
        });
        break;
    }
  }

  // ── Engine internals ────────────────────────────────────────────────────

  private updateJet(speedNorm: number, throttle: number, afterburner: boolean, dt: number) {
    if (!this.engGain || !this.engOscA || !this.engOscB || !this.engOscC || !this.engFilter) return;
    const sn = Math.max(0, speedNorm);
    const thr = Math.max(0, Math.min(1.15, throttle));

    // Soft body: low triangle + sine harmonic — no harsh saw
    const base = 48 + sn * 85 + thr * 28;
    this.engOscA.frequency.setTargetAtTime(base, this.now(), 0.04);
    this.engOscB.frequency.setTargetAtTime(base * 2.01, this.now(), 0.04);
    this.engOscC.frequency.setTargetAtTime(base * 0.5, this.now(), 0.05);

    // Open filter gently with speed/throttle (never bright/screamy)
    const cutoff = 220 + thr * 160 + sn * 140 + (afterburner ? 90 : 0);
    this.engFilter.frequency.setTargetAtTime(cutoff, this.now(), 0.06);

    const body = 0.028 + thr * 0.055 + sn * 0.02;
    this.smoothGain(this.engGain, body, dt, 4.5);

    // Air whoosh
    if (this.whooshGain && this.whooshFilter) {
      const whoosh = 0.012 + sn * 0.045 + thr * 0.01;
      this.smoothGain(this.whooshGain, whoosh, dt, 3.5);
      this.whooshFilter.frequency.setTargetAtTime(280 + sn * 900, this.now(), 0.08);
    }

    // Afterburner: soft roar, not white-noise blast
    if (this.abGain && this.abFilter) {
      const ab = afterburner ? 0.07 + thr * 0.03 : 0;
      this.smoothGain(this.abGain, ab, dt, 5);
      this.abFilter.frequency.setTargetAtTime(afterburner ? 720 : 400, this.now(), 0.08);
    }
    if (this.propGain) this.smoothGain(this.propGain, 0, dt, 6);
  }

  private updatePiston(speedNorm: number, throttle: number, dt: number, rpm: number) {
    if (!this.engGain || !this.engOscA || !this.engOscB || !this.engOscC || !this.engFilter) return;
    const r = Math.max(0.08, Math.min(1.2, rpm));
    const base = 32 + r * 48 + speedNorm * 14;
    this.engOscA.frequency.setTargetAtTime(base, this.now(), 0.05);
    this.engOscB.frequency.setTargetAtTime(base * 1.5 + 3, this.now(), 0.05);
    this.engOscC.frequency.setTargetAtTime(base * 0.5, this.now(), 0.05);
    this.engFilter.frequency.setTargetAtTime(160 + r * 180 + throttle * 60, this.now(), 0.06);

    const body = 0.035 + throttle * 0.07 + r * 0.025;
    this.smoothGain(this.engGain, body, dt, 3.8);

    if (this.propGain && this.propFilter) {
      this.propFilter.frequency.setTargetAtTime(100 + r * 240, this.now(), 0.06);
      this.smoothGain(this.propGain, 0.03 + r * 0.07, dt, 4);
    }
    if (this.abGain) this.smoothGain(this.abGain, 0, dt, 6);
    if (this.whooshGain) {
      this.smoothGain(this.whooshGain, 0.01 + speedNorm * 0.025, dt, 3);
    }
  }

  // ── Graph build ─────────────────────────────────────────────────────────

  private buildEngineGraph(ctx: AudioContext) {
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 0.55;

    // Soft harmonic stack
    this.engOscA = ctx.createOscillator();
    this.engOscA.type = 'triangle';
    this.engOscA.frequency.value = 55;
    const gA = ctx.createGain();
    gA.gain.value = 0.55;

    this.engOscB = ctx.createOscillator();
    this.engOscB.type = 'sine';
    this.engOscB.frequency.value = 110;
    const gB = ctx.createGain();
    gB.gain.value = 0.22;

    this.engOscC = ctx.createOscillator();
    this.engOscC.type = 'sine';
    this.engOscC.frequency.value = 28;
    const gC = ctx.createGain();
    gC.gain.value = 0.35;

    this.engOscA.connect(gA);
    this.engOscB.connect(gB);
    this.engOscC.connect(gC);
    gA.connect(this.engFilter);
    gB.connect(this.engFilter);
    gC.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.bus());

    this.engOscA.start();
    this.engOscB.start();
    this.engOscC.start();

    // Air whoosh (soft pink-ish noise)
    this.whooshGain = ctx.createGain();
    this.whooshGain.gain.value = 0;
    this.whooshFilter = ctx.createBiquadFilter();
    this.whooshFilter.type = 'bandpass';
    this.whooshFilter.frequency.value = 400;
    this.whooshFilter.Q.value = 0.6;
    this.whooshSrc = ctx.createBufferSource();
    this.whooshSrc.buffer = this.softNoiseBuffer;
    this.whooshSrc.loop = true;
    this.whooshSrc.connect(this.whooshFilter);
    this.whooshFilter.connect(this.whooshGain);
    this.whooshGain.connect(this.bus());
    this.whooshSrc.start();

    // Afterburner
    this.abGain = ctx.createGain();
    this.abGain.gain.value = 0;
    this.abFilter = ctx.createBiquadFilter();
    this.abFilter.type = 'bandpass';
    this.abFilter.frequency.value = 700;
    this.abFilter.Q.value = 0.8;
    this.abSrc = ctx.createBufferSource();
    this.abSrc.buffer = this.noiseBuffer;
    this.abSrc.loop = true;
    this.abSrc.connect(this.abFilter);
    this.abFilter.connect(this.abGain);
    this.abGain.connect(this.bus());
    this.abSrc.start();

    // Prop blade noise
    this.propGain = ctx.createGain();
    this.propGain.gain.value = 0;
    this.propFilter = ctx.createBiquadFilter();
    this.propFilter.type = 'bandpass';
    this.propFilter.frequency.value = 160;
    this.propFilter.Q.value = 0.75;
    this.propSrc = ctx.createBufferSource();
    this.propSrc.buffer = this.softNoiseBuffer;
    this.propSrc.loop = true;
    this.propSrc.connect(this.propFilter);
    this.propFilter.connect(this.propGain);
    this.propGain.connect(this.bus());
    this.propSrc.start();
  }

  private buildLockTone(ctx: AudioContext) {
    this.lockGain = ctx.createGain();
    this.lockGain.gain.value = 0;
    this.lockOsc = ctx.createOscillator();
    this.lockOsc.type = 'sine';
    this.lockOsc.frequency.value = 800;
    this.lockOsc.connect(this.lockGain);
    this.lockGain.connect(this.bus());
    this.lockOsc.start();
  }

  private buildMenuAmbience(ctx: AudioContext) {
    this.menuAmbGain = ctx.createGain();
    this.menuAmbGain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;

    this.menuAmbOsc = ctx.createOscillator();
    this.menuAmbOsc.type = 'sine';
    this.menuAmbOsc.frequency.value = 55;
    this.menuAmbOsc2 = ctx.createOscillator();
    this.menuAmbOsc2.type = 'sine';
    this.menuAmbOsc2.frequency.value = 82.5; // fifth

    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.menuAmbOsc.connect(g1);
    this.menuAmbOsc2.connect(g2);
    g1.connect(f);
    g2.connect(f);
    f.connect(this.menuAmbGain);
    this.menuAmbGain.connect(this.bus());
    this.menuAmbOsc.start();
    this.menuAmbOsc2.start();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private bus(): AudioNode {
    return this.compressor ?? this.master!;
  }

  private ready(): boolean {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return !this.muted && !!this.master;
  }

  private now() {
    return this.ctx?.currentTime ?? 0;
  }

  private applyMuteGains() {
    if (this.muted) {
      this.fadeGain(this.engGain, 0, 0.05);
      this.fadeGain(this.whooshGain, 0, 0.05);
      this.fadeGain(this.abGain, 0, 0.05);
      this.fadeGain(this.propGain, 0, 0.05);
      this.fadeGain(this.lockGain, 0, 0.05);
      this.fadeGain(this.menuAmbGain, 0, 0.05);
    } else if (!this.gameplayActive) {
      this.fadeGain(this.menuAmbGain, 0.035, 0.3);
    }
  }

  private fadeGain(g: GainNode | null, value: number, timeConst: number) {
    if (!g || !this.ctx) return;
    g.gain.setTargetAtTime(value, this.now(), Math.max(0.01, timeConst / 3));
  }

  private smoothGain(g: GainNode, target: number, dt: number, rate: number) {
    const cur = g.gain.value;
    g.gain.value = cur + (target - cur) * Math.min(1, dt * rate);
  }

  private makeNoise(ctx: AudioContext, seconds: number, softness: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Simple lowpass for softer noise
      last = last + softness * 0.02 * (white - last);
      data[i] = last * 3.5;
    }
    return buf;
  }

  private tone(opts: {
    t: number;
    type: OscillatorType;
    freq: number;
    freqEnd: number;
    duration: number;
    gain: number;
  }) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opts.type;
    o.frequency.setValueAtTime(Math.max(20, opts.freq), opts.t);
    if (opts.freqEnd !== opts.freq) {
      o.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.freqEnd),
        opts.t + opts.duration
      );
    }
    g.gain.setValueAtTime(0.0001, opts.t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.gain), opts.t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, opts.t + opts.duration);
    o.connect(g);
    g.connect(this.bus());
    o.start(opts.t);
    o.stop(opts.t + opts.duration + 0.02);
  }

  private noiseBurst(opts: {
    t: number;
    duration: number;
    highpass: number;
    lowpassStart: number;
    lowpassEnd: number;
    gain: number;
    q: number;
    bandpass?: boolean;
  }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.softNoiseBuffer ?? this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = opts.highpass;
    const lp = this.ctx.createBiquadFilter();
    lp.type = opts.bandpass ? 'bandpass' : 'lowpass';
    lp.Q.value = opts.q;
    lp.frequency.setValueAtTime(Math.max(40, opts.lowpassStart), opts.t);
    lp.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.lowpassEnd),
      opts.t + opts.duration
    );
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, opts.t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.gain), opts.t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, opts.t + opts.duration);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.bus());
    src.start(opts.t);
    src.stop(opts.t + opts.duration + 0.02);
  }
}

/** Shared audio instance for Game + UI. */
export const gameAudio = new SoundManagerImpl();

/** Alias for existing Game imports. */
export class SoundManager {
  init() {
    gameAudio.init();
  }
  setEngineMode(mode: EngineType) {
    gameAudio.setEngineMode(mode);
  }
  setMuted(m: boolean) {
    gameAudio.setMuted(m);
  }
  setMasterVolume(v: number) {
    gameAudio.setMasterVolume(v);
  }
  get isMuted() {
    return gameAudio.isMuted;
  }
  get volume() {
    return gameAudio.volume;
  }
  setGameplayActive(active: boolean) {
    gameAudio.setGameplayActive(active);
  }
  updateEngine(
    speedNorm: number,
    throttle: number,
    afterburner: boolean,
    dt: number,
    rpm?: number
  ) {
    gameAudio.updateEngine(speedNorm, throttle, afterburner, dt, rpm);
  }
  cannonShot() {
    gameAudio.cannonShot();
  }
  missileLaunch() {
    gameAudio.missileLaunch();
  }
  flarePop() {
    gameAudio.flarePop();
  }
  explosion(big = false) {
    gameAudio.explosion(big);
  }
  killConfirm(kind: 'air' | 'ground' = 'air') {
    gameAudio.killConfirm(kind);
  }
  hitConfirm() {
    gameAudio.hitConfirm();
  }
  damageHit() {
    gameAudio.damageHit();
  }
  setLockTone(progress: number) {
    gameAudio.setLockTone(progress);
  }
  stallWarning(on: boolean) {
    gameAudio.stallWarning(on);
  }
  waveStart() {
    gameAudio.waveStart();
  }
  victory() {
    gameAudio.victory();
  }
  gameOver() {
    gameAudio.gameOver();
  }
  ui(kind: UiKind) {
    gameAudio.ui(kind);
  }
}

export type { UiKind };
