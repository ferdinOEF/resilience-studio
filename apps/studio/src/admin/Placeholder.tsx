export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <div className="adm-section-label">Admin</div>
      <h1 className="adm-title" style={{ marginTop: 4 }}>
        {title}
      </h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Lands in step 5/8
      </p>
    </div>
  );
}
