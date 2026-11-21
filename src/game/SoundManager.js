import { AUDIO_ASSETS } from '../audioConfig.js';

// F3, G3, A3, C4, D4, F4, G4, A4: a warm, consonant pentatonic palette.
const AMBIENT_SCALE = [174.614, 195.998, 220, 261.626, 293.665, 349.228, 391.995, 440];
const PAD_CHORDS = [[0, 2, 3], [3, 4, 6], [1, 3, 5], [2, 3, 5]];
const randomBetween = (min, max) => min + Math.random() * (max - min);

export class SoundManager {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.context = null;
    this.master = null;
    this.music = null;
    this.media = new Set();
    this.unlocked = false;
    this.disposed = false;
    this.lastPlayed = new Map();
    this.handleInteraction = () => { void this.unlock(); };
    this.handleVisibility = () => {
      if (document.hidden) {
        this.music?.pause?.();
        this.pauseProceduralMusic();
        void this.context?.suspend().catch(() => {});
      } else if (this.unlocked) {
        void this.unlock();
      }
    };
    document.addEventListener('pointerdown', this.handleInteraction, { capture: true });
    document.addEventListener('touchstart', this.handleInteraction, { capture: true, passive: true });
    document.addEventListener('keydown', this.handleInteraction, { capture: true });
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  async unlock() {
    if (this.disposed) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!this.context) {
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.7;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      if (this.disposed) return;
      this.unlocked = this.context.state === 'running';
      if (!this.unlocked) return;
      if (!this.muted && !document.hidden) {
        this.startMusic();
        this.scheduleProceduralMusic();
        if (this.music instanceof HTMLAudioElement) void this.music.play().catch(() => {});
      }
    } catch { /* Audio support is optional; gameplay continues normally. */ }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.context.currentTime, 0.025);
    for (const audio of this.media) audio.muted = this.muted;
    if (this.music instanceof HTMLAudioElement) {
      if (this.muted) this.music.pause();
      else if (this.unlocked) void this.music.play().catch(() => {});
    } else if (this.muted) this.pauseProceduralMusic();
    else void this.unlock();
  }

  get ctx() { return this.context; }
  get isMuted() { return this.muted; }

  startMusic() {
    if (this.music || this.disposed || this.muted) return;
    if (AUDIO_ASSETS.bgm) {
      const audio = new Audio(AUDIO_ASSETS.bgm);
      audio.loop = true;
      audio.volume = 0.17;
      audio.muted = this.muted;
      this.media.add(audio);
      this.music = audio;
      audio.addEventListener('error', () => {
        audio.pause();
        this.media.delete(audio);
        if (this.disposed) return;
        this.music = null;
        this.startProceduralMusic();
      }, { once: true });
      if (!this.muted) void audio.play().catch(() => {});
    } else this.startProceduralMusic();
  }

  startProceduralMusic() {
    if (this.music || !this.context || this.disposed || this.muted) return;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 750;
    filter.Q.value = 0.45;
    filter.connect(this.master);
    this.music = {
      kind: 'ambient', filter, voices: new Set(), timer: null,
      nextNoteTime: this.context.currentTime + 0.03,
      nextPadTime: this.context.currentTime + randomBetween(2, 5),
      lastNoteIndex: -1, lastChordIndex: -1,
    };
    this.scheduleProceduralMusic();
  }

  ambientVoice(music, frequency, start, pad = false) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const hold = pad ? randomBetween(4, 6) : randomBetween(0.15, 0.55);
    const peak = pad ? randomBetween(0.008, 0.012) : randomBetween(0.06, 0.08);
    const attack = 0.4;
    const release = 2.2;
    oscillator.type = pad || Math.random() < 0.7 ? 'sine' : 'triangle';
    oscillator.frequency.value = frequency;
    pan.pan.value = randomBetween(-0.4, 0.4);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.setValueAtTime(peak, start + attack + hold);
    envelope.gain.linearRampToValueAtTime(0, start + attack + hold + release);
    oscillator.connect(envelope);
    envelope.connect(pan);
    pan.connect(music.filter);
    const voice = { oscillator, envelope, pan };
    music.voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect(); envelope.disconnect(); pan.disconnect();
      music.voices.delete(voice);
    };
    oscillator.start(start);
    oscillator.stop(start + attack + hold + release + 0.02);
  }

  scheduleProceduralMusic() {
    const music = this.music;
    if (music?.kind !== 'ambient' || music.timer !== null || this.disposed
      || this.muted || document.hidden || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Schedule a short distance ahead on the audio clock; never catch up missed notes in a burst.
    music.nextNoteTime = Math.max(music.nextNoteTime, now + 0.05);
    music.nextPadTime = Math.max(music.nextPadTime, now + 0.05);
    if (music.nextNoteTime <= now + 0.3) {
      let index = Math.floor(Math.random() * AMBIENT_SCALE.length);
      if (index === music.lastNoteIndex) index = (index + 1 + Math.floor(Math.random() * 7)) % AMBIENT_SCALE.length;
      this.ambientVoice(music, AMBIENT_SCALE[index], music.nextNoteTime);
      music.lastNoteIndex = index;
      music.nextNoteTime += randomBetween(1.5, 3.5);
    }
    if (music.nextPadTime <= now + 0.3) {
      const index = (music.lastChordIndex + 1 + Math.floor(Math.random() * (PAD_CHORDS.length - 1))) % PAD_CHORDS.length;
      for (const note of PAD_CHORDS[index]) this.ambientVoice(music, AMBIENT_SCALE[note], music.nextPadTime, true);
      music.lastChordIndex = index;
      music.nextPadTime += randomBetween(11, 18);
    }
    music.timer = window.setTimeout(() => {
      music.timer = null;
      this.scheduleProceduralMusic();
    }, 250);
  }

  pauseProceduralMusic() {
    if (this.music?.kind !== 'ambient') return;
    window.clearTimeout(this.music.timer);
    this.music.timer = null;
  }

  stopProceduralMusic() {
    if (this.music?.kind !== 'ambient') return;
    this.pauseProceduralMusic();
    for (const { oscillator, envelope, pan } of this.music.voices) {
      oscillator.onended = null;
      oscillator.stop();
      oscillator.disconnect(); envelope.disconnect(); pan.disconnect();
    }
    this.music.voices.clear();
    this.music.filter.disconnect();
    this.music = null;
  }

  tone(frequency, delay, duration, volume = 0.045, type = 'sine', endFrequency = frequency) {
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  synthesize(name) {
    if (!this.context || this.muted) return;
    const melodies = {
      mergeLow: [523.25, 659.25], mergeHigh: [523.25, 659.25, 783.99, 1046.5],
      powerup: [440, 659.25, 880], themeUnlock: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      gameOver: [659.25, 523.25, 392],
    };
    if (name === 'move') { this.tone(210, 0, 0.12, 0.018, 'sine', 125); return; }
    const notes = melodies[name] ?? melodies.mergeLow;
    const pace = name === 'gameOver' ? 0.18 : name === 'themeUnlock' ? 0.12 : 0.065;
    notes.forEach((frequency, index) => this.tone(frequency, index * pace,
      name === 'themeUnlock' || name === 'gameOver' ? 0.5 : 0.23, 0.035));
  }

  play(name) {
    if (!this.context || this.muted || document.hidden || name === 'bgm') return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 65) return;
    this.lastPlayed.set(name, now);
    if (!AUDIO_ASSETS[name]) { this.synthesize(name); return; }
    const audio = new Audio(AUDIO_ASSETS[name]);
    audio.volume = 0.4;
    this.media.add(audio);
    const cleanup = () => this.media.delete(audio);
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    void audio.play().catch(() => { cleanup(); this.synthesize(name); });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('pointerdown', this.handleInteraction, { capture: true });
    document.removeEventListener('touchstart', this.handleInteraction, { capture: true });
    document.removeEventListener('keydown', this.handleInteraction, { capture: true });
    document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const audio of this.media) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    this.stopProceduralMusic();
    void this.context?.close().catch(() => {});
  }
}
