type Point = {
  date: string;
  mrrYen: number;
  netMrrYen?: number;
};

type Props = {
  title: string;
  points: Point[];
  valueFormatter?: (n: number) => string;
};

export function MrrTrendChart({
  title,
  points,
  valueFormatter = (n) => `¥${n.toLocaleString("ja-JP")}`,
}: Props) {
  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        <p className="mt-4 text-xs text-slate-500">
          日次スナップショットが蓄積されるとトレンドが表示されます（ダッシュボードを開くたびに記録）。
        </p>
      </section>
    );
  }

  const width = 560;
  const height = 180;
  const padX = 36;
  const padY = 24;
  const values = points.map((p) => p.mrrYen);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(maxV - minV, 1);

  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = padY + (1 - (p.mrrYen - minV) / span) * (height - padY * 2);
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1]?.x ?? padX} ${height - padY} L ${coords[0]?.x ?? padX} ${height - padY} Z`;
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest.mrrYen - first.mrrYen;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-200">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            最新 {valueFormatter(latest.mrrYen)}
            <span className={delta >= 0 ? " text-emerald-400" : " text-rose-400"}>
              {" "}
              ({delta >= 0 ? "+" : ""}
              {valueFormatter(delta)})
            </span>
          </p>
        </div>
        <p className="text-[10px] text-slate-500">
          {first.date} → {latest.date}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-44 w-full">
        <defs>
          <linearGradient id="mrrArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = padY + t * (height - padY * 2);
          return (
            <line key={t} x1={padX} y1={y} x2={width - padX} y2={y} stroke="#334155" strokeWidth="1" />
          );
        })}
        <path d={areaPath} fill="url(#mrrArea)" />
        <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />
        {coords.length > 0 && (
          <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill="#38bdf8" />
        )}
      </svg>
    </section>
  );
}
