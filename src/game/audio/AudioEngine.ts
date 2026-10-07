import type { AmbiencePreset } from '../environments/themes';

export type MusicIntensity = 0 | 1 | 2 | 3;
export type Sfx =
  | 'ui'
  | 'hover'
  | 'correct'
  | 'wrong'
  | 'notice'
  | 'treasure'
  | 'checkpoint'
  | 'tick'
  | 'lifeLost'
  | 'roar'
  | 'wings'
  | 'gate'
  | 'door'
  | 'portal'
  | 'whisper'
  | 'chime'
  | 'rumble'
  | 'magic'
  | 'victory'
  | 'gameOver';
export type Surface = 'stone' | 'grass' | 'snow' | 'gravel';

export interface Voice {
  pitch: number;
  speed: number;
  wave: OscillatorType;
  formant: number;
}

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/**
 * Everything audible is synthesised at runtime — no audio files, no licensing concerns.
 * Buses: master → (music | sfx | ambience) with a shared generated-impulse reverb.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8, muted: false };
  private ambienceStop: (() => void) | null = null;
  private music: MusicDirector | null = null;
  private suspendedByVisibility = false;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.ambBus = ctx.createGain();
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.8, 2.2);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.3;
      this.reverbSend.connect(this.reverb).connect(this.master);
      for (const b of [this.musicBus, this.sfxBus, this.ambBus]) b.connect(this.master);
      this.musicBus.connect(this.reverbSend);
      this.noise = this.makeNoise();
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(v: { master: number; music: number; sfx: number; muted: boolean }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.volumes.muted ? 0 : this.volumes.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.volumes.sfx * 0.6, t, 0.05);
  }

  /** Pause all audio when the tab is hidden. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden && this.ctx.state === 'running') {
      this.suspendedByVisibility = true;
      void this.ctx.suspend();
    } else if (!hidden && this.suspendedByVisibility) {
      this.suspendedByVisibility = false;
      void this.ctx.resume();
    }
  }

  setReverb(amount: number): void {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.5);
  }

  // ── Building blocks ──────────────────────────────────────────────────────────────────

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, release: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  private tone(freq: number, t: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; bus?: AudioNode; detune?: number; glideTo?: number; reverb?: number; pan?: number } = {}): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    this.env(g, t, opts.gain ?? 0.2, opts.attack ?? 0.005, dur);
    let node: AudioNode = o.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      node = node.connect(p);
    }
    node.connect(opts.bus ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      node.connect(s).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + (opts.attack ?? 0.005) + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; attack?: number; bus?: AudioNode; sweepTo?: number; reverb?: number; pan?: number; rate?: number } = {}): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, opts.gain ?? 0.2, opts.attack ?? 0.005, dur);
    let node: AudioNode = src.connect(f).connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      node = node.connect(p);
    }
    node.connect(opts.bus ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      node.connect(s).connect(this.reverb);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + (opts.attack ?? 0.005) + dur + 0.05);
  }

  // ── Sound effects ────────────────────────────────────────────────────────────────────

  play(name: Sfx, opts: { pan?: number; pitch?: number } = {}): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime + 0.01;
    const p = opts.pitch ?? 1;
    switch (name) {
      case 'ui':
        this.tone(900, t, 0.06, { type: 'triangle', gain: 0.08, glideTo: 640 });
        break;
      case 'hover':
        this.tone(1500, t, 0.03, { type: 'sine', gain: 0.025 });
        break;
      case 'correct':
        [72, 76, 79, 84].forEach((m, i) => this.tone(midiToHz(m), t + i * 0.09, 0.5, { type: 'triangle', gain: 0.14, reverb: 0.5 }));
        [96, 100].forEach((m, i) => this.tone(midiToHz(m), t + 0.3 + i * 0.06, 0.8, { type: 'sine', gain: 0.05, reverb: 0.8 }));
        break;
      case 'wrong':
        this.tone(midiToHz(64), t, 0.28, { type: 'triangle', gain: 0.12 });
        this.tone(midiToHz(59), t + 0.2, 0.5, { type: 'triangle', gain: 0.12, glideTo: midiToHz(57) });
        this.tone(110, t + 0.15, 0.5, { type: 'sine', gain: 0.08 });
        break;
      case 'notice':
        this.tone(520 * p, t, 0.12, { type: 'sine', gain: 0.08, glideTo: 820 * p });
        this.tone(820 * p, t + 0.12, 0.15, { type: 'sine', gain: 0.06, glideTo: 700 * p, reverb: 0.4 });
        break;
      case 'treasure':
        [84, 88, 91, 96, 100].forEach((m, i) => this.tone(midiToHz(m), t + i * 0.05, 0.4, { type: 'sine', gain: 0.07, reverb: 0.6 }));
        this.noiseBurst(t, 0.5, { type: 'highpass', freq: 6000, gain: 0.03, reverb: 0.5 });
        break;
      case 'checkpoint':
        [60, 64, 67, 72].forEach((m) => this.tone(midiToHz(m), t, 1.6, { type: 'triangle', gain: 0.06, attack: 0.25, reverb: 0.6 }));
        break;
      case 'tick':
        this.tone(1800, t, 0.03, { type: 'square', gain: 0.03 });
        break;
      case 'lifeLost':
        this.noiseBurst(t, 1.6, { type: 'lowpass', freq: 3000, sweepTo: 120, gain: 0.3, attack: 0.4, reverb: 0.6 });
        this.tone(70, t + 0.4, 2.2, { type: 'sine', gain: 0.35, glideTo: 35 });
        [62, 58, 55].forEach((m, i) => this.tone(midiToHz(m), t + 0.5 + i * 0.35, 0.9, { type: 'triangle', gain: 0.07, reverb: 0.7 }));
        break;
      case 'roar':
        this.noiseBurst(t, 2.2, { type: 'lowpass', freq: 500, sweepTo: 180, gain: 0.25, attack: 0.3, reverb: 0.9 });
        this.tone(95, t, 2.0, { type: 'sawtooth', gain: 0.06, glideTo: 60, attack: 0.3, reverb: 0.9 });
        break;
      case 'wings':
        for (let i = 0; i < 4; i++) this.noiseBurst(t + i * 0.42, 0.35, { type: 'bandpass', freq: 380, q: 0.8, gain: 0.18, attack: 0.12, reverb: 0.5, pan: -0.6 + i * 0.4 });
        break;
      case 'gate':
        this.tone(55, t, 1.0, { type: 'sine', gain: 0.4, glideTo: 40 });
        this.noiseBurst(t, 0.6, { type: 'lowpass', freq: 400, gain: 0.3, reverb: 0.7 });
        for (let i = 0; i < 6; i++) this.tone(1200 + Math.random() * 800, t + 0.05 + i * 0.04, 0.12, { type: 'square', gain: 0.012 });
        break;
      case 'door':
        this.noiseBurst(t, 1.6, { type: 'bandpass', freq: 260, sweepTo: 520, q: 6, gain: 0.08, attack: 0.3, reverb: 0.5 });
        break;
      case 'portal':
        this.tone(midiToHz(60), t, 3, { type: 'sine', gain: 0.1, attack: 1, glideTo: midiToHz(72), reverb: 0.8 });
        this.tone(midiToHz(67), t + 0.3, 3, { type: 'triangle', gain: 0.05, attack: 1, glideTo: midiToHz(79), reverb: 0.8 });
        break;
      case 'whisper':
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.18 + Math.random() * 0.1, 0.2, { type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 8, gain: 0.05, reverb: 0.8, pan: Math.random() * 2 - 1 });
        break;
      case 'chime':
        [88, 95, 91].forEach((m, i) => this.tone(midiToHz(m), t + i * 0.25, 2.5, { type: 'sine', gain: 0.04, reverb: 1, pan: 0.5 - i * 0.4 }));
        break;
      case 'rumble':
        this.noiseBurst(t, 2.5, { type: 'lowpass', freq: 140, gain: 0.35, attack: 0.6, reverb: 0.4, rate: 0.5 });
        break;
      case 'magic':
        for (let i = 0; i < 8; i++) this.tone(midiToHz(79 + ((i * 5) % 17)), t + i * 0.06, 0.6, { type: 'sine', gain: 0.04, reverb: 0.8 });
        break;
      case 'victory':
        this.music?.stinger('victory');
        break;
      case 'gameOver':
        this.music?.stinger('gameOver');
        break;
    }
  }

  footstep(surface: Surface): void {
    if (!this.ready) return;
    const t = (this.ctx as AudioContext).currentTime + 0.005;
    const v = 0.85 + Math.random() * 0.3;
    if (surface === 'stone') {
      this.noiseBurst(t, 0.07, { type: 'lowpass', freq: 1400 * v, gain: 0.16, reverb: 0.25 });
      this.tone(90 * v, t, 0.06, { type: 'sine', gain: 0.08 });
    } else if (surface === 'grass') {
      this.noiseBurst(t, 0.12, { type: 'bandpass', freq: 2600 * v, q: 0.6, gain: 0.07 });
    } else if (surface === 'snow') {
      this.noiseBurst(t, 0.14, { type: 'bandpass', freq: 1800 * v, q: 1.5, gain: 0.1, rate: 0.6 });
    } else {
      this.noiseBurst(t, 0.09, { type: 'bandpass', freq: 900 * v, q: 0.8, gain: 0.12 });
    }
  }

  /** Charming creature "babble" synced to dialogue length. */
  speak(voice: Voice, seconds: number): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime + 0.02;
    const syllables = Math.min(40, Math.max(3, Math.round(seconds * voice.speed * 0.6)));
    let t = t0;
    for (let i = 0; i < syllables; i++) {
      const dur = (0.6 + Math.random() * 0.8) / voice.speed;
      const f = voice.pitch * (0.8 + Math.random() * 0.5);
      const o = ctx.createOscillator();
      o.type = voice.wave;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (0.85 + Math.random() * 0.35), t + dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = voice.formant * (0.8 + Math.random() * 0.5);
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      this.env(g, t, voice.wave === 'sine' ? 0.12 : 0.09, 0.015, dur * 0.9);
      o.connect(bp).connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
      t += dur + (Math.random() < 0.15 ? 0.12 : 0.02);
    }
  }

  // ── Ambience ─────────────────────────────────────────────────────────────────────────

  startAmbience(preset: AmbiencePreset): void {
    this.stopAmbience();
    if (!this.ctx) return;
    this.ambienceStop = startAmbience(this.ctx, this.ambBus, this.reverb, this.noise, preset, (fn) => {
      if (this.ready) fn();
    });
  }

  /** A second ambience bed that fades in as the player crosses into another biome. */
  private ambSecond: { preset: AmbiencePreset; gain: GainNode; stop: () => void } | null = null;
  private ambFirstGain: GainNode | null = null;

  /**
   * Crossfades between two biome soundscapes: `k` = 0 plays only `a`, 1 only `b`.
   * Call `startAmbienceMix` once per run, then `setAmbienceMix` as the player moves.
   */
  startAmbienceMix(a: AmbiencePreset, b: AmbiencePreset): void {
    this.stopAmbience();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const guard = (fn: () => void): void => {
      if (this.ready) fn();
    };
    const ga = ctx.createGain();
    ga.connect(this.ambBus);
    const stopA = startAmbience(ctx, ga, this.reverb, this.noise, a, guard);
    this.ambFirstGain = ga;
    if (b !== a) {
      const gb = ctx.createGain();
      gb.gain.value = 0;
      gb.connect(this.ambBus);
      const stopB = startAmbience(ctx, gb, this.reverb, this.noise, b, guard);
      this.ambSecond = { preset: b, gain: gb, stop: stopB };
    }
    this.ambienceStop = () => {
      stopA();
      this.ambSecond?.stop();
      this.ambSecond = null;
      this.ambFirstGain = null;
    };
  }

  setAmbienceMix(k: number): void {
    if (!this.ctx || !this.ambFirstGain) return;
    const t = this.ctx.currentTime;
    // Equal-power crossfade.
    this.ambFirstGain.gain.setTargetAtTime(Math.cos((k * Math.PI) / 2), t, 0.6);
    this.ambSecond?.gain.gain.setTargetAtTime(Math.sin((k * Math.PI) / 2), t, 0.6);
  }

  stopAmbience(): void {
    this.ambienceStop?.();
    this.ambienceStop = null;
  }

  // ── Music ────────────────────────────────────────────────────────────────────────────

  startMusic(mode: number[], root: number): void {
    if (!this.ctx) return;
    this.music?.stop();
    this.music = new MusicDirector(this.ctx, this.musicBus, this.reverb, this.noise, mode, root);
    this.music.start();
  }

  setMusicIntensity(level: MusicIntensity): void {
    this.music?.setIntensity(level);
  }

  stopMusic(fade = 1.5): void {
    this.music?.stop(fade);
    this.music = null;
  }

  stingerOnly(kind: 'victory' | 'gameOver'): void {
    if (!this.ctx) return;
    const md = this.music ?? new MusicDirector(this.ctx, this.musicBus, this.reverb, this.noise, [0, 2, 4, 5, 7, 9, 11], 60);
    md.stinger(kind);
  }
}

