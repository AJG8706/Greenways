export function StubTab({
  title,
  body,
  phase,
}: {
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "var(--gw-s-16)" }}>
      <div className="stack" style={{ alignItems: "center" }}>
        <span className="pill pill-draft">{phase}</span>
        <h2>{title}</h2>
        <p className="muted" style={{ maxWidth: 480 }}>
          {body}
        </p>
      </div>
    </div>
  );
}
