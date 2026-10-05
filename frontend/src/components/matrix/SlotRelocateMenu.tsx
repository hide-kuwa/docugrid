"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Building2,
  CalendarRange,
  LayoutGrid,
  Trash2,
  X,
} from "lucide-react";
import { matchesSearchQuery } from "@/lib/japanese-search";

export type RelocateMode = "slot" | "period" | "client";

export type RelocateSlotOption = {
  slotId: string;
  label: string;
  occupied: boolean;
  isCurrent: boolean;
};

export type RelocatePeriodOption = {
  periodKey: string;
  label: string;
  isCurrent: boolean;
};

export type RelocateClientOption = {
  id: string;
  name: string;
  isCurrent: boolean;
};

export type RelocateConfirmPayload = {
  slotId: string;
  slotLabel: string;
  periodKey?: string;
  clientId?: string;
  destinationLabel: string;
};

type MenuState = {
  x: number;
  y: number;
  slotIndex: number;
  slotLabel: string;
  slotId: string;
};

type Props = {
  open: MenuState | null;
  onClose: () => void;
  canRelocate: boolean;
  /** 資料の削除（枠は残す） */
  canDelete?: boolean;
  slotOptions: RelocateSlotOption[];
  periodOptions: RelocatePeriodOption[];
  clientOptions: RelocateClientOption[];
  onConfirm: (sourceSlotIndex: number, target: RelocateConfirmPayload) => void | Promise<void>;
  onDeleteDocument?: (sourceSlotIndex: number) => void | Promise<void>;
};

export function SlotRelocateMenu({
  open,
  onClose,
  canRelocate,
  canDelete = false,
  slotOptions,
  periodOptions,
  clientOptions,
  onConfirm,
  onDeleteDocument,
}: Props) {
  const [dialogMode, setDialogMode] = useState<RelocateMode | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDialogMode(null);
      setClientQuery("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || dialogMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, dialogMode, onClose]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim();
    if (!q) return clientOptions.filter((c) => !c.isCurrent);
    return clientOptions.filter(
      (c) => !c.isCurrent && matchesSearchQuery(`${c.name} ${c.id}`, q),
    );
  }, [clientOptions, clientQuery]);

  if (!open || (!canRelocate && !canDelete)) return null;

  const run = async (target: RelocateConfirmPayload) => {
    setBusy(true);
    try {
      await onConfirm(open.slotIndex, target);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!onDeleteDocument) return;
    const ok = window.confirm(
      `「${open.slotLabel}」の資料を削除しますか？\n枠自体は残ります。削除した資料は削除済み一覧から復元できる場合があります。`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await onDeleteDocument(open.slotIndex);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (dialogMode) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-800">
                {dialogMode === "slot"
                  ? "枠を変更"
                  : dialogMode === "period"
                    ? "期（年度）を変更"
                    : "顧問先を変更"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                「{open.slotLabel}」の移動先を選んでください
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {dialogMode === "client" ? (
            <div className="border-b border-slate-100 px-4 py-2">
              <input
                type="text"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="顧問先名・IDで検索"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
            </div>
          ) : null}

          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {dialogMode === "slot"
              ? slotOptions
                  .filter((s) => !s.isCurrent)
                  .map((s) => (
                    <li key={s.slotId}>
                      <button
                        type="button"
                        disabled={busy || s.occupied}
                        onClick={() =>
                          void run({
                            slotId: s.slotId,
                            slotLabel: s.label,
                            destinationLabel: `枠「${s.label}」`,
                          })
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="font-medium text-slate-800">{s.label}</span>
                        {s.occupied ? (
                          <span className="text-[10px] text-rose-600">使用中</span>
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>
                    </li>
                  ))
              : null}

            {dialogMode === "period"
              ? periodOptions
                  .filter((p) => !p.isCurrent)
                  .map((p) => (
                    <li key={p.periodKey}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run({
                            slotId: open.slotId,
                            slotLabel: open.slotLabel,
                            periodKey: p.periodKey,
                            destinationLabel: `期「${p.label}」の同名枠`,
                          })
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        <span className="font-medium text-slate-800">{p.label}</span>
                        <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </li>
                  ))
              : null}

            {dialogMode === "client"
              ? filteredClients.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          slotId: open.slotId,
                          slotLabel: open.slotLabel,
                          clientId: c.id,
                          destinationLabel: `顧問先「${c.name}」の同名枠`,
                        })
                      }
                      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">{c.id}</span>
                    </button>
                  </li>
                ))
              : null}

            {dialogMode === "slot" && slotOptions.every((s) => s.isCurrent || s.occupied) ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">
                空き枠がありません
              </li>
            ) : null}
            {dialogMode === "client" && filteredClients.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">
                該当する顧問先がありません
              </li>
            ) : null}
          </ul>

          <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
            行き先に資料があると移動できません。期・顧問先の移動は同じ枠 ID へ移します。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[70] min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ left: open.x, top: open.y }}
      role="menu"
    >
      <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        資料の操作
      </p>
      {canRelocate ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => setDialogMode("slot")}
          >
            <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
            枠を変更…
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => setDialogMode("period")}
          >
            <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
            期（年度）を変更…
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => setDialogMode("client")}
          >
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            顧問先を変更…
          </button>
        </>
      ) : null}
      {canDelete && onDeleteDocument ? (
        <>
          {canRelocate ? <div className="my-1 border-t border-slate-100" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            onClick={() => void runDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            資料を削除…
          </button>
        </>
      ) : null}
    </div>
  );
}
