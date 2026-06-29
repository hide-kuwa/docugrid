type Props = {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "amber" | "rose" | "violet";
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-slate-700 bg-slate-900/80 text-white",
  emerald: "border-emerald-800/60 bg-emerald-950/40 text-emerald-100",
  amber: "border-amber-800/60 bg-amber-950/40 text-amber-100",
  rose: "border-rose-800/60 bg-rose-950/40 text-rose-100",
  violet: "border-violet-800/60 bg-violet-950/40 text-violet-100",
};

export function MetricKpiCard({ label, value, sub, tone = "default" }: Props) {
  return (
    <article className={`rounded-2xl border p-4 ${toneClass[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </article>
  );
}
