"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  edgeAnchor,
  edgeStroke,
  relationEdgeLabel,
  shouldDrawEdgeLabel,
  type RelationGraphLayout,
  type RelationGraphNode,
  type RelationViewMode,
} from "@/features/client-data/lib/client-relations-layout";
import {
  arrowStyleForKind,
  computeArrowHead,
} from "@/features/client-data/lib/relation-arrowheads";

import {
  applyManualNodePositions,
  emptyManualLayout,
  isManualLayoutEmpty,
  type RelationDiagramManualLayout,
  type RelationPoint,
} from "@/features/client-data/lib/relation-diagram-manual-layout";

type Props = {
  layout: RelationGraphLayout;
  viewMode: RelationViewMode;
  focusClientId: string;
  focusName: string;
  manual: RelationDiagramManualLayout;
  onManualChange: (next: RelationDiagramManualLayout) => void;
  onFocusClient?: (clientId: string) => void;
};

type Pt = RelationPoint;

type DragState =
  | {
      kind: "node";
      id: string;
      pointerId: number;
      origin: Pt;
      start: Pt;
      moved: boolean;
    }
  | {
      kind: "label";
      id: string;
      pointerId: number;
      origin: Pt;
      start: Pt;
      moved: boolean;
    }
  | {
      kind: "bend";
      id: string;
      pointerId: number;
      origin: Pt;
      start: Pt;
      moved: boolean;
    };

function shortName(name: string): string {
  return name
    .replace(/^株式会社\s*/, "")
    .replace(/^合同会社\s*/, "")
    .replace(/^有限会社\s*/, "")
    .trim();
}

function svgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Pt {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function RelationDiagramCanvas({
  layout,
  viewMode,
  focusClientId,
  focusName,
  manual,
  onManualChange,
  onFocusClient,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const manualRef = useRef(manual);
  manualRef.current = manual;

  useEffect(() => {
    setDrag(null);
  }, [focusClientId, viewMode]);

  const positioned = useMemo(
    () => applyManualNodePositions(layout, manual),
    [layout, manual],
  );
  const nodes = positioned.nodes;
  const hulls = positioned.hulls;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labelOff = manual.labels;
  const bendOff = manual.bends;
  const hasManual = !isManualLayoutEmpty(manual);

  const patchManual = useCallback(
    (patch: Partial<RelationDiagramManualLayout>) => {
      onManualChange({
        nodes: patch.nodes ?? manualRef.current.nodes,
        labels: patch.labels ?? manualRef.current.labels,
        bends: patch.bends ?? manualRef.current.bends,
      });
    },
    [onManualChange],
  );

  const resetManual = () => {
    onManualChange(emptyManualLayout());
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      const svg = svgRef.current;
      if (!d || !svg || e.pointerId !== d.pointerId) return;
      const p = svgPoint(svg, e.clientX, e.clientY);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      if (!d.moved) {
        setDrag({ ...d, moved: true });
        dragRef.current = { ...d, moved: true };
      }
      const cur = manualRef.current;
      if (d.kind === "node") {
        patchManual({
          nodes: {
            ...cur.nodes,
            [d.id]: { x: d.origin.x + dx, y: d.origin.y + dy },
          },
        });
      } else if (d.kind === "label") {
        patchManual({
          labels: {
            ...cur.labels,
            [d.id]: { x: d.origin.x + dx, y: d.origin.y + dy },
          },
        });
      } else {
        patchManual({
          bends: {
            ...cur.bends,
            [d.id]: { x: d.origin.x + dx, y: d.origin.y + dy },
          },
        });
      }
    },
    [patchManual],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const wasClick = !d.moved && d.kind === "node";
      const nodeId = d.kind === "node" ? d.id : null;
      setDrag(null);
      dragRef.current = null;
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (wasClick && nodeId && nodeId !== focusClientId && onFocusClient) {
        onFocusClient(nodeId);
      }
    },
    [focusClientId, onFocusClient],
  );

  const startNodeDrag = (node: RelationGraphNode, e: React.PointerEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const start = svgPoint(svg, e.clientX, e.clientY);
    const next: DragState = {
      kind: "node",
      id: node.id,
      pointerId: e.pointerId,
      origin: { x: node.x, y: node.y },
      start,
      moved: false,
    };
    setDrag(next);
    dragRef.current = next;
  };

  const startLabelDrag = (
    edgeId: string,
    base: Pt,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const start = svgPoint(svg, e.clientX, e.clientY);
    const off = labelOff[edgeId] ?? { x: 0, y: 0 };
    const next: DragState = {
      kind: "label",
      id: edgeId,
      pointerId: e.pointerId,
      origin: off,
      start,
      moved: false,
    };
    setDrag(next);
    dragRef.current = next;
    void base;
  };

  const startBendDrag = (edgeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const start = svgPoint(svg, e.clientX, e.clientY);
    const off = bendOff[edgeId] ?? { x: 0, y: 0 };
    const next: DragState = {
      kind: "bend",
      id: edgeId,
      pointerId: e.pointerId,
      origin: off,
      start,
      moved: false,
    };
    setDrag(next);
    dragRef.current = next;
  };

  return (
    <div className="relative min-w-0">
      {hasManual ? (
        <button
          type="button"
          onClick={resetManual}
          className="absolute right-2 top-2 z-10 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          配置を戻す
        </button>
      ) : null}
      <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-white/90 px-2 py-0.5 text-[10px] text-slate-400">
        ドラッグで移動 · 名前クリックで中心切替
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="h-auto w-full min-h-[280px] touch-none select-none"
        role="img"
        aria-label={`${focusName}の関係図`}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {hulls.map((hull, hullIdx) => {
          const x = hull.cx - hull.rx;
          const y = hull.cy - hull.ry;
          return (
            <g key={hull.groupId}>
              <rect
                x={x}
                y={y}
                width={hull.rx * 2}
                height={hull.ry * 2}
                rx={6}
                fill="#dbeafe"
                fillOpacity={0.32}
                stroke="#60a5fa"
                strokeWidth={2}
              />
              <text
                x={x + 10}
                y={y + 16 + (hullIdx % 3) * 2}
                textAnchor="start"
                className="fill-blue-800"
                style={{ fontSize: 11, fontWeight: 700 }}
              >
                {hull.name}
              </text>
            </g>
          );
        })}

        {layout.edges.map((edge, edgeIdx) => {
          const from = nodeById.get(edge.fromClientId);
          const to = nodeById.get(edge.toClientId);
          if (!from || !to) return null;
          const style = edgeStroke(edge.kind);
          const { x1, y1, x2, y2 } = edgeAnchor(from, to);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const spread =
            edge.kind === "referral" ? 18 : edge.kind === "shareholding" ? 12 : 9;
          const lane =
            edge.kind === "referral"
              ? 2
              : edge.kind === "shareholding"
                ? -1
                : edge.kind === "relative"
                  ? 1
                  : edge.kind === "officer"
                    ? -2
                    : 0;
          const laneOff =
            ((edgeIdx % 3) - 1) * (spread / 2) + lane * 6;
          const ox = (-dy / len) * laneOff;
          const oy = (dx / len) * laneOff;
          const bend = bendOff[edge.id] ?? { x: 0, y: 0 };
          const ax1 = x1 + ox;
          const ay1 = y1 + oy;
          const ax2 = x2 + ox;
          const ay2 = y2 + oy;
          const midX = (ax1 + ax2) / 2 + bend.x;
          const midY = (ay1 + ay2) / 2 + bend.y;
          const pathD = `M ${ax1} ${ay1} Q ${midX} ${midY} ${ax2} ${ay2}`;
          // 矢印向きは曲線終点の接線近似（制御点→終点）
          const arrowMeta = arrowStyleForKind(edge.kind);
          const head = arrowMeta
            ? computeArrowHead(midX, midY, ax2, ay2, {
                length: arrowMeta.length,
                half: arrowMeta.half,
              })
            : null;
          // 曲線を先端手前まで描くため path は head.line まで短縮した二次近似は難しいので
          // 線はフル path、矢印は先端に重ねる（線幅が細いので許容）
          const tLabel =
            edge.kind === "referral" ? 0.32 : edge.kind === "shareholding" ? 0.58 : 0.45;
          // 二次ベジェ上の点
          const qx =
            (1 - tLabel) * (1 - tLabel) * ax1 +
            2 * (1 - tLabel) * tLabel * midX +
            tLabel * tLabel * ax2;
          const qy =
            (1 - tLabel) * (1 - tLabel) * ay1 +
            2 * (1 - tLabel) * tLabel * midY +
            tLabel * tLabel * ay2;
          const lo = labelOff[edge.id] ?? { x: 0, y: 0 };
          const amx = qx + lo.x;
          const amy = qy + lo.y;
          const showLabel = shouldDrawEdgeLabel(edge.kind, viewMode);
          const label = relationEdgeLabel(edge);
          const labelW = Math.max(52, (label?.length ?? 0) * 11);

          return (
            <g key={edge.id} className="group/edge">
              {/* ヒット用の太い透明パス */}
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
                className="cursor-grab"
                onPointerDown={(e) => startBendDrag(edge.id, e)}
              />
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth={style.width + 5}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <path
                d={
                  head
                    ? `M ${ax1} ${ay1} Q ${midX} ${midY} ${head.lineX2} ${head.lineY2}`
                    : pathD
                }
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
              {head && arrowMeta?.style === "dart" ? (
                <polygon
                  points={head.dartPoints}
                  fill={style.stroke}
                  stroke={style.stroke}
                  strokeWidth={0.6}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null}
              {head && arrowMeta?.style === "chevron" ? (
                <path
                  d={head.chevronPath}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null}
              {/* 曲げハンドル（ホバー時） */}
              <circle
                cx={midX}
                cy={midY}
                r={drag?.kind === "bend" && drag.id === edge.id ? 5 : 3.5}
                fill="#ffffff"
                stroke={style.stroke}
                strokeWidth={1.5}
                className={`cursor-grab transition-opacity ${
                  drag?.kind === "bend" && drag.id === edge.id
                    ? "opacity-100"
                    : "opacity-0 group-hover/edge:opacity-80"
                }`}
                onPointerDown={(e) => startBendDrag(edge.id, e)}
              />
              {showLabel && label ? (
                <g
                  className="cursor-grab"
                  onPointerDown={(e) =>
                    startLabelDrag(edge.id, { x: amx, y: amy }, e)
                  }
                >
                  <rect
                    x={amx - labelW / 2}
                    y={amy - 11}
                    width={labelW}
                    height={20}
                    rx={4}
                    fill="#ffffff"
                    stroke={style.stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    x={amx}
                    y={amy + 3}
                    textAnchor="middle"
                    fill={style.stroke}
                    style={{ fontSize: 11, fontWeight: 800 }}
                  >
                    {label}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {nodes.map((node) => {
          const isIndiv = node.client.category === "individual";
          const isFocus = node.ring === "focus" || node.id === focusClientId;
          const w = node.w;
          const h = node.h;
          const canFocus = Boolean(onFocusClient) && node.id !== focusClientId;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => startNodeDrag(node, e)}
              style={{ cursor: canFocus ? "pointer" : "grab" }}
            >
              <title>
                {canFocus
                  ? `${node.client.name} — クリックでこの顧問先を中心に`
                  : node.client.name}
              </title>
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={isIndiv ? 12 : 6}
                fill={isFocus ? "#0f172a" : isIndiv ? "#fff1f2" : "#ffffff"}
                stroke={isFocus ? "#f59e0b" : isIndiv ? "#fb7185" : "#94a3b8"}
                strokeWidth={isFocus ? 2.5 : 1.75}
              />
              <text
                textAnchor="middle"
                y={-2}
                fill={isFocus ? "#f8fafc" : "#0f172a"}
                style={{ fontSize: 11, fontWeight: 800 }}
              >
                {shortName(node.client.name).slice(0, 10)}
              </text>
              <text
                textAnchor="middle"
                y={12}
                fill={isFocus ? "#94a3b8" : "#64748b"}
                style={{ fontSize: 9, fontWeight: 600 }}
              >
                {isIndiv ? "個人" : "法人"} · {node.client.fiscalMonth}月
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
