"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  MousePointerClick,
} from "lucide-react";
import {
  AUDIT_DEMO_COLORS,
  DEMO_AUDIT_PAIRS,
  DEMO_FS_HOTSPOTS,
  DEMO_S4_HOTSPOTS,
  type DemoAuditLink,
  type DemoPdfDoc,
  type DemoPdfHotspot,
} from "./demo-audit-scenario";
import { DemoPdfPageMock } from "./DemoPdfPageMock";

type Props = {
  onBack: () => void;
};

type PickPhase = "left" | "right" | "done";

type HotspotVisual =
  | { kind: "hidden" }
  | { kind: "target" }
  | { kind: "pending" }
  | { kind: "linked"; linkIndex: number }
  | { kind: "dim" };

export function DemoAuditTourView({ onBack }: Props) {
  const [pairIndex, setPairIndex] = useState(0);
  const [phase, setPhase] = useState<PickPhase>("left");
  const [links, setLinks] = useState<DemoAuditLink[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [pendingLeftId, setPendingLeftId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true);

  const currentPair = DEMO_AUDIT_PAIRS[pairIndex] ?? null;
  const allDone = phase === "done" || pairIndex >= DEMO_AUDIT_PAIRS.length;

  const guideText = useMemo(() => {
    if (allDone) return "照合完了 — 本番では承認フローへ進めます";
    if (phase === "left") {
      return "決算書の「当期純利益」（税引後）をクリック";
    }
    return "別表四の先頭行「当期利益又は当期欠損の額」をクリック";
  }, [allDone, phase]);

  const hotspotState = useCallback(
    (side: "left" | "right", id: string): HotspotVisual => {
      const linked = links.find((l) => {
        const p = DEMO_AUDIT_PAIRS.find((x) => x.id === l.pairId);
        if (!p) return false;
        return side === "left" ? p.leftHotspotId === id : p.rightHotspotId === id;
      });
      if (linked) {
        return { kind: "linked", linkIndex: linked.index };
      }
      if (allDone || !currentPair) return { kind: "hidden" };

      const isTarget =
        side === "left"
          ? phase === "left" && id === currentPair.leftHotspotId
          : phase === "right" && id === currentPair.rightHotspotId;

      if (isTarget) return { kind: "target" };
      if (side === "left" && phase === "right" && id === pendingLeftId) {
        return { kind: "pending" };
      }
      return { kind: "hidden" };
    },
    [allDone, currentPair, links, pendingLeftId, phase],
  );

  const handleHotspotClick = (side: "left" | "right", id: string) => {
    if (allDone || !currentPair) return;

    if (side === "left" && phase === "left" && id === currentPair.leftHotspotId) {
      setPendingLeftId(id);
      setPhase("right");
      return;
    }

    if (side === "right" && phase === "right" && id === currentPair.rightHotspotId) {
      const link: DemoAuditLink = {
        id: `link-${currentPair.id}`,
        pairId: currentPair.id,
        index: links.length + 1,
        comment: currentPair.comment,
      };
      setLinks((prev) => [...prev, link]);
      setPendingLeftId(null);
      setSelectedLinkId(link.id);

      const next = pairIndex + 1;
      if (next >= DEMO_AUDIT_PAIRS.length) {
        setPhase("done");
        setPairIndex(next);
      } else {
        setPairIndex(next);
        setPhase("left");
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-800">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          マトリクスへ
        </button>
        <span className="font-bold text-slate-400">2画面照合</span>
        <span className="text-slate-600">|</span>
        <span className="min-w-0 flex-1 truncate text-slate-300">
          {phase === "right" && pendingLeftId
            ? "待ち: 右の PDF をクリック"
            : "チェック(✓) → 左クリック → 右クリック"}
        </span>
        <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-300 hover:bg-slate-700">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          入替
        </button>
        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 ${
            railOpen ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" />
          照合 {links.length > 0 ? `(${links.length})` : ""}
        </button>
      </div>

      <div className="shrink-0 border-b border-indigo-500/30 bg-indigo-950/60 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-100">
          <MousePointerClick className="h-4 w-4 shrink-0 text-cyan-300 demo-audit-pointer-bounce" aria-hidden />
          <span>{guideText}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <DemoPdfPane
          side="left"
          title="左"
          docTitle="決算書 — 損益計算書"
          fileName="決算書_株式会社A_第35期.pdf"
          doc="financial_statement"
          hotspots={DEMO_FS_HOTSPOTS}
          hotspotState={(id) => hotspotState("left", id)}
          onHotspotClick={(id) => handleHotspotClick("left", id)}
        />
        <DemoPdfPane
          side="right"
          title="右"
          docTitle="別表四（所得の金額の計算に関する明細書）"
          fileName="別表四_法人税_第35期.pdf"
          doc="schedule4"
          hotspots={DEMO_S4_HOTSPOTS}
          hotspotState={(id) => hotspotState("right", id)}
          onHotspotClick={(id) => handleHotspotClick("right", id)}
        />
        {railOpen ? (
          <aside className="flex w-52 shrink-0 flex-col border-l border-slate-600 bg-white md:w-64">
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-slate-200 px-2 text-xs font-semibold text-slate-700">
              <Link2 className="h-3.5 w-3.5" />
              照合済み ({links.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 text-[11px]">
              {links.length === 0 ? (
                <p className="leading-relaxed text-slate-500">
                  PDF 上を左右で順にクリックすると #1, #2… と紐づきます。
                </p>
              ) : (
                <ul className="space-y-2">
                  {links.map((link) => {
                    const pair = DEMO_AUDIT_PAIRS.find((p) => p.id === link.pairId);
                    const color = AUDIT_DEMO_COLORS[(link.index - 1) % AUDIT_DEMO_COLORS.length];
                    return (
                      <li
                        key={link.id}
                        className={`rounded-md border p-2 ${
                          selectedLinkId === link.id ? "border-slate-400 bg-slate-50" : "border-slate-200"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedLinkId(link.id)}
                          className="mb-1 flex w-full items-center gap-2 text-left"
                        >
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: color }}
                          >
                            {link.index}
                          </span>
                          <span className="font-medium text-slate-800">{pair?.title}</span>
                        </button>
                        <p className="text-slate-500">{link.comment}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">L P1 ↔ R P1</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {allDone ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">
                  <Check className="mb-1 h-4 w-4" />
                  <p className="font-bold">デモ照合完了</p>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DemoPdfPane({
  title,
  docTitle,
  fileName,
  doc,
  hotspots,
  hotspotState,
  onHotspotClick,
}: {
  side: "left" | "right";
  title: string;
  docTitle: string;
  fileName: string;
  doc: DemoPdfDoc;
  hotspots: DemoPdfHotspot[];
  hotspotState: (id: string) => HotspotVisual;
  onHotspotClick: (id: string) => void;
}) {
  const hasTarget = hotspots.some((h) => hotspotState(h.id).kind === "target");

  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col border-r border-slate-300 bg-slate-100 last:border-r-0 ${
        hasTarget ? "ring-2 ring-inset ring-cyan-500/40" : ""
      }`}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-slate-300 bg-slate-200 px-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">{fileName}</span>
        <button type="button" disabled className="rounded p-0.5 text-slate-400 opacity-40" aria-hidden>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="w-10 text-center font-mono text-[10px] text-slate-600">1/1</span>
        <button type="button" disabled className="rounded p-0.5 text-slate-400 opacity-40" aria-hidden>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-2 md:p-4">
        <div className="w-full max-w-[300px]">
          <p className="mb-2 text-center text-[10px] font-semibold text-slate-500">{docTitle}</p>
          <DemoPdfPageMock
            doc={doc}
            hotspots={hotspots}
            hotspotState={hotspotState}
            onHotspotClick={onHotspotClick}
          />
        </div>
      </div>
    </div>
  );
}
