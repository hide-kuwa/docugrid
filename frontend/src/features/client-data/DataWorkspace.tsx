"use client";

import { useCallback, useEffect, useState } from "react";
import { Construction } from "lucide-react";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import type { OrgClient } from "@/config/organization";
import { ClientChartsPanel } from "@/features/client-data/ClientChartsPanel";
import { ClientCommunicationsPanel } from "@/features/client-data/ClientCommunicationsPanel";
import { ClientDataOverview } from "@/features/client-data/ClientDataOverview";
import { ClientProgressPanel } from "@/features/client-data/ClientProgressPanel";
import { ClientInvestigationsPanel } from "@/features/client-data/ClientInvestigationsPanel";
import type { DocumentStatusSummary } from "@/features/docugrid/lib/document-status";
import { ClientStockValuationPanel } from "@/features/client-data/ClientStockValuationPanel";
import { ClientSpecialNotesPanel } from "@/features/client-data/ClientSpecialNotesPanel";
import { ClientKartePanel } from "@/features/client-data/ClientKartePanel";
import { ClientPayrollPanel } from "@/features/payroll/ClientPayrollPanel";
import { ClientRelationsPanel } from "@/features/client-data/ClientRelationsPanel";
import { ClientFamilyTreePanel } from "@/features/client-data/ClientFamilyTreePanel";
import { DataContextGrid } from "@/features/client-data/DataContextGrid";
import { KarteSectionWipPanel } from "@/features/client-data/KarteSectionWipPanel";
import {
  KARTE_SECTION_TABS,
  isKarteSectionLive,
  type DataWorkspaceTab,
  type DataWorkspaceTabId,
} from "@/features/client-data/data-workspace-tabs";
import {
  ssotHasAnyChanges,
  useSsotPropagateReload,
} from "@/features/client-data/hooks/use-ssot-propagate-reload";
import type { FieldChangeActor } from "@/lib/client-field-mutations";
import { fetchClientById } from "@/lib/client-master-api";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  editor?: FieldChangeActor;
  filledSlotKeys?: ReadonlySet<string>;
  onOpenRelatedDocument?: (ref: RelatedDocumentRef) => void;
  onOpenMetricVouch?: (metricKey: string, valueYen: number) => void;
  docStatus?: DocumentStatusSummary | null;
  docStatusLoading?: boolean;
  /** マトリクスの期キー（カルテの期フィールド既定） */
  defaultPeriodKey?: string;
  /** レール連動時は制御コンポーネント（縦ドラムから渡す） */
  activeTab?: DataWorkspaceTabId;
  onTabChange?: (tab: DataWorkspaceTabId) => void;
  /** レールが同階層にあるとき、上部ドラムを隠す（ナビは左縦ドラム） */
  hideTabDrum?: boolean;
  /** 関係図でノードをクリックしたときに顧問先を切替 */
  onSelectRelatedClient?: (clientId: string) => void;
};

const FALLBACK_WIP_TAB: DataWorkspaceTab = {
  id: "karte",
  label: "セクション",
  subLabel: "WIP",
  description: "準備中のセクションです。",
  icon: Construction,
  status: "planned",
};

export function DataWorkspace({
  client: clientFromOrg,
  canEdit,
  editor,
  filledSlotKeys,
  onOpenRelatedDocument,
  onOpenMetricVouch,
  docStatus,
  docStatusLoading,
  defaultPeriodKey,
  activeTab: controlledTab,
  onTabChange,
  hideTabDrum = false,
  onSelectRelatedClient,
}: Props) {
  const [uncontrolledTab, setUncontrolledTab] = useState<DataWorkspaceTabId>("master");
  const [client, setClient] = useState(clientFromOrg);
  const activeTab = controlledTab ?? uncontrolledTab;

  const setActiveTab = useCallback(
    (tab: DataWorkspaceTabId) => {
      if (onTabChange) onTabChange(tab);
      else setUncontrolledTab(tab);
    },
    [onTabChange],
  );

  useEffect(() => {
    setClient(clientFromOrg);
  }, [clientFromOrg]);

  useEffect(() => {
    if (controlledTab == null) setUncontrolledTab("master");
  }, [client.id, controlledTab]);

  const refreshClient = useCallback(async () => {
    const fresh = await fetchClientById(clientFromOrg.id);
    if (fresh) setClient(fresh);
  }, [clientFromOrg.id]);

  useSsotPropagateReload(clientFromOrg.id, () => void refreshClient(), ssotHasAnyChanges);

  const showLive = isKarteSectionLive(activeTab);
  const wipTab = KARTE_SECTION_TABS.find((t) => t.id === activeTab) ?? FALLBACK_WIP_TAB;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hideTabDrum ? null : (
        <DataContextGrid activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!showLive ? <KarteSectionWipPanel tab={wipTab} /> : null}
        {showLive && activeTab === "master" ? (
          <ClientDataOverview
            client={client}
            canEdit={canEdit}
            editor={editor}
            filledSlotKeys={filledSlotKeys}
            onOpenRelatedDocument={onOpenRelatedDocument}
          />
        ) : null}
        {showLive && activeTab === "relations" ? (
          <ClientRelationsPanel
            client={client}
            canEdit={canEdit}
            onFocusClient={onSelectRelatedClient}
          />
        ) : null}
        {showLive && activeTab === "familyTree" ? (
          <ClientFamilyTreePanel
            client={client}
            canEdit={canEdit}
            onFocusClient={onSelectRelatedClient}
          />
        ) : null}
        {showLive && activeTab === "charts" ? (
          <ClientChartsPanel
            client={client}
            canEdit={canEdit}
            onOpenMetricVouch={onOpenMetricVouch}
          />
        ) : null}
        {showLive && activeTab === "progress" ? (
          <ClientProgressPanel
            client={client}
            canEdit={canEdit}
            docStatus={docStatus}
            docStatusLoading={docStatusLoading}
          />
        ) : null}
        {showLive && activeTab === "payroll" ? (
          <ClientPayrollPanel client={client} canEdit={canEdit} />
        ) : null}
        {showLive && activeTab === "stockValuation" ? (
          <ClientStockValuationPanel client={client} canEdit={canEdit} />
        ) : null}
        {showLive && activeTab === "communications" ? (
          <ClientCommunicationsPanel client={client} canEdit={canEdit} />
        ) : null}
        {showLive && activeTab === "investigations" ? (
          <ClientInvestigationsPanel client={client} canEdit={canEdit} />
        ) : null}
        {showLive && activeTab === "special" ? (
          <ClientSpecialNotesPanel client={client} canEdit={canEdit} />
        ) : null}
        {showLive && activeTab === "karte" ? (
          <ClientKartePanel
            client={client}
            canEdit={canEdit}
            defaultPeriodKey={defaultPeriodKey}
          />
        ) : null}
      </div>
    </div>
  );
}

export { profileFillPercent } from "@/features/client-data/ClientDataOverview";
