import { useEffect, useState } from "react";
import { AuditTarget, EnhancedDocVersion, INITIAL_HISTORY, WorkflowStatus } from "../types";

export type WorkflowEventType =
  | "work_save"
  | "request_review"
  | "audit_start"
  | "audit_suspend"
  | "remand"
  | "approve";

export type WorkflowEventInput = {
  eventType: WorkflowEventType;
  status: WorkflowStatus;
  actionTitle: string;
  versionLabel: string;
  reason?: string;
  isMajor: boolean;
};

type UseAuditWorkflowParams = {
  file: File | null;
  pdfUrl: string | null;
  isOpen: boolean;
  onAuditStart: () => void;
  onAuditEnd: () => void;
  /** 操作者の表示名（実ログインユーザー）。未指定時はフォールバック表示。 */
  actorLabel?: string;
  /** サーバーから復元した履歴（最新が先頭）。 */
  initialHistory?: EnhancedDocVersion[] | null;
  /** スロットの review_events 上の最新 status（履歴未作成時のフォールバック） */
  slotWorkflowStatus?: string;
  /** ワークフロー操作のたびに呼ばれ、サーバーへ永続化する。 */
  onEvent?: (event: WorkflowEventInput) => void;
};

type CreateNewVersionParams = {
  type: "minor" | "major" | "audit_start";
  eventType: WorkflowEventType;
  actionTitle: string;
  status: WorkflowStatus;
  reason?: string;
};

export const useAuditWorkflow = ({
  file,
  pdfUrl,
  isOpen,
  onAuditStart,
  onAuditEnd,
  actorLabel,
  initialHistory,
  slotWorkflowStatus,
  onEvent,
}: UseAuditWorkflowParams) => {
  const actor = actorLabel && actorLabel.trim() ? actorLabel : "操作者";
  const [history, setHistory] = useState<EnhancedDocVersion[]>(INITIAL_HISTORY);
  const [activeVerIdx, setActiveVerIdx] = useState(0);
  const [actionsLog, setActionsLog] = useState<string[]>([]);
  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<WorkflowStatus>(INITIAL_HISTORY[0].status);

  // サーバー復元履歴が届いたら反映（最新が先頭）。
  useEffect(() => {
    if (initialHistory && initialHistory.length > 0) {
      setHistory(initialHistory);
    }
  }, [initialHistory]);

  useEffect(() => {
    if (isOpen) {
      setActiveVerIdx(0);
      setExpandedHistoryIdx(null);
      const fromHistory = history[0]?.status ?? INITIAL_HISTORY[0].status;
      const fromServer = slotWorkflowStatus as WorkflowStatus | undefined;
      const validServer =
        fromServer &&
        ["draft", "review_pending", "auditing", "done", "rejected", "fix"].includes(fromServer);
      setCurrentStatus(
        fromHistory === "draft" && validServer ? (fromServer as WorkflowStatus) : fromHistory,
      );
    }
  }, [isOpen, history, slotWorkflowStatus]);

  useEffect(() => {
    if (isOpen && file) {
      setHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory.length > 0) newHistory[0] = { ...newHistory[0], file: file };
        return newHistory;
      });
      if (activeVerIdx === 0 && actionsLog.length > 0) {
        setActionsLog([]);
      }
    }
  }, [isOpen, file, pdfUrl, activeVerIdx, actionsLog]);

  const recordAction = (newFile: File | void, actionName: string, target: AuditTarget = "primary") => {
    if (!newFile) return;
    setActionsLog((prev) => [actionName, ...prev]);
    if (target === "primary") {
      setHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory.length > 0) newHistory[0] = { ...newHistory[0], file: newFile as File };
        return newHistory;
      });
    }
  };

  const createNewVersion = ({ type, eventType, actionTitle, status, reason }: CreateNewVersionParams) => {
    if (!file) return;
    const date = new Date().toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isMajor = type === "major" || type === "audit_start";
    let emittedVerStr = "";

    setHistory((prev) => {
      const currentVerStr = prev[0]?.ver ?? "v1.0.0";
      const parts = currentVerStr.replace("v", "").split(".").map(Number);
      let [major, minor, patch] = parts.length === 3 ? parts : [1, 0, 0];

      if (type === "audit_start") {
        major = 2;
        minor = 0;
        patch = 0;
      } else if (type === "major") {
        major += 1;
        minor = 0;
        patch = 0;
      } else {
        minor += 1;
        patch = 0;
      }

      const newVerStr = `v${major}.${minor}.${patch}`;
      emittedVerStr = newVerStr;
      const logsToSave = actionsLog.length > 0 ? [...actionsLog] : ["変更なし"];

      const newVersion: EnhancedDocVersion = {
        ver: newVerStr,
        date,
        user: actor,
        action: actionTitle,
        status,
        file: file,
        actionsLog: logsToSave,
        isMajor,
        versionId: crypto.randomUUID(),
      };
      return [newVersion, ...prev];
    });
    setActionsLog([]);
    setActiveVerIdx(0);
    setIsHistoryOpen(true);
    setCurrentStatus(status);

    onEvent?.({
      eventType,
      status,
      actionTitle,
      versionLabel: emittedVerStr,
      reason,
      isMajor,
    });
  };

  const handleWorkSave = () => {
    createNewVersion({
      type: "minor",
      eventType: "work_save",
      actionTitle: `作業保存 (${actionsLog.length}件の変更)`,
      status: "fix",
    });
  };

  const handleRequestReview = () => {
    if (confirm("承認依頼を出しますか？")) {
      createNewVersion({
        type: "minor",
        eventType: "request_review",
        actionTitle: "承認依頼 (監査待ち)",
        status: "review_pending",
      });
    }
  };

  const handleStartAudit = () => {
    createNewVersion({
      type: "audit_start",
      eventType: "audit_start",
      actionTitle: "監査開始",
      status: "auditing",
    });
    onAuditStart();
  };

  const handleAuditSuspend = () => {
    createNewVersion({
      type: "minor",
      eventType: "audit_suspend",
      actionTitle: "監査中断 (一時保存)",
      status: "auditing",
    });
  };

  const handleRemand = () => {
    const reason = prompt("差戻しの理由を入力してください", "修正が必要です");
    if (reason) {
      createNewVersion({
        type: "minor",
        eventType: "remand",
        actionTitle: `差戻: ${reason}`,
        status: "rejected",
        reason,
      });
      onAuditEnd();
    }
  };

  const handleApprove = () => {
    if (confirm("この内容で承認し、次のフローへ進みますか？")) {
      createNewVersion({
        type: "major",
        eventType: "approve",
        actionTitle: "承認完了",
        status: "done",
      });
      onAuditEnd();
    }
  };

  return {
    history,
    activeVerIdx,
    setActiveVerIdx,
    actionsLog,
    currentStatus,
    expandedHistoryIdx,
    setExpandedHistoryIdx,
    isHistoryOpen,
    setIsHistoryOpen,
    recordAction,
    handleWorkSave,
    handleRequestReview,
    handleStartAudit,
    handleAuditSuspend,
    handleRemand,
    handleApprove,
  };
};
