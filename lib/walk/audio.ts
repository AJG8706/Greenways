/**
 * Arrival feedback (HUD spec §4): a two-note tone (880 → 1320 Hz, 350 ms)
 * through a WebAudio context created during the permission tap so it is
 * unlocked, and vibration where supported (Android; iOS ignores it).
 */
let ctx: AudioContext | null = null;

/** Call synchronously inside the permission tap handler. */
export function unlockAudio(): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null; // no audio — the vibration/card still carry the moment
  }
}

export function playArrivalTone(): void {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    for (const [freq, start] of [
      [880, 0],
      [1320, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.4, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.17);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.18);
    }
  } catch {
    // audio is a nicety; never let it break the walk
  }
}

export function vibrateArrival(): void {
  try {
    navigator.vibrate?.([70, 50, 70]);
  } catch {
    // unsupported — fine
  }
}

/** Soft single note when a corner is re-targeted from the picker (§9). */
export function playRetargetTone(): void {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {
    // ignore
  }
}
