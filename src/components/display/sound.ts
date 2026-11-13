"use client";

/**
 * Original synthesized sound effects (Web Audio API) — no audio files, no
 * licensing concerns. Everything works without sound; browsers require one
 * click on the projector page before audio can play.
 */
export class RaffleSound {
  private ctx: AudioContext | null = null;

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  async unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  tick() {
    if (!this.unlocked) return;
    const t = this.ctx!.currentTime;
    this.tone(1800, t, 0.035, "square", 0.04);
  }

  fanfare() {
    if (!this.unlocked) return;
    const t = this.ctx!.currentTime + 0.02;
    // C major arpeggio into a held chord.
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.12, 0.3, "triangle", 0.18));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, t + 0.4, 1.4, "triangle", 0.12));
  }
}