// ── Ambience generators ──────────────────────────────────────────────────────────────────

function startAmbience(
  ctx: AudioContext,
  bus: GainNode,
  reverb: ConvolverNode,
  noise: AudioBuffer,
  preset: AmbiencePreset,
  guard: (fn: () => void) => void,
): () => void {
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  out.connect(bus);
  const wet = ctx.createGain();
  wet.gain.value = 0.6;
  out.connect(wet).connect(reverb);

  const loopNoise = (type: BiquadFilterType, freq: number, q: number, gain: number, lfoRate = 0.07, lfoDepth = 0.4): void => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain * lfoDepth;
    lfo.connect(lfoGain).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = lfoRate * 0.73;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = freq * 0.3;
    lfo2.connect(lfo2Gain).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    lfo2.start();
    nodes.push(src, lfo, lfo2);
  };
  const drone = (freq: number, gain: number, type: OscillatorType = 'sine'): void => {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = gain;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      o.connect(f).connect(g).connect(out);
      o.start();
      nodes.push(o);
    }
  };
  const every = (minS: number, maxS: number, fn: () => void): void => {
    const schedule = (): void => {
      const id = window.setTimeout(
        () => {
          guard(fn);
          schedule();
        },
        (minS + Math.random() * (maxS - minS)) * 1000,
      );
      timers.push(id);
    };
    schedule();
  };
  const blip = (freq: number, dur: number, gain: number, type: OscillatorType = 'sine', glide = 0.5): void => {
    const t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    o.connect(g).connect(p).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const crackle = (gain: number): void => {
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500 + Math.random() * 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.1);
  };
  const bell = (freq: number, gain: number): void => {
    for (const [mult, gm] of [
      [1, 1],
      [2.76, 0.4],
      [5.4, 0.2],
    ] as const) {
      const t = ctx.currentTime + 0.01;
      const o = ctx.createOscillator();
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * gm, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 4.1);
    }
  };

  switch (preset) {
    case 'ruins':
      loopNoise('bandpass', 420, 0.6, 0.09);
      every(0.5, 2.5, () => blip(4200 + Math.random() * 800, 0.05, 0.012, 'sine', 0.9));
      every(0.05, 0.4, () => crackle(0.012));
      every(14, 30, () => blip(380, 0.5, 0.03, 'sine', 0.85));
      break;
    case 'cave':
      loopNoise('lowpass', 140, 0.5, 0.12, 0.05, 0.3);
      drone(55, 0.02);
      every(0.8, 3.5, () => blip(1400 + Math.random() * 1400, 0.12, 0.05, 'sine', 0.4));
      every(10, 22, () => bell(1300 + Math.random() * 900, 0.015));
      break;
    case 'forest':
      loopNoise('highpass', 2200, 0.4, 0.035, 0.12, 0.6);
      every(0.15, 0.6, () => {
        for (let i = 0; i < 3; i++) window.setTimeout(() => guard(() => blip(4600, 0.035, 0.012, 'sine', 1)), i * 60);
      });
      every(12, 26, () => {
        blip(420, 0.45, 0.035, 'sine', 0.9);
        window.setTimeout(() => guard(() => blip(380, 0.6, 0.03, 'sine', 0.85)), 550);
      });
      break;
    case 'temple':
      drone(65.4, 0.025, 'triangle');
      drone(98, 0.012);
      loopNoise('bandpass', 300, 0.8, 0.04);
      every(0.06, 0.35, () => crackle(0.014));
      every(15, 35, () => bell(392, 0.02));
      break;
    case 'lava':
      loopNoise('lowpass', 90, 0.7, 0.2, 0.04, 0.4);
      every(0.3, 1.4, () => blip(90 + Math.random() * 120, 0.18, 0.06, 'sine', 0.6));
      every(0.04, 0.25, () => crackle(0.016));
      break;
    case 'ice':
      loopNoise('bandpass', 900, 0.5, 0.08, 0.09, 0.6);
      every(2, 6, () => bell(1800 + Math.random() * 1600, 0.01));
      break;
    case 'mystic':
      drone(73.4, 0.02);
      drone(110, 0.012);
      loopNoise('bandpass', 1600, 6, 0.025, 0.2, 0.9);
      every(6, 14, () => bell(880 * (Math.random() < 0.5 ? 1 : 1.5), 0.012));
      break;
    case 'castle':
      loopNoise('bandpass', 380, 0.6, 0.1, 0.06, 0.5);
      every(0.08, 0.5, () => crackle(0.01));
      every(25, 45, () => bell(196, 0.03));
      break;
  }

  return () => {
    for (const id of timers) clearTimeout(id);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      out.disconnect();
    }, 1500);
  };
}

