import type { GameSettings } from '../types/domain';

type SoundName = 'click' | 'confirm' | 'error' | 'build' | 'train' | 'attack' | 'horn' | 'tick' | 'victory' | 'defeat';

class AudioDirector {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private settings: GameSettings | null = null;
  private beat = 0;

  setSettings(settings: GameSettings) {
    this.settings = settings;
    if (!this.context || !this.musicGain || !this.effectsGain) return;
    const now = this.context.currentTime;
    this.musicGain.gain.setTargetAtTime(settings.muted ? 0 : settings.musicVolume * 0.16, now, 0.08);
    this.effectsGain.gain.setTargetAtTime(settings.muted ? 0 : settings.effectsVolume * 0.34, now, 0.04);
  }

  async unlock() {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.startMusic();
  }

  play(name: SoundName) {
    void this.unlock().then(() => {
      if (!this.context || !this.effectsGain || this.settings?.muted) return;
      const now = this.context.currentTime;
      switch (name) {
        case 'click':
          this.tone(220, 0.035, 'triangle', now, 0.2);
          this.tone(330, 0.04, 'sine', now + 0.018, 0.12);
          break;
        case 'confirm':
          this.tone(330, 0.08, 'triangle', now, 0.22);
          this.tone(495, 0.13, 'triangle', now + 0.07, 0.18);
          break;
        case 'error':
          this.tone(128, 0.18, 'sawtooth', now, 0.13);
          this.tone(102, 0.22, 'sawtooth', now + 0.08, 0.1);
          break;
        case 'build':
          this.noise(0.12, now, 0.15, 380);
          this.tone(92, 0.14, 'square', now + 0.04, 0.1);
          break;
        case 'train':
          this.tone(190, 0.06, 'square', now, 0.12);
          this.tone(285, 0.08, 'square', now + 0.06, 0.1);
          this.tone(380, 0.11, 'triangle', now + 0.12, 0.1);
          break;
        case 'attack':
          this.noise(0.16, now, 0.22, 900);
          this.tone(78, 0.25, 'sawtooth', now, 0.18);
          break;
        case 'horn':
          this.horn(now);
          break;
        case 'tick':
          this.tone(720, 0.055, 'sine', now, 0.16);
          break;
        case 'victory':
          [196, 247, 294, 392].forEach((frequency, index) => this.tone(frequency, 0.45, 'triangle', now + index * 0.16, 0.17));
          break;
        case 'defeat':
          [196, 165, 131, 98].forEach((frequency, index) => this.tone(frequency, 0.48, 'sawtooth', now + index * 0.18, 0.09));
          break;
      }
    });
  }

  stop() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    void this.context?.close();
    this.context = null;
    this.musicGain = null;
    this.effectsGain = null;
  }

  private createGraph() {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.musicGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.musicGain.connect(this.context.destination);
    this.effectsGain.connect(this.context.destination);
    if (this.settings) this.setSettings(this.settings);
  }

  private startMusic() {
    if (!this.context || this.musicTimer !== null) return;
    const playBeat = () => {
      if (!this.context || !this.musicGain || this.settings?.muted) return;
      const roots = [65.41, 73.42, 58.27, 49];
      const root = roots[Math.floor(this.beat / 8) % roots.length];
      const now = this.context.currentTime;
      this.musicTone(root, 1.5, 'triangle', now, 0.38);
      if (this.beat % 2 === 0) this.musicTone(root * 2, 0.42, 'sine', now + 0.02, 0.13);
      if (this.beat % 4 === 3) this.musicTone(root * 1.5, 0.32, 'triangle', now + 0.25, 0.1);
      this.beat += 1;
    };
    playBeat();
    this.musicTimer = window.setInterval(playBeat, 760);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, at: number, volume: number) {
    if (!this.context || !this.effectsGain) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(this.effectsGain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private musicTone(frequency: number, duration: number, type: OscillatorType, at: number, volume: number) {
    if (!this.context || !this.musicGain) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(filter).connect(gain).connect(this.musicGain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.04);
  }

  private horn(at: number) {
    if (!this.context || !this.effectsGain) return;
    [110, 165, 220].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const filter = this.context!.createBiquadFilter();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.linearRampToValueAtTime(frequency * 1.03, at + 0.75);
      filter.type = 'lowpass';
      filter.frequency.value = 760;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12 / (index + 1), at + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.15);
      oscillator.connect(filter).connect(gain).connect(this.effectsGain!);
      oscillator.start(at);
      oscillator.stop(at + 1.2);
    });
  }

  private noise(duration: number, at: number, volume: number, lowpass: number) {
    if (!this.context || !this.effectsGain) return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.effectsGain);
    source.start(at);
  }
}

export const audioDirector = new AudioDirector();
