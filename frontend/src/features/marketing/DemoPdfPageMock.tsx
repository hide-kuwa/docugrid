"use client";

import type { DemoPdfDoc, DemoPdfHotspot } from "./demo-audit-scenario";
import { AUDIT_DEMO_COLORS } from "./demo-audit-scenario";

type HotspotVisual =
  | { kind: "hidden" }
  | { kind: "target" }
  | { kind: "pending" }
  | { kind: "linked"; linkIndex: number }
  | { kind: "dim" };

type Props = {
  doc: DemoPdfDoc;
  hotspots: DemoPdfHotspot[];
  hotspotState: (id: string) => HotspotVisual;
  onHotspotClick: (id: string) => void;
};

export function DemoPdfPageMock({ doc, hotspots, hotspotState, onHotspotClick }: Props) {
  return (
    <div className="relative mx-auto w-full max-w-[min(100%,300px)]">
      <div className="relative aspect-[1/1.414] w-full bg-white shadow-[0_4px_24px_rgba(15,23,42,0.18)]">
        {doc === "financial_statement" ? <FinancialStatementSvg /> : <Schedule4Svg />}

        {hotspots.map((spot) => {
          const st = hotspotState(spot.id);
          if (st.kind === "hidden") return null;

          const isTarget = st.kind === "target";
          const isPending = st.kind === "pending";
          const isLinked = st.kind === "linked";
          const clickable = isTarget;

          return (
            <button
              key={spot.id}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onHotspotClick(spot.id)}
              className={`absolute transition-all ${
                isTarget
                  ? "demo-audit-pdf-target z-30 cursor-crosshair ring-2 ring-cyan-400"
                  : isPending
                    ? "z-25 ring-2 ring-amber-400"
                    : isLinked
                      ? "z-20 ring-1 ring-emerald-500"
                      : "z-10 pointer-events-none"
              }`}
              style={{
                left: `${spot.x * 100}%`,
                top: `${spot.y * 100}%`,
                width: `${spot.w * 100}%`,
                height: `${spot.h * 100}%`,
              }}
              title={spot.label}
            >
              {isTarget ? (
                <span className="demo-audit-here absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-cyan-400 px-1.5 py-0.5 text-[8px] font-black text-slate-900 shadow">
                  ここをクリック
                </span>
              ) : null}
              {isLinked ? (
                <span
                  className="absolute right-0 top-1/2 flex h-5 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white shadow-md"
                  style={{
                    backgroundColor:
                      AUDIT_DEMO_COLORS[((st as { linkIndex: number }).linkIndex - 1) % AUDIT_DEMO_COLORS.length],
                  }}
                >
                  {(st as { linkIndex: number }).linkIndex}
                </span>
              ) : null}
              {isPending ? (
                <span className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 animate-pulse rounded-full border-2 border-amber-200 bg-amber-500 shadow" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinancialStatementSvg() {
  return (
    <svg viewBox="0 0 420 594" className="h-full w-full" aria-hidden>
      <rect width="420" height="594" fill="#fff" />
      <text x="210" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">
        損益計算書
      </text>
      <text x="210" y="54" textAnchor="middle" fontSize="9" fill="#64748b">
        株式会社A　自 2024年4月1日　至 2025年3月31日
      </text>
      <text x="360" y="54" textAnchor="end" fontSize="8" fill="#94a3b8">
        （単位：円）
      </text>
      <line x1="32" y1="68" x2="388" y2="68" stroke="#cbd5e1" />
      <text x="40" y="88" fontSize="9" fontWeight="600" fill="#475569">
        科目
      </text>
      <text x="360" y="88" textAnchor="end" fontSize="9" fontWeight="600" fill="#475569">
        金額
      </text>
      {[
        ["売上高", "5,000,000", 115, false],
        ["売上原価", "2,100,000", 145, false],
        ["売上総利益", "2,900,000", 175, false],
        ["販売費及び一般管理費", "1,420,000", 205, false],
        ["役員報酬", "1,200,000", 235, false],
        ["営業利益", "1,480,000", 275, true],
        ["支払利息", "48,000", 305, false],
        ["税引前当期純利益", "1,240,000", 345, true],
        ["法人税等", "312,000", 375, false],
        ["当期純利益", "928,000", 405, true],
      ].map(([label, amount, y, bold]) => (
        <g key={label as string}>
          <line x1="32" y1={Number(y) - 12} x2="388" y2={Number(y) - 12} stroke="#e2e8f0" />
          <text
            x={String(label).startsWith("役員") ? 52 : 40}
            y={Number(y)}
            fontSize="10"
            fontWeight={bold ? "700" : "400"}
            fill="#334155"
          >
            {label}
          </text>
          <text
            x="360"
            y={Number(y)}
            textAnchor="end"
            fontSize="10"
            fontFamily="monospace"
            fontWeight={bold ? "700" : "400"}
            fill="#334155"
          >
            {amount}
          </text>
        </g>
      ))}
      <text x="210" y="560" textAnchor="middle" fontSize="8" fill="#94a3b8">
        決算書（抜粋）　1 / 3
      </text>
    </svg>
  );
}

function Schedule4Svg() {
  return (
    <svg viewBox="0 0 420 594" className="h-full w-full" aria-hidden>
      <rect width="420" height="594" fill="#fff" />
      <text x="210" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">
        別表四
      </text>
      <text x="210" y="48" textAnchor="middle" fontSize="8" fill="#64748b">
        （所得の金額の計算に関する明細書）
      </text>
      <text x="210" y="62" textAnchor="middle" fontSize="8" fill="#64748b">
        株式会社A　事業年度　令和6年4月1日〜令和7年3月31日
      </text>
      <rect x="24" y="72" width="372" height="1" fill="#cbd5e1" />
      <text x="28" y="86" fontSize="7" fontWeight="600" fill="#475569">
        区分
      </text>
      <text x="200" y="86" textAnchor="middle" fontSize="7" fontWeight="600" fill="#475569">
        総額
      </text>
      <text x="268" y="86" textAnchor="middle" fontSize="7" fontWeight="600" fill="#475569">
        留保
      </text>
      <text x="340" y="86" textAnchor="middle" fontSize="7" fontWeight="600" fill="#475569">
        社外流出
      </text>
      <rect x="24" y="90" width="372" height="1" fill="#e2e8f0" />
      {/* 当期利益 — 別表四の先頭行 */}
      <text x="28" y="110" fontSize="8.5" fontWeight="700" fill="#1e293b">
        当期利益又は当期欠損の額
      </text>
      <text x="200" y="110" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fontWeight="700" fill="#1e293b">
        928,000
      </text>
      <text x="268" y="110" textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#334155">
        928,000
      </text>
      <line x1="24" y1="122" x2="396" y2="122" stroke="#cbd5e1" />
      <text x="28" y="138" fontSize="8" fill="#334155">
        損金経理をした法人税及び地方法人税
      </text>
      <text x="200" y="138" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        312,000
      </text>
      <text x="340" y="138" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        312,000
      </text>
      <line x1="24" y1="148" x2="396" y2="148" stroke="#e2e8f0" />
      <text x="28" y="164" fontSize="8" fontWeight="600" fill="#475569">
        損金不算入額
      </text>
      <line x1="24" y1="172" x2="396" y2="172" stroke="#e2e8f0" />
      <text x="36" y="188" fontSize="8" fill="#334155">
        交際費等
      </text>
      <text x="200" y="188" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        45,000
      </text>
      <text x="268" y="188" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        45,000
      </text>
      <line x1="24" y1="196" x2="396" y2="196" stroke="#e2e8f0" />
      <text x="36" y="212" fontSize="8" fill="#334155">
        役員報酬（損金不算入）
      </text>
      <text x="200" y="212" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        80,000
      </text>
      <text x="268" y="212" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        80,000
      </text>
      <line x1="24" y1="220" x2="396" y2="220" stroke="#e2e8f0" />
      <text x="28" y="238" fontSize="8" fontWeight="600" fill="#475569">
        損金算入額
      </text>
      <line x1="24" y1="246" x2="396" y2="246" stroke="#e2e8f0" />
      <text x="36" y="262" fontSize="8" fill="#334155">
        減価償却超過額
      </text>
      <text x="200" y="262" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        120,000
      </text>
      <text x="268" y="262" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#334155">
        120,000
      </text>
      <text x="210" y="560" textAnchor="middle" fontSize="8" fill="#94a3b8">
        法人税申告書別表四　1 / 2
      </text>
    </svg>
  );
}
