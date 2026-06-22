"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  DEMO_CLIENTS,
  DEMO_METRICS_BY_SAMPLE,
  DEMO_PERIODS,
  DEMO_PLAY_CLIENT_IDX,
  DEMO_PLAY_PERIOD_IDX,
  DEMO_PREFILLED_CELLS,
  DEMO_SAMPLES,
  DEMO_SLOTS,
  demoCellKey,
  isDemoPlayCell,
  type DemoSlotDef,
} from "./demo-scenario";
import { DemoSlotCard, type DemoSlotState } from "./DemoSlotCard";
import { DemoFileOrb } from "./DemoFileOrb";
import { DemoMatrixHeader, DemoMatrixNav, DemoMatrixSidebar } from "./DemoMatrixChrome";

const DRAG_MIME = "application/x-docugrid-demo-sample";

function filledStateForSample(sampleId: string, slot: DemoSlotDef, animateMetrics = false): DemoSlotState {
  const metrics = DEMO_METRICS_BY_SAMPLE[sampleId] ?? [];
  return {
    phase: "filled",
    fileName: slot.sampleFileName,
    pageCount: slot.pageCount,
    metrics,
    visibleMetrics: animateMetrics ? 0 : metrics.length,
  };
}

function buildInitialCellStates(): Record<string, DemoSlotState> {
  const states: Record<string, DemoSlotState> = {};
  for (const [key, sampleId] of Object.entries(DEMO_PREFILLED_CELLS)) {
    const slotIdx = Number(key.split(":")[2]);
    const slot = DEMO_SLOTS[slotIdx];
    if (slot && slot.sampleId === sampleId) {
      states[key] = filledStateForSample(sampleId, slot);
    }
  }
  return states;
}

function slotForSample(sampleId: string): DemoSlotDef | undefined {
  return DEMO_SLOTS.find((s) => s.sampleId === sampleId);
}

function readSampleFromDrag(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain") || null;
}

