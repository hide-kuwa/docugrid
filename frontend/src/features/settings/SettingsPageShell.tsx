"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  APP_ROLES,
  CLIENTS,
  CLIENT_FAMILY_GROUPS,
  DOCUMENT_CATEGORIES,
  STAKEHOLDER_MASTER,
} from "@/config/organization";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { DevSurfaceStrip } from "@/components/dev/DevSurfaceStrip";
import { AuthoringTemplatesPanel } from "@/features/authoring/components/AuthoringTemplatesPanel";
import { BillingSettingsPanel } from "@/features/billing/BillingSettingsPanel";
import { DocuGridAppearancePanel } from "@/features/config/components/DocuGridAppearancePanel";
import { KeyboardShortcutsPanel } from "@/features/config/components/KeyboardShortcutsPanel";
import { FeatureSurfacesPanel } from "@/features/feature-surfaces/FeatureSurfacesPanel";
import { AddonsSettingsTab } from "@/features/addons/AddonsSettingsTab";
import { MessagingChannelsPanel } from "@/features/integrations/MessagingChannelsPanel";
import { McpConnectPanel } from "@/features/mcp/McpConnectPanel";
import { OcrIndexLabPanel } from "@/features/mcp/OcrIndexLabPanel";
import { ReviewChecklistSettingsPanel } from "@/features/review-checklist/ReviewChecklistSettingsPanel";
import { ScreenDesignPanel } from "@/features/screen-design/ScreenDesignPanel";
import { ClientMasterSettingsTab } from "@/features/settings/ClientMasterSettingsTab";
import { StakeholderSettingsTab } from "@/features/settings/StakeholderSettingsTab";
import { RolesSettingsTab } from "@/features/settings/RolesSettingsTab";
import { DocumentsSettingsTab } from "@/features/settings/DocumentsSettingsTab";
import { AuditSettingsTab } from "@/features/settings/AuditSettingsTab";
import { IntegrationsSettingsTab } from "@/features/settings/IntegrationsSettingsTab";
import { GoLiveSetupBanner } from "@/features/settings/GoLiveSetupBanner";
import { GoogleDriveSettingsCard } from "@/features/settings/GoogleDriveSettingsCard";
import { FeatureTourHost } from "@/features/onboarding/FeatureTourHost";
import { groupedSettingsCategories } from "@/features/settings/settings-category-groups";
import {
  SETTINGS_CATEGORIES,
  stakeholderKindLabel,
} from "@/features/settings/settings-categories";
import { useRolePermissionsSettings } from "@/features/settings/hooks/useRolePermissionsSettings";
import { useIntegrationConfig } from "@/features/settings/hooks/useIntegrationConfig";
import { useAuditSettings } from "@/features/settings/hooks/useAuditSettings";
import { useClientMasterSettings } from "@/features/settings/hooks/useClientMasterSettings";
import { useStakeholderMasterSettings } from "@/features/settings/hooks/useStakeholderMasterSettings";
import {
  fetchDocumentTypes,
  toDocumentCategoryConfig,
  type DocumentCategoryConfig,
} from "@/lib/document-types-api";
import { checkSession, loadCurrentUser, type DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";
import {
  canAccessSettingsPage,
  visibleDevSettingsCategories,
  visibleFirmSettingsCategories,
  type SettingsCategoryId,
} from "@/lib/nav-policy";
import {
  resolveSettingsConsole,
  settingsHref,
  type SettingsConsole,
} from "@/lib/app-surface";
import { getPostLoginPath } from "@/lib/persona";

export function SettingsPageShell() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("clients");
  const [billingCheckoutResult, setBillingCheckoutResult] = useState<string | null>(null);
  const [billingTopupResult, setBillingTopupResult] = useState<string | null>(null);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategoryConfig[]>(
    DOCUMENT_CATEGORIES.map((d) => ({
      id: d.id,
      label: d.label,
      ocrTarget: d.ocrTarget,
      dashboardTarget: d.dashboardTarget,
      alertTarget: d.alertTarget,
    })),
  );
  const [currentUser, setCurrentUser] = useState<DocugridUser | null>(null);
  const [settingsConsole, setSettingsConsole] = useState<SettingsConsole>("firm");

  const canEditPlatformSettings = hasPermission(currentUser, "settings.platform");
  const canEditFirmSettings = hasPermission(currentUser, "settings.manage");
  const [goLiveTourId, setGoLiveTourId] = useState<string | null>(null);

  const roleSettings = useRolePermissionsSettings();
  const integration = useIntegrationConfig(canEditPlatformSettings);
  const audit = useAuditSettings(activeCategory === "audit");
  const clientMaster = useClientMasterSettings();
  const stakeholderMaster = useStakeholderMasterSettings();

  const allowedCategories = useMemo(() => {
    const ids =
      settingsConsole === "dev"
        ? visibleDevSettingsCategories(currentUser)
        : visibleFirmSettingsCategories(currentUser);
    return SETTINGS_CATEGORIES.filter((c) => ids.includes(c.id));
  }, [currentUser, settingsConsole]);

  const settingsGroups = useMemo(
    () =>
      groupedSettingsCategories(
        settingsConsole,
        allowedCategories.map((c) => c.id),
      ),
    [settingsConsole, allowedCategories],
  );

  const categoryById = useMemo(
    () => new Map(SETTINGS_CATEGORIES.map((c) => [c.id, c])),
    [],
  );

  const summary = useMemo(
    () => ({
      clients: CLIENTS.length,
      groups: CLIENT_FAMILY_GROUPS.length,
      stakeholders: STAKEHOLDER_MASTER.length,
      roles: APP_ROLES.length,
      documents: documentCategories.length,
    }),
    [documentCategories.length],
  );

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    setSettingsConsole(resolveSettingsConsole(currentUser, params.get("console")));
    const tab = params.get("tab") as SettingsCategoryId | null;
    if (tab) setActiveCategory(tab);
    setBillingCheckoutResult(params.get("checkout"));
    setBillingTopupResult(params.get("topup"));
    const tour = params.get("tour");
    if (tour) {
      window.setTimeout(() => setGoLiveTourId(tour), 400);
    }
    if (params.get("drive_oauth") === "ok" || params.get("drive_oauth") === "error") {
      setActiveCategory("drive");
      setSettingsConsole("firm");
    }
  }, [currentUser]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const id = (event as CustomEvent<{ id?: SettingsCategoryId }>).detail?.id;
      if (!id) return;
      setActiveCategory(id);
      if (id === "drive" || id === "integrations") {
        setSettingsConsole(id === "integrations" ? "dev" : "firm");
      }
    };
    window.addEventListener("docugrid:settings-tab", onTab);
    return () => window.removeEventListener("docugrid:settings-tab", onTab);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const firm = visibleFirmSettingsCategories(currentUser);
    const dev = visibleDevSettingsCategories(currentUser);
    if (settingsConsole === "firm" && firm.length === 0 && dev.length > 0) {
      router.replace(settingsHref("dev"));
    }
  }, [currentUser, router, settingsConsole]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccessSettingsPage(currentUser)) {
      router.replace(getPostLoginPath(currentUser));
    }
  }, [currentUser, router]);

  useEffect(() => {
    if (allowedCategories.length === 0) return;
    if (!allowedCategories.some((c) => c.id === activeCategory)) {
      setActiveCategory(allowedCategories[0].id);
    }
  }, [allowedCategories, activeCategory]);

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session !== "ok") {
        router.replace(session === "offline" ? "/login?reason=offline" : "/login?reason=session");
        return;
      }
      setCurrentUser(loadCurrentUser());
    })();
  }, [router]);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchDocumentTypes();
        if (payload.types.length > 0) {
          setDocumentCategories(payload.types.map(toDocumentCategoryConfig));
        }
      } catch {
        /* fallback: organization.ts DOCUMENT_CATEGORIES */
      }
    })();
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 font-sans text-slate-600">
      {settingsConsole === "dev" ? (
        <DevSurfaceStrip consoleLabel="開発コンフィグ（設計・プラットフォーム）" />
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="relative z-20 flex w-28 shrink-0 flex-col overflow-y-auto border-r border-slate-700 bg-slate-900 shadow-2xl">
          <button
            onClick={() => router.push(getPostLoginPath(currentUser))}
            className="mx-auto mt-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-white hover:bg-slate-700"
          >
            ←
          </button>
          <div className="mt-6 text-center text-[10px] font-black tracking-widest text-blue-400">
            {settingsConsole === "dev" ? "DEV" : "FIRM"}
          </div>
          <div className="mt-2 space-y-1 px-1">
            {visibleFirmSettingsCategories(currentUser).length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSettingsConsole("firm");
                  router.replace(settingsHref("firm"));
                }}
                className={`w-full rounded-lg px-1 py-1 text-[9px] font-bold ${
                  settingsConsole === "firm" ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-white"
                }`}
              >
                運用
              </button>
            ) : null}
            {visibleDevSettingsCategories(currentUser).length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSettingsConsole("dev");
                  router.replace(settingsHref("dev"));
                }}
                className={`w-full rounded-lg px-1 py-1 text-[9px] font-bold ${
                  settingsConsole === "dev" ? "bg-amber-600 text-white" : "text-slate-500 hover:text-white"
                }`}
              >
                開発
              </button>
            ) : null}
          </div>
          <div className="v-drum-scroller no-scrollbar mt-4 flex-1 px-2 py-6">
            {settingsGroups.map((group) => (
              <div key={group.title} className="mb-2">
                <p className="mb-2 px-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {group.title}
                </p>
                {group.ids.map((categoryId) => {
                  const category = categoryById.get(categoryId);
                  if (!category) return null;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={`v-item mb-3 w-full rounded-xl border px-2 py-3 text-center ${
                        activeCategory === category.id
                          ? "active border-blue-500 bg-blue-600/20"
                          : "border-white/10 bg-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="text-xs font-bold">{category.label}</div>
                      <div className="text-[9px] font-semibold opacity-70">{category.subLabel}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mask-v-top pointer-events-none absolute left-0 top-0 z-20 h-20 w-full" />
          <div className="mask-v-bottom pointer-events-none absolute bottom-0 left-0 z-20 h-20 w-full" />
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur">
            <div>
              <h1 className="text-xl font-black text-slate-800">
                {settingsConsole === "dev" ? "開発コンフィグ" : "事務所設定"}
              </h1>
              <p className="text-xs text-slate-500">
                {settingsConsole === "dev"
                  ? "ロール・画面設計・連携など開発用タブ。日常業務はマトリクスから。"
                  : "顧客・担当・ひな形など事務所運用の設定。"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
              {currentUser?.firmLabel && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                  {currentUser.firmLabel}
                </span>
              )}
              <span className="rounded-full bg-blue-50 px-3 py-1">顧客 {summary.clients}</span>
              <span className="rounded-full bg-indigo-50 px-3 py-1">関係グループ {summary.groups}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1">担当 {summary.stakeholders}</span>
              <AuthNavButtons variant="light" />
            </div>
          </header>

          <div className="p-8">
            {settingsConsole === "firm" &&
            (activeCategory === "clients" || activeCategory === "drive") ? (
              <GoLiveSetupBanner
                clientCount={clientMaster.editableClients.length}
                driveConnected={integration.isDriveConnected}
                driveConfigured={
                  integration.driveCredentialsConfigured && Boolean(integration.driveRootFolderId)
                }
                onOpenClients={() => setActiveCategory("clients")}
                onOpenDrive={() => setActiveCategory("drive")}
                onStartTour={() => setGoLiveTourId("go_live_setup")}
              />
            ) : null}

            {activeCategory === "clients" && (
              <ClientMasterSettingsTab
                editableClients={clientMaster.editableClients}
                editableGroups={clientMaster.editableGroups}
                editableRelations={clientMaster.editableRelations}
                onClientsChange={clientMaster.setEditableClients}
                onGroupsChange={clientMaster.setEditableGroups}
                onSave={() => void clientMaster.handleSaveClientMaster(currentUser)}
                isSaving={clientMaster.isSavingClientMaster}
                message={clientMaster.clientMasterMessage}
              />
            )}

            {activeCategory === "clientProfile" && (
              <ClientMasterSettingsTab
                editableClients={clientMaster.editableClients}
                editableGroups={clientMaster.editableGroups}
                editableRelations={clientMaster.editableRelations}
                onClientsChange={clientMaster.setEditableClients}
                onGroupsChange={clientMaster.setEditableGroups}
                onSave={() => void clientMaster.handleSaveClientMaster(currentUser)}
                isSaving={clientMaster.isSavingClientMaster}
                message={clientMaster.clientMasterMessage}
                showProfileEditor
              />
            )}

            {activeCategory === "stakeholders" && (
              <StakeholderSettingsTab
                stakeholders={STAKEHOLDER_MASTER}
                clients={clientMaster.editableClients}
                stakeholderRoles={stakeholderMaster.stakeholderRoles}
                stakeholderScopes={stakeholderMaster.stakeholderScopes}
                appRoles={APP_ROLES}
                kindLabel={stakeholderKindLabel}
                onToggleScope={stakeholderMaster.toggleStakeholderClientScope}
                onRoleChange={(stakeholderId, roleId) =>
                  stakeholderMaster.setStakeholderRoles((prev) => ({ ...prev, [stakeholderId]: roleId }))
                }
                onSave={() => void stakeholderMaster.handleSaveStakeholderMaster()}
                isSaving={stakeholderMaster.isSavingStakeholderMaster}
                message={stakeholderMaster.stakeholderMasterMessage}
              />
            )}

            {activeCategory === "roles" && (
              <RolesSettingsTab
                editableRoles={roleSettings.editableRoles}
                isLoadingRolePermissions={roleSettings.isLoadingRolePermissions}
                isSavingRolePermissions={roleSettings.isSavingRolePermissions}
                rolePermissionsMessage={roleSettings.rolePermissionsMessage}
                canEditPlatformSettings={canEditPlatformSettings}
                onTogglePermission={roleSettings.handleToggleRolePermission}
                onSave={() => void roleSettings.handleSaveRolePermissions()}
              />
            )}

            {activeCategory === "documents" && (
              <DocumentsSettingsTab
                documentCategories={documentCategories}
                ocrAutoExtractEnabled={integration.ocrAutoExtractEnabled}
                onOcrAutoExtractChange={integration.setOcrAutoExtractEnabled}
              />
            )}

            {activeCategory === "templates" && (
              <>
                <p className="mb-4 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                  判定フローは別ページです。レールの <strong>判定</strong>、または{" "}
                  <Link href="/flowchart" className="font-bold underline">
                    判定ページ
                  </Link>
                  。文書ひな形の本編はレールの <strong>ひな形</strong> でも開けます。
                </p>
                <AuthoringTemplatesPanel currentUser={currentUser} />
              </>
            )}

            {activeCategory === "reviewChecklist" && (
              <section className="fade-in-up">
                <ReviewChecklistSettingsPanel currentUser={currentUser} />
              </section>
            )}

            {activeCategory === "shortcuts" && (
              <section className="fade-in-up">
                <KeyboardShortcutsPanel />
              </section>
            )}

            {activeCategory === "appearance" && (
              <section className="fade-in-up">
                <DocuGridAppearancePanel />
              </section>
            )}

            {activeCategory === "billing" && (
              <section className="fade-in-up">
                <BillingSettingsPanel
                  checkoutResult={billingCheckoutResult}
                  topupResult={billingTopupResult}
                  isPlatformAdmin={canEditPlatformSettings}
                />
              </section>
            )}

            {activeCategory === "screens" && <ScreenDesignPanel />}
            {activeCategory === "featureSurfaces" && <FeatureSurfacesPanel />}
            {activeCategory === "addons" && (
              <AddonsSettingsTab
                isPlatformAdmin={canEditPlatformSettings}
                consoleKind={settingsConsole}
              />
            )}

            {activeCategory === "audit" && (
              <AuditSettingsTab
                editableClients={clientMaster.editableClients}
                auditRows={audit.auditRows}
                auditLoading={audit.auditLoading}
                auditMessage={audit.auditMessage}
                auditResultFilter={audit.auditResultFilter}
                onAuditResultFilterChange={audit.setAuditResultFilter}
                auditActionFilter={audit.auditActionFilter}
                onAuditActionFilterChange={audit.setAuditActionFilter}
                auditPathFilter={audit.auditPathFilter}
                onAuditPathFilterChange={audit.setAuditPathFilter}
                auditClientFilter={audit.auditClientFilter}
                onAuditClientFilterChange={audit.setAuditClientFilter}
                auditStakeholderFilter={audit.auditStakeholderFilter}
                onAuditStakeholderFilterChange={audit.setAuditStakeholderFilter}
                auditFromDate={audit.auditFromDate}
                onAuditFromDateChange={audit.setAuditFromDate}
                auditToDate={audit.auditToDate}
                onAuditToDateChange={audit.setAuditToDate}
                reviewExportClientId={audit.reviewExportClientId}
                onReviewExportClientIdChange={audit.setReviewExportClientId}
                reviewExportPeriodKey={audit.reviewExportPeriodKey}
                onReviewExportPeriodKeyChange={audit.setReviewExportPeriodKey}
                reviewExportMessage={audit.reviewExportMessage}
                reviewExportLoading={audit.reviewExportLoading}
                reviewTimelineRows={audit.reviewTimelineRows}
                reviewTimelineLoading={audit.reviewTimelineLoading}
                reviewTimelineMessage={audit.reviewTimelineMessage}
                onReviewExport={(format) => void audit.handleReviewExport(format)}
                onLoadReviewTimeline={() => void audit.loadReviewTimeline()}
                onLoadAuditEvents={(actionOverride) => void audit.loadAuditEvents(actionOverride)}
                onDownloadAuditCsv={audit.handleDownloadAuditCsv}
              />
            )}

            {activeCategory === "mcp" && (
              <section className="fade-in-up space-y-8">
                <McpConnectPanel user={currentUser} embedded />
                <OcrIndexLabPanel />
              </section>
            )}

            {activeCategory === "messaging" && (
              <section className="fade-in-up space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">通知連携</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    メール・Slack・LINE をログイン後にノーコードで接続します。未設定のチャネルには通知を送れません。
                  </p>
                </div>
                <MessagingChannelsPanel />
              </section>
            )}

            {activeCategory === "drive" && (
              <section className="fade-in-up space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Google Drive</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    事務所全体の保管庫として Drive を1つ接続します。ログイン用 Google
                    と分けても構いません。接続は所長・設定担当のみ。
                  </p>
                </div>
                <GoogleDriveSettingsCard
                  canEdit={canEditFirmSettings}
                  isDriveConnected={integration.isDriveConnected}
                  setIsDriveConnected={integration.setIsDriveConnected}
                  driveRootFolderId={integration.driveRootFolderId}
                  setDriveRootFolderId={integration.setDriveRootFolderId}
                  driveCredentialsConfigured={integration.driveCredentialsConfigured}
                  driveMode={integration.driveMode}
                  driveServiceAccountEmail={integration.driveServiceAccountEmail}
                  driveAuthMethod={integration.driveAuthMethod}
                  driveConnectedEmail={integration.driveConnectedEmail}
                  driveOauthAvailable={integration.driveOauthAvailable}
                  driveRootLocation={integration.driveRootLocation}
                  driveSharedDriveName={integration.driveSharedDriveName}
                  driveOfficeVisible={integration.driveOfficeVisible}
                  driveNeedsOfficeShare={integration.driveNeedsOfficeShare}
                  driveSharedMemberEmails={integration.driveSharedMemberEmails}
                  driveEligibleMemberEmails={integration.driveEligibleMemberEmails}
                  driveOfficeHints={integration.driveOfficeHints}
                  sharedDrivesEmptyHint={integration.sharedDrivesEmptyHint}
                  sharedDrives={integration.sharedDrives}
                  selectedSharedDriveId={integration.selectedSharedDriveId}
                  setSelectedSharedDriveId={integration.setSelectedSharedDriveId}
                  isLoadingSharedDrives={integration.isLoadingSharedDrives}
                  isApplyingSharedDrive={integration.isApplyingSharedDrive}
                  isSharingWithFirm={integration.isSharingWithFirm}
                  isStartingDriveOauth={integration.isStartingDriveOauth}
                  isTestingDrive={integration.isTestingDrive}
                  driveTestMessage={integration.driveTestMessage}
                  isUploadingDriveCredentials={integration.isUploadingDriveCredentials}
                  isLoadingConfig={integration.isLoadingConfig}
                  isSavingConfig={integration.isSavingConfig}
                  configMessage={integration.configMessage}
                  onSave={() => void integration.handleSaveIntegrationConfig()}
                  onTest={() => void integration.handleTestDriveConnection()}
                  onUploadCredentials={(f) => void integration.handleUploadDriveCredentials(f)}
                  onStartOauth={() => void integration.handleStartDriveOauth()}
                  onDisconnectOauth={() => void integration.handleDisconnectDriveOauth()}
                  onLoadSharedDrives={() => void integration.handleLoadSharedDrives()}
                  onUseSharedDrive={() => void integration.handleUseSharedDrive()}
                  onShareWithFirm={() => void integration.handleShareWithFirm()}
                />
              </section>
            )}

            {activeCategory === "integrations" && (
              <IntegrationsSettingsTab
                {...integration}
                canEditPlatformSettings={canEditPlatformSettings}
              />
            )}
          </div>
        </main>
      </div>
      <FeatureTourHost
        user={currentUser}
        triggerTourId={goLiveTourId}
        onTriggerConsumed={() => setGoLiveTourId(null)}
      />
    </div>
  );
}
