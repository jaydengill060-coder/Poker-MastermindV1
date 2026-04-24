export function TableMood() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.02)_18%,rgba(0,0,0,0)_42%)]" />
      <div className="absolute inset-0 opacity-20 mix-blend-screen [background-image:linear-gradient(135deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0)_18%,rgba(255,255,255,0.06)_36%,rgba(255,255,255,0)_54%,rgba(255,255,255,0.05)_72%,rgba(255,255,255,0)_90%)] [background-size:180px_180px] animate-[table-drift_18s_linear_infinite]" />
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.05),transparent_40%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.05),transparent_38%)]" />
      <style>{`@keyframes table-drift { from { background-position: 0 0; } to { background-position: 180px 180px; } }`}</style>
    </div>
  );
}