export function DemoMatrix() {
  const [clientIdx, setClientIdx] = useState(DEMO_PLAY_CLIENT_IDX);
  const [periodIdx, setPeriodIdx] = useState(DEMO_PLAY_PERIOD_IDX);
  const [cellStates, setCellStates] = useState<Record<string, DemoSlotState>>(buildInitialCellStates);
  const [usedSamples, setUsedSamples] = useState<Set<string>>(new Set());
  const [activeDragSampleId, setActiveDragSampleId] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isPlayCell = isDemoPlayCell(clientIdx, periodIdx);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const clearDragHighlights = useCallback(() => {
    setCellStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, state] of Object.entries(next)) {
        if (state.phase === "drag-over") {
          next[key] = { phase: "empty" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const goToPlayCell = () => {
    setClientIdx(DEMO_PLAY_CLIENT_IDX);
    setPeriodIdx(DEMO_PLAY_PERIOD_IDX);
  };

  const resetDemo = () => {
    clearTimers();
    setClientIdx(DEMO_PLAY_CLIENT_IDX);
    setPeriodIdx(DEMO_PLAY_PERIOD_IDX);
    setCellStates(buildInitialCellStates());
    setUsedSamples(new Set());
    setActiveDragSampleId(null);
    setSelectedSampleId(null);
  };

  const runProcessingSequence = (cellKey: string, slot: DemoSlotDef, sampleId: string) => {
    const metrics = DEMO_METRICS_BY_SAMPLE[sampleId] ?? [];

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };

    let progress = 0;
    let stageIndex = 0;
    const tickProgress = () => {
      progress = Math.min(100, progress + 8 + Math.random() * 10);
      if (progress >= 55 && stageIndex < 1) stageIndex = 1;
      if (progress >= 72 && stageIndex < 2) stageIndex = 2;
      if (progress >= 88 && stageIndex < 3) stageIndex = 3;
      setCellStates((prev) => ({
        ...prev,
        [cellKey]: { phase: "processing", progress, stageIndex },
      }));
      if (progress < 100) {
        schedule(tickProgress, 120);
      } else {
        schedule(() => {
          setCellStates((prev) => ({
            ...prev,
            [cellKey]: filledStateForSample(sampleId, slot, true),
          }));
          metrics.forEach((_, i) => {
            schedule(() => {
              setCellStates((prev) => {
                const cur = prev[cellKey];
                if (cur.phase !== "filled") return prev;
                return { ...prev, [cellKey]: { ...cur, visibleMetrics: i + 1 } };
              });
            }, 180 * (i + 1));
          });
        }, 200);
      }
    };

    schedule(tickProgress, 80);
  };

  const handlePlace = (slotIdx: number, sampleId: string) => {
    if (!isPlayCell) return;
    const slot = DEMO_SLOTS[slotIdx];
    if (!slot || slot.sampleId !== sampleId || usedSamples.has(sampleId)) return;

    const key = demoCellKey(clientIdx, periodIdx, slotIdx);
    const current = cellStates[key];
    if (current?.phase !== "empty" && current?.phase !== "drag-over") return;

    setSelectedSampleId(null);
    setUsedSamples((prev) => new Set(prev).add(sampleId));
    setCellStates((prev) => ({
      ...prev,
      [key]: { phase: "processing", progress: 0, stageIndex: 0 },
    }));
    runProcessingSequence(key, slot, sampleId);
  };

  const onSampleDragStart = (e: React.DragEvent, sampleId: string) => {
    if (!isPlayCell || usedSamples.has(sampleId)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_MIME, sampleId);
    e.dataTransfer.setData("text/plain", sampleId);
    e.dataTransfer.effectAllowed = "copy";
    setActiveDragSampleId(sampleId);
    setSelectedSampleId(null);
  };

  const onSampleDragEnd = () => {
    setActiveDragSampleId(null);
    clearDragHighlights();
  };

  const onSampleClick = (sampleId: string) => {
    if (usedSamples.has(sampleId)) return;
    if (!isPlayCell) {
      goToPlayCell();
      setSelectedSampleId(sampleId);
      return;
    }
    setSelectedSampleId((prev) => (prev === sampleId ? null : sampleId));
  };

  const filledCount = DEMO_SLOTS.filter((_, slotIdx) => {
    const key = demoCellKey(clientIdx, periodIdx, slotIdx);
    return cellStates[key]?.phase === "filled";
  }).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 md:px-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">ライブデモ</p>
          <h3 className="text-lg font-bold text-slate-900">顧問先 × 期間のマトリクスを体験</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            丸い資料をドラッグ、またはクリックしてから枠をクリック
          </p>
        </div>
        <button
          type="button"
          onClick={resetDemo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          リセット
        </button>
      </div>

      <div className="flex h-[min(640px,75vh)] min-h-[480px] flex-col bg-slate-100">
        <DemoMatrixNav activeClientIdx={clientIdx} onClientChange={setClientIdx} />
        <div className="flex min-h-0 flex-1">
          <DemoMatrixSidebar activePeriodIdx={periodIdx} onPeriodChange={setPeriodIdx} />
          <div className="flex min-w-0 flex-1 flex-col">
            <DemoMatrixHeader
              clientIdx={clientIdx}
              periodIdx={periodIdx}
              filledCount={filledCount}
              slotCount={DEMO_SLOTS.length}
              isPlayCell={isPlayCell}
            />
            <div
              className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4"
              onDragOver={(e) => {
                if (activeDragSampleId) e.preventDefault();
              }}
            >
              <div className={`mb-4 flex flex-wrap justify-center gap-5 md:gap-6 ${isPlayCell ? "" : "opacity-70"}`}>
                {DEMO_SAMPLES.map((sample) => {
                  const used = usedSamples.has(sample.id);
                  const target = slotForSample(sample.id);
                  const selected = selectedSampleId === sample.id;
                  return (
                    <div
                      key={sample.id}
                      draggable={isPlayCell && !used}
                      onDragStart={(e) => onSampleDragStart(e, sample.id)}
                      onDragEnd={onSampleDragEnd}
                      onClick={() => onSampleClick(sample.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSampleClick(sample.id);
                        }
                      }}
                      role="button"
                      tabIndex={used ? -1 : 0}
                      className={`select-none rounded-full outline-none transition-transform ${
                        used
                          ? "cursor-default opacity-60"
                          : "cursor-grab hover:scale-105 active:cursor-grabbing active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500"
                      } ${selected ? "ring-4 ring-blue-400 ring-offset-2" : ""}`}
                      title={
                        !isPlayCell
                          ? `クリックで ${DEMO_CLIENTS[DEMO_PLAY_CLIENT_IDX].name} × ${DEMO_PERIODS[DEMO_PLAY_PERIOD_IDX]} へ`
                          : used
                            ? "配置済み"
                            : selected
                              ? "枠をクリックして配置"
                              : target
                                ? `${target.title} にドロップ（またはクリック選択）`
                                : undefined
                      }
                    >
                      <DemoFileOrb
                        label={sample.shortLabel}
                        sublabel={
                          !isPlayCell ? "タップで3月へ" : used ? "配置済" : selected ? "選択中" : "ドラッグ"
                        }
                        size="lg"
                        variant={used ? "used" : "idle"}
                      />
                    </div>
                  );
                })}
              </div>

              {selectedSampleId && isPlayCell ? (
                <p className="mb-3 text-center text-xs font-bold text-blue-600">
                  「{slotForSample(selectedSampleId)?.title}」の枠をクリックして配置
                </p>
              ) : null}

              <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                {DEMO_SLOTS.map((slot, slotIdx) => {
                  const key = demoCellKey(clientIdx, periodIdx, slotIdx);
                  const state = cellStates[key] ?? { phase: "empty" };
                  const isEmpty = state.phase === "empty" || state.phase === "drag-over";
                  const matchesDrag = activeDragSampleId === slot.sampleId;
                  const matchesSelect = selectedSampleId === slot.sampleId;
                  const canPlace = isPlayCell && isEmpty && !usedSamples.has(slot.sampleId);

                  return (
                    <DemoSlotCard
                      key={`${key}-${slot.id}`}
                      slot={slot}
                      state={state}
                      dropHint={
                        canPlace && (matchesDrag || matchesSelect)
                          ? "accept"
                          : activeDragSampleId && isEmpty && !matchesDrag
                            ? "reject"
                            : "none"
                      }
                      clickable={canPlace && matchesSelect}
                      onEmptyClick={() => {
                        if (selectedSampleId && canPlace && selectedSampleId === slot.sampleId) {
                          handlePlace(slotIdx, selectedSampleId);
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        if (canPlace && matchesDrag) {
                          setCellStates((prev) => ({ ...prev, [key]: { phase: "drag-over" } }));
                        }
                      }}
                      onDragLeave={() => {
                        setCellStates((prev) =>
                          prev[key]?.phase === "drag-over" ? { ...prev, [key]: { phase: "empty" } } : prev,
                        );
                      }}
                      onDragOver={(e) => {
                        if (!isPlayCell || !isEmpty || !activeDragSampleId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = matchesDrag ? "copy" : "none";
                        if (matchesDrag && state.phase !== "drag-over") {
                          setCellStates((prev) => ({ ...prev, [key]: { phase: "drag-over" } }));
                        } else if (!matchesDrag && state.phase === "drag-over") {
                          setCellStates((prev) => ({ ...prev, [key]: { phase: "empty" } }));
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sampleId = readSampleFromDrag(e);
                        setActiveDragSampleId(null);
                        if (sampleId && canPlace) handlePlace(slotIdx, sampleId);
                        else clearDragHighlights();
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-slate-100 bg-white px-4 py-2 text-center text-[11px] text-slate-400">
        ※ デモ用の演出です。実際の OCR API は呼び出していません。
      </p>
    </div>
  );
}
