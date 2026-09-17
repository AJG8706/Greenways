// Pure helpers shared by the server client and unit tests.

export type Motion = { id: string; name: string; start_end_frame?: boolean };

/** Best-effort motion lookup by the slot's motionQuery ("crane down" → Crane Down). */
export function findMotion(motions: Motion[], query: string): Motion | null {
  const q = query.toLowerCase();
  return (
    motions.find((m) => m.name.toLowerCase() === q) ??
    motions.find((m) => m.name.toLowerCase().includes(q)) ??
    motions.find((m) => q.split(" ").every((w) => m.name.toLowerCase().includes(w))) ??
    null
  );
}
