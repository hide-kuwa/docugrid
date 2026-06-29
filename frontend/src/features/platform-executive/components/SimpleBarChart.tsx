type BarItem = {
  label: string;
  value: number;
  subLabel?: string;
};

type Props = {
  title: string;
  items: BarItem[];
  valueFormatter?: (n: number) => string;
  emptyLabel?: string;
};

export function SimpleBarChart({
  title,
  items,
  valueFormatter = (n) => n.toLocaleString("ja-JP"),
  emptyLabel = "データなし",
}: Props) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.label}>
              <div className="mb-1 flex items-end justify-between gap-2 text-xs">
                <span className="truncate font-medium text-slate-300">{item.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-100">
                  {valueFormatter(item.value)}
                  {item.subLabel ? (
                    <span className="ml-1 font-normal text-slate-500">{item.subLabel}</span>
                  ) : null}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                  style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