// ── Generative score ───────────────────────────────────────────────────────────────────

class MusicDirector {
  private readonly out: GainNode;
  private intensity: MusicIntensity = 0;
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private lastNote = 0;
  private stopped = false;
  private readonly progression = [0, 5, 3, 4];

  constructor(
    private readonly ctx: AudioContext,
    bus: GainNode,
    reverb: ConvolverNode,
    private readonly noise: AudioBuffer,
    private readonly mode: number[],
    private readonly root: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.out.connect(wet).connect(reverb);
  }

  start(): void {
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 2);
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  stop(fade = 1.5): void {
    this.stopped = true;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    window.setTimeout(() => this.out.disconnect(), fade * 1000 + 500);
  }

  setIntensity(level: MusicIntensity): void {
    this.intensity = level;
  }

  private get tempo(): number {
    return [64, 70, 84, 104][this.intensity] as number;
  }

  private degreeToMidi(deg: number, octave = 0): number {
    const n = this.mode.length;
    const o = Math.floor(deg / n);
    const d = ((deg % n) + n) % n;
    return this.root + (this.mode[d] as number) + 12 * (o + octave);
  }

  private schedule(): void {
    if (this.stopped) return;
    const ahead = this.ctx.currentTime + 0.25;
    while (this.nextBeat < ahead) {
      this.playBeat(this.nextBeat, this.beat);
      const sixteenth = 60 / this.tempo / 4;
      this.nextBeat += sixteenth;
      this.beat++;
    }
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, gain: number, attack: number, cutoff: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + attack);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + attack + 0.1);
  }

  private playBeat(t: number, step: number): void {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chordDeg = this.progression[bar % this.progression.length] as number;
    const i = this.intensity;
    const barDur = (60 / this.tempo) * 4;
    if (inBar === 0) {
      // Pad: chord tones, soft and wide.
      for (const [k, det] of [
        [0, -6],
        [2, 5],
        [4, -3],
      ] as const) {
        const f = midiToHz(this.degreeToMidi(chordDeg + k, 0));
        this.voice(f, t, barDur, 'sawtooth', 0.022, 1.2, 500 + i * 350);
        this.voice(f * 1.003 + det * 0.01, t, barDur, 'triangle', 0.02, 1.2, 1200);
      }
      // Bass drone.
      this.voice(midiToHz(this.degreeToMidi(chordDeg, -1)), t, barDur, 'sine', 0.07, 0.4, 400);
    }
    // Melody: sparse when exploring, denser with tension.
    const density = [0.16, 0.26, 0.36, 0.5][i] as number;
    if (inBar % 2 === 0 && Math.random() < density) {
      const chordTones = [chordDeg, chordDeg + 2, chordDeg + 4, chordDeg + 7];
      let deg = Math.random() < 0.6 ? (chordTones[Math.floor(Math.random() * chordTones.length)] as number) : this.lastNote + (Math.random() < 0.5 ? 1 : -1);
      if (Math.abs(deg - this.lastNote) > 5) deg = this.lastNote + Math.sign(deg - this.lastNote) * 2;
      this.lastNote = deg;
      const f = midiToHz(this.degreeToMidi(deg, 1));
      this.voice(f, t, 0.35, 'triangle', 0.05, 0.01, 2500);
      // Echo.
      this.voice(f, t + (60 / this.tempo) * 0.75, 0.3, 'sine', 0.018, 0.01, 2000);
    }
    // Mysterious bell (creature encounters).
    if (i === 1 && inBar === 8 && Math.random() < 0.6) {
      this.voice(midiToHz(this.degreeToMidi(chordDeg + 7, 1)), t, 1.5, 'sine', 0.03, 0.005, 5000);
    }
    // Percussion for tension.
    if (i >= 2 && (inBar === 0 || inBar === 8 || (i === 3 && inBar % 4 === 0))) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i === 3 ? 0.22 : 0.15, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.35);
    }
    if (i === 3 && inBar % 2 === 1) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f).connect(g).connect(this.out);
      src.start(t, Math.random());
      src.stop(t + 0.06);
    }
  }

  stinger(kind: 'victory' | 'gameOver'): void {
    const t = this.ctx.currentTime + 0.05;
    if (kind === 'victory') {
      const notes = [60, 64, 67, 72, 76, 79, 84];
      notes.forEach((m, k) => {
        this.voice(midiToHz(m), t + k * 0.11, 1.2 - k * 0.05, 'sawtooth', 0.05, 0.02, 2600);
        this.voice(midiToHz(m), t + k * 0.11, 1.4, 'triangle', 0.05, 0.02, 4000);
      });
      for (const m of [48, 60, 64, 67, 72]) this.voice(midiToHz(m), t + 0.9, 3.5, 'triangle', 0.05, 0.3, 3000);
    } else {
      const notes = [67, 63, 60, 55];
      notes.forEach((m, k) => this.voice(midiToHz(m), t + k * 0.45, 1.2, 'triangle', 0.06, 0.05, 1800));
      for (const m of [43, 55, 58, 62]) this.voice(midiToHz(m), t + 1.8, 3.5, 'sawtooth', 0.025, 0.4, 900);
    }
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
  }
}

export const audio = new AudioEngine();
