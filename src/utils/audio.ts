// src/utils/audio.ts
// Procedural Web Audio API sound synthesizer (zero external audio files required).

const MUTE_KEY = 'monopoly_web_sfx_muted';

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  constructor() {
    try {
      this.isMuted = localStorage.getItem(MUTE_KEY) === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private getCtx(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // ignore
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.2,
    delay = 0
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playTick(): void {
    this.tone(720, 460, 0.045, 'triangle', 0.14);
  }

  public playPing(): void {
    this.tone(880, 1320, 0.12, 'sine', 0.16);
    this.tone(1320, 1760, 0.18, 'sine', 0.12, 0.08);
  }

  public playCard(): void {
    this.tone(190, 90, 0.08, 'sine', 0.22);
  }

  public playDraw(): void {
    this.tone(360, 580, 0.09, 'triangle', 0.14);
  }

  public playMoney(): void {
    this.tone(1046, 1046, 0.08, 'sine', 0.14, 0);
    this.tone(1318, 1318, 0.1, 'sine', 0.15, 0.06);
    this.tone(1568, 1568, 0.18, 'triangle', 0.14, 0.12);
  }

  public playUpgrade(): void {
    const notes = [440, 554, 659, 880];
    notes.forEach((n, idx) => {
      this.tone(n, n, 0.12, 'triangle', 0.15, idx * 0.06);
    });
  }

  public playJail(): void {
    this.tone(240, 90, 0.25, 'sawtooth', 0.18, 0);
    this.tone(150, 65, 0.35, 'square', 0.14, 0.14);
  }

  public playBankruptcy(): void {
    const notes = [330, 311, 293, 220];
    notes.forEach((n, idx) => {
      this.tone(n, n * 0.96, 0.24, 'sawtooth', 0.12, idx * 0.16);
    });
  }

  public playDiceRoll(): void {
    for (let i = 0; i < 6; i++) {
      this.tone(
        260 + ((i * 97) % 240),
        180,
        0.045,
        'square',
        0.08,
        i * 0.065
      );
    }
  }

  public playDiceLand(): void {
    this.tone(320, 120, 0.09, 'triangle', 0.24, 0);
    this.tone(420, 160, 0.07, 'sine', 0.16, 0.06);
  }

  public playCountdownBeep(isFinal: boolean): void {
    if (isFinal) {
      this.tone(880, 1320, 0.28, 'triangle', 0.22);
    } else {
      this.tone(520, 520, 0.12, 'sine', 0.16);
    }
  }

  public playCoinFlip(): void {
    this.tone(1400, 2200, 0.1, 'sine', 0.15, 0);
    this.tone(1800, 2600, 0.12, 'triangle', 0.12, 0.1);
  }

  public playJackpot(): void {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((n, i) => {
      this.tone(n, n * 1.01, 0.22, 'triangle', 0.16, i * 0.07);
    });
  }

  public playAirportWhoosh(): void {
    this.tone(240, 880, 0.32, 'sine', 0.12, 0);
    this.tone(880, 320, 0.28, 'sine', 0.1, 0.22);
  }

  public playFestivalFanfare(): void {
    this.tone(587, 587, 0.11, 'triangle', 0.15, 0);
    this.tone(740, 740, 0.11, 'triangle', 0.15, 0.09);
    this.tone(880, 1174, 0.25, 'triangle', 0.18, 0.18);
  }
}

export const sfx = new SoundSynthesizer();
