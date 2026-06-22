import { create } from "zustand";

export type AuditPhase = "idle" | "navigating" | "viewer" | "preview" | "stamped";

export type AutoVouchAuditContext = {
  fieldId: string;
  fieldLabel?: string;
  targetValue: string;
  contextHint?: string;
  metricKey?: string;
  metricLabel?: string;
  documentLabel?: string;
  openPanel?: boolean;
  /** CHARTS 等の指標から監査ビューへ直行 */
  fromMetricVouch?: boolean;
  /** CHARTS 側 pendingMetricKey と同じキー */
  pendingKey?: string;
};

/** @deprecated use AutoVouchAuditContext */
export type AutoVouchPrefill = AutoVouchAuditContext;

type AutoVouchBridgeState = {
  prefill: AutoVouchAuditContext | null;
  activeContext: AutoVouchAuditContext | null;
  pendingMetricKey: string | null;
  auditPhase: AuditPhase;
  /** pendingKey → スタンプ完了時刻 (ms) */
  stampedKeys: Record<string, number>;
  setPrefill: (prefill: AutoVouchAuditContext | null) => void;
  setPendingMetricKey: (metricKey: string | null) => void;
  setAuditPhase: (phase: AuditPhase) => void;
  consumePrefill: () => AutoVouchAuditContext | null;
  clearActiveContext: () => void;
  markMetricStamped: (pendingKey: string) => void;
  isMetricStamped: (pendingKey: string) => boolean;
  resetAuditSession: () => void;
};

const STAMP_TTL_MS = 60 * 60 * 1000;

export const useAutoVouchBridgeStore = create<AutoVouchBridgeState>((set, get) => ({
  prefill: null,
  activeContext: null,
  pendingMetricKey: null,
  auditPhase: "idle",
  stampedKeys: {},
  setPrefill: (prefill) =>
    set({
      prefill,
      activeContext: prefill?.fromMetricVouch ? prefill : get().activeContext,
    }),
  setPendingMetricKey: (pendingMetricKey) => set({ pendingMetricKey }),
  setAuditPhase: (auditPhase) => set({ auditPhase }),
  consumePrefill: () => {
    const current = get().prefill;
    set({
      prefill: null,
      activeContext: current ?? get().activeContext,
      auditPhase: current ? "viewer" : get().auditPhase,
    });
    return current;
  },
  clearActiveContext: () =>
    set({ activeContext: null, auditPhase: "idle", pendingMetricKey: null }),
  markMetricStamped: (pendingKey) => {
    const ctx = get().activeContext;
    set((state) => ({
      auditPhase: "stamped",
      pendingMetricKey: null,
      stampedKeys: { ...state.stampedKeys, [pendingKey]: Date.now() },
      activeContext: ctx
        ? { ...ctx, pendingKey }
        : state.activeContext,
    }));
  },
  isMetricStamped: (pendingKey) => {
    const ts = get().stampedKeys[pendingKey];
    if (!ts) return false;
    return Date.now() - ts < STAMP_TTL_MS;
  },
  resetAuditSession: () =>
    set({
      prefill: null,
      activeContext: null,
      pendingMetricKey: null,
      auditPhase: "idle",
      stampedKeys: {},
    }),
}));
