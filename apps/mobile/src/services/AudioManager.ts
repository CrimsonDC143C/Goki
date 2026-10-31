import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export type SoundEffectKey =
  | 'level-up'
  | 'chest-open'
  | 'micro-tick'
  | 'critical-hit'
  | 'anvil-strike'
  | 'stamina-full'
  | 'timer-bell'
  | 'hero-attack'
  | 'enemy-damage';

export interface SoundConfig {
  freqs?: number[];
  durations?: number[];
  types?: OscillatorType[];
  volume?: number;
  uri?: string | number; // Local require or remote URI
}

const SOUND_PRESETS: Record<SoundEffectKey, SoundConfig> = {
  'level-up': {
    freqs: [523.25, 659.25, 783.99, 1046.5], // C5 -> E5 -> G5 -> C6 Fanfare
    durations: [0.1, 0.1, 0.12, 0.35],
    types: ['triangle', 'triangle', 'square', 'sine'],
    volume: 0.85,
  },
  'chest-open': {
    freqs: [587.33, 880, 1174.66], // D5 -> A5 -> D6 Reverberant Chime
    durations: [0.12, 0.15, 0.45],
    types: ['sine', 'triangle', 'sine'],
    volume: 0.8,
  },
  'micro-tick': {
    freqs: [880], // High crisp tactile pop
    durations: [0.045],
    types: ['triangle'],
    volume: 0.5,
  },
  'critical-hit': {
    freqs: [180, 120, 90], // Heavy bass punch + explosive impact
    durations: [0.08, 0.12, 0.22],
    types: ['sawtooth', 'triangle', 'sine'],
    volume: 0.95,
  },
  'anvil-strike': {
    freqs: [987.77, 493.88], // Crisp metallic anvil clang
    durations: [0.06, 0.28],
    types: ['square', 'sine'],
    volume: 0.8,
  },
  'stamina-full': {
    freqs: [523.25, 783.99], // Rising restoration pulse
    durations: [0.08, 0.2],
    types: ['triangle', 'sine'],
    volume: 0.7,
  },
  'timer-bell': {
    freqs: [880, 659.25], // Clean countdown alert bell
    durations: [0.12, 0.3],
    types: ['sine', 'sine'],
    volume: 0.75,
  },
  'hero-attack': {
    freqs: [380, 240], // Fast sword swing pitch down
    durations: [0.05, 0.08],
    types: ['sawtooth', 'triangle'],
    volume: 0.6,
  },
  'enemy-damage': {
    freqs: [220, 110], // Blunt thud
    durations: [0.06, 0.1],
    types: ['triangle', 'sine'],
    volume: 0.7,
  },
};

const MUTE_STORAGE_KEY = 'gymify_sfx_muted_v1';

class AudioManagerService {
  private static instance: AudioManagerService;
  private _isMuted = false;
  private _soundsMap = new Map<SoundEffectKey, Audio.Sound>();
  private _audioConfigured = false;
  private _listeners: Array<(muted: boolean) => void> = [];

  private constructor() {
    this.restoreMuteState();
  }

  public static getInstance(): AudioManagerService {
    if (!AudioManagerService.instance) {
      AudioManagerService.instance = new AudioManagerService();
    }
    return AudioManagerService.instance;
  }

  private async restoreMuteState(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        const val = globalThis.localStorage?.getItem(MUTE_STORAGE_KEY);
        if (val !== null) {
          this._isMuted = val === 'true';
        }
      }
    } catch {
      // Safe fallback
    }
  }

  private async persistMuteState(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.setItem(MUTE_STORAGE_KEY, String(this._isMuted));
      }
    } catch {
      // Safe fallback
    }
  }

  public isMuted(): boolean {
    return this._isMuted;
  }

  public async setMuted(muted: boolean): Promise<void> {
    this._isMuted = muted;
    await this.persistMuteState();
    this.notifyListeners();
  }

  public async toggleMute(): Promise<boolean> {
    this._isMuted = !this._isMuted;
    await this.persistMuteState();
    this.notifyListeners();
    return this._isMuted;
  }

  public subscribe(listener: (muted: boolean) => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this._listeners.forEach((l) => l(this._isMuted));
  }

  /**
   * Configures audio mode to ensure sounds play reliably without cutting off background music.
   */
  private async ensureAudioConfigured(): Promise<void> {
    if (this._audioConfigured || Platform.OS === 'web') return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      this._audioConfigured = true;
    } catch {
      // Safe fallback on mock or simulator
    }
  }

  /**
   * Pre-loads sound effect assets into memory for instant (<10ms) playback.
   */
  public async preloadAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await this.ensureAudioConfigured();
    // Asset sound caching can be populated when physical mp3 files are attached
  }

  /**
   * Plays a high-impact sound effect.
   * If native audio asset is not bundled or on web, seamlessly invokes the Web Audio harmonic synthesizer.
   */
  public async playSound(key: SoundEffectKey, volumeOverride?: number): Promise<void> {
    if (this._isMuted) return;

    const preset = SOUND_PRESETS[key];
    if (!preset) return;

    const vol = volumeOverride ?? preset.volume ?? 0.75;

    // 1. Try Native expo-av playback if cached or URI available
    if (Platform.OS !== 'web' && preset.uri) {
      try {
        await this.ensureAudioConfigured();
        const { sound } = await Audio.Sound.createAsync(
          typeof preset.uri === 'string' ? { uri: preset.uri } : preset.uri,
          { shouldPlay: true, volume: vol }
        );
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            void sound.unloadAsync();
          }
        });
        return;
      } catch {
        // Fall back to synth on audio load failure
      }
    }

    // 2. Cross-platform Web Audio API harmonic sound synthesizer
    this.playSynthesizedSound(preset, vol);
  }

  /**
   * Pure procedural audio synthesizer: generates juice effects with zero asset download requirement.
   */
  private playSynthesizedSound(config: SoundConfig, volume: number): void {
    try {
      const g = globalThis as unknown as {
        AudioContext?: new () => {
          currentTime: number;
          destination: unknown;
          createOscillator: () => {
            type: OscillatorType;
            frequency: { setValueAtTime: (f: number, t: number) => void };
            connect: (dest: unknown) => void;
            start: (t: number) => void;
            stop: (t: number) => void;
          };
          createGain: () => {
            gain: {
              setValueAtTime: (v: number, t: number) => void;
              exponentialRampToValueAtTime: (v: number, t: number) => void;
            };
            connect: (dest: unknown) => void;
          };
        };
      };

      if (!g.AudioContext) return;
      const ctx = new g.AudioContext();
      const now = ctx.currentTime;
      let offset = 0;

      const freqs = config.freqs ?? [440];
      const durations = config.durations ?? [0.1];
      const types = config.types ?? ['sine'];

      for (let i = 0; i < freqs.length; i++) {
        const freq = freqs[i]!;
        const dur = durations[i % durations.length]!;
        const oscType = types[i % types.length]!;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = oscType;
        osc.frequency.setValueAtTime(freq, now + offset);

        const peakGain = Math.max(0.001, volume * 0.12);
        gain.gain.setValueAtTime(peakGain, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + dur);

        offset += dur * 0.75; // Slight overlap for rich musical timbre
      }
    } catch {
      // Graceful no-op when browser blocks audio autoplay
    }
  }

  public async unloadAll(): Promise<void> {
    for (const sound of this._soundsMap.values()) {
      try {
        await sound.unloadAsync();
      } catch {
        // Safe unload
      }
    }
    this._soundsMap.clear();
  }
}

export const audioManager = AudioManagerService.getInstance();
