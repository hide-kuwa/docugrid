"use client";

import { useCallback, useEffect, useState } from "react";
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
import { ClientPayrollPanel } from "@/features/payroll/ClientPayrollPanel";
import { DataContextGrid } from "@/features/client-data/DataContextGrid";
import type { DataWorkspaceTabId } from "@/features/client-data/data-workspace-tabs";
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
}: Props) {
  const [activeTab, setActiveTab] = useState<DataWorkspaceTabId>("master");
  const [client, setClient] = useState(clientFromOrg);

  useEffect(() => {
    setClient(clientFromOrg);
  }, [clientFromOrg]);

  useEffect(() => {
    setActiveTab("master");
  }, [client.id]);

  const refreshClient = useCallback(async () => {
    const fresh = await fetchClientById(clientFromOrg.id);
    if (fresh) setClient(fresh);
  }, [clientFromOrg.id]);

  useSsotPropagateReload(clientFromOrg.id, () => void refreshClient(), ssotHasAnyChanges);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataContextGrid activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "master" ? (
          <ClientDataOverview
            client={client}
            canEdit={canEdit}
            editor={editor}
            filledSlotKeys={filledSlotKeys}
            onOpenRelatedDocument={onOpenRelatedDocument}
          />
        ) : null}
        {activeTab === "charts" ? (
          <ClientChartsPanel
            client={client}
            canEdit={canEdit}
            onOpenMetricVouch={onOpenMetricVouch}
          />
        ) : null}
        {activeTab === "progress" ? (
          <ClientProgressPanel
            client={client}
            canEdit={canEdit}
            docStatus={docStatus}
            docStatusLoading={docStatusLoading}
          />
        ) : null}
        {activeTab === "payroll" ? (
          <ClientPayrollPanel client={client} canEdit={canEdit} />
        ) : null}
        {activeTab === "stockValuation" ? (
          <ClientStockValuationPanel client={client} canEdit={canEdit} />
        ) : null}
        {activeTab === "communications" ? (
          <ClientCommunicationsPanel client={client} canEdit={canEdit} />
        ) : null}
        {activeTab === "investigations" ? (
          <ClientInvestigationsPanel client={client} canEdit={canEdit} />
        ) : null}
        {activeTab === "special" ? (
          <ClientSpecialNotesPanel client={client} canEdit={canEdit} />
        ) : null}
      </div>
    </div>
  );
}

export { profileFillPercent } from "@/features/client-data/ClientDataOverview";
