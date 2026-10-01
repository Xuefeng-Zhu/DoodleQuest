import { scoreFor, type SoundCue } from "@/domain/melody";

export type AudioState = {
  phase: "idle" | "playing" | "unavailable";
  cue: SoundCue | null;
};
export const idleAudio: AudioState = { phase: "idle", cue: null };
type Voice = { oscillator: OscillatorNode; gain: GainNode };

// Lazy, gesture-driven Web Audio. One bounded cue replaces the previous cue;
// cancellation also fences asynchronous resume() from starting stale notes.
export class MelodyPlayer {
  private context: AudioContext | null = null;
  private voices = new Set<Voice>();
  private revision = 0;
  private disposed = false;
  constructor(
    private report: (state: AudioState) => void,
    private createContext = () => new AudioContext(),
  ) {}

  stop() {
    this.revision++;
    for (const voice of this.voices) {
      // Disconnect immediately: no queued future note can leak through mute.
      voice.gain.disconnect();
      voice.oscillator.onended = null;
      try {
        voice.oscillator.stop();
      } catch {
        /* Already ended. */
      }
      voice.oscillator.disconnect();
    }
    this.voices.clear();
    this.report(idleAudio);
  }

  async play(cue: SoundCue): Promise<boolean> {
    if (this.disposed) return false;
    this.stop();
    const revision = this.revision;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      this.context ??= this.createContext();
      const context = this.context;
      // Call resume synchronously inside the originating click/key/touch gesture.
      await Promise.race([
        context.resume(),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Audio resume timed out")),
            1500,
          );
        }),
      ]);
      if (this.disposed || revision !== this.revision) return false;
      if (context.state !== "running") throw new Error("Audio unavailable");
      const start = context.currentTime + 0.035;
      for (const note of scoreFor(cue)) {
        // A soft fundamental and a quiet upper partial give a small music-box tone.
        for (const [partial, strength] of [
          [1, 0.065],
          [2, 0.009],
        ]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const voice = { oscillator, gain };
          this.voices.add(voice);
          const at = start + note.at,
            peak = strength * note.level;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(note.pitch * partial, at);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(peak, at + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
          gain.gain.linearRampToValueAtTime(0, at + note.length + 0.02);
          oscillator.connect(gain).connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
            this.voices.delete(voice);
            if (revision === this.revision && !this.voices.size)
              this.report(idleAudio);
          };
          oscillator.start(at);
          oscillator.stop(at + note.length + 0.025);
        }
      }
      this.report({ phase: "playing", cue });
      return true;
    } catch {
      if (!this.disposed && revision === this.revision) {
        this.stop();
        this.report({ phase: "unavailable", cue: null });
      }
      return false;
    } finally {
      clearTimeout(deadline);
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    void this.context?.close().catch(() => {
      /* Browser may already have closed it. */
    });
    this.context = null;
  }
}
