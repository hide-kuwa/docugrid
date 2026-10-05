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
import { MigrationIngestPanel } from "@/features/settings/MigrationIngestPanel";
import { GoogleDriveSettingsCard } from "@/features/settings/GoogleDriveSettingsCard";
import { WorkAssistantFab } from "@/features/assistant/WorkAssistantFab";
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
  const [profileFocusClientId, setProfileFocusClientId] = useState<string | undefined>();
  const [showMigrationPanel, setShowMigrationPanel] = useState(false);
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
  const [authChecked, setAuthChecked] = useState(false);
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
      setAuthChecked(true);
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

  const canShowActiveCategory =
    authChecked &&
    Boolean(currentUser) &&
    allowedCategories.some((c) => c.id === activeCategory);

  if (!authChecked) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
          aria-hidden
        />
        <p className="text-sm font-medium">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 font-sans text-slate-600 pb-[env(safe-area-inset-bottom)]">
      {settingsConsole === "dev" ? (
        <DevSurfaceStrip consoleLabel="開発コンフィグ（設計・プラットフォーム）" />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="relative z-20 flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden border-b border-slate-700 bg-slate-900 shadow-2xl md:max-h-none md:w-28 md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:flex-col md:px-0 md:pt-4">
            <button
              onClick={() => router.push(getPostLoginPath(currentUser))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-white hover:bg-slate-700 md:mx-auto"
            >
              ←
            </button>
            <div className="min-w-0 flex-1 md:mt-6 md:w-full md:flex-none md:text-center">
              <div className="text-[10px] font-black tracking-widest text-blue-400">
                {settingsConsole === "dev" ? "DEV" : "FIRM"}
              </div>
              <div className="mt-1 flex gap-1 md:mt-2 md:flex-col md:space-y-1 md:px-1">
                {visibleFirmSettingsCategories(currentUser).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsConsole("firm");
                      router.replace(settingsHref("firm"));
                    }}
                    className={`rounded-lg px-2 py-1 text-[9px] font-bold md:w-full md:px-1 ${
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
                    className={`rounded-lg px-2 py-1 text-[9px] font-bold md:w-full md:px-1 ${
                      settingsConsole === "dev" ? "bg-amber-600 text-white" : "text-slate-500 hover:text-white"
                    }`}
                  >
                    開発
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-3 pb-3 md:mt-4 md:flex-1 md:flex-col md:overflow-y-auto md:px-2 md:py-6 md:pb-6">
            {settingsGroups.map((group) => (
              <div key={group.title} className="flex shrink-0 gap-2 md:mb-2 md:block">
                <p className="mb-2 hidden px-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 md:block">
                  {group.title}
                </p>
                {group.ids.map((categoryId) => {
                  const category = categoryById.get(categoryId);
                  if (!category) return null;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={`min-w-[5.5rem] rounded-xl border px-2 py-2.5 text-center md:mb-3 md:w-full md:min-w-0 md:py-3 ${
                        activeCategory === category.id
                          ? "border-blue-500 bg-blue-600/20 text-white"
                          : "border-white/10 bg-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="text-[11px] font-bold md:text-xs">{category.label}</div>
                      <div className="hidden text-[9px] font-semibold opacity-70 md:block">{category.subLabel}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mask-v-top pointer-events-none absolute left-0 top-0 z-20 hidden h-20 w-full md:block" />
          <div className="mask-v-bottom pointer-events-none absolute bottom-0 left-0 z-20 hidden h-20 w-full md:block" />
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-base font-black text-slate-800 md:text-lg">
                {settingsConsole === "dev" ? "開発コンフィグ" : "事務所設定"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
                {currentUser?.firmLabel && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                    {currentUser.firmLabel}
                  </span>
                )}
                {currentUser?.name && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
                    {currentUser.name}
                  </span>
                )}
                <AuthNavButtons variant="light" />
              </div>
            </div>
          </header>

          <div className="px-4 pt-3 text-xs text-slate-500 md:px-8">
            {settingsConsole === "dev"
              ? "ロール・画面設計・連携など開発用タブ。日常業務はマトリクスから。"
              : "顧客・担当・ひな形など事務所運用の設定。"}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
              <span className="rounded-full bg-blue-50 px-3 py-1">顧客 {summary.clients}</span>
              <span className="hidden rounded-full bg-indigo-50 px-3 py-1 sm:inline">
                関係グループ {summary.groups}
              </span>
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 sm:inline">
                担当 {summary.stakeholders}
              </span>
            </div>
          </div>

          <div className="p-4 md:p-8">
            {canShowActiveCategory && activeCategory === "clients" && (
              <ClientMasterSettingsTab
                editableClients={clientMaster.editableClients}
                editableGroups={clientMaster.editableGroups}
                editableRelations={clientMaster.editableRelations}
                onClientsChange={clientMaster.setEditableClients}
                onGroupsChange={clientMaster.setEditableGroups}
                onSave={() => void clientMaster.handleSaveClientMaster(currentUser)}
                isSaving={clientMaster.isSavingClientMaster}
                message={clientMaster.clientMasterMessage}
                stakeholders={STAKEHOLDER_MASTER}
                stakeholderScopes={stakeholderMaster.stakeholderScopes}
                onOpenClientProfile={(clientId) => {
                  setProfileFocusClientId(clientId);
                  setActiveCategory("clientProfile");
                }}
              />
            )}

            {canShowActiveCategory && activeCategory === "clientProfile" && (
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
                profileClientId={profileFocusClientId}
                stakeholders={STAKEHOLDER_MASTER}
                stakeholderScopes={stakeholderMaster.stakeholderScopes}
                onToggleAssignee={stakeholderMaster.toggleStakeholderClientScope}
                onSaveAssignees={() => void stakeholderMaster.handleSaveStakeholderMaster()}
                assigneesSaving={stakeholderMaster.isSavingStakeholderMaster}
                assigneesMessage={stakeholderMaster.stakeholderMasterMessage}
              />
            )}

            {canShowActiveCategory && activeCategory === "stakeholders" && (
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

            {canShowActiveCategory && activeCategory === "roles" && (
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

            {canShowActiveCategory && activeCategory === "documents" && (
              <DocumentsSettingsTab
                documentCategories={documentCategories}
                ocrAutoExtractEnabled={integration.ocrAutoExtractEnabled}
                onOcrAutoExtractChange={integration.setOcrAutoExtractEnabled}
              />
            )}

            {canShowActiveCategory && activeCategory === "templates" && (
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

            {canShowActiveCategory && activeCategory === "reviewChecklist" && (
              <section className="fade-in-up">
                <ReviewChecklistSettingsPanel currentUser={currentUser} />
              </section>
            )}

            {canShowActiveCategory && activeCategory === "shortcuts" && (
              <section className="fade-in-up">
                <KeyboardShortcutsPanel />
              </section>
            )}

            {canShowActiveCategory && activeCategory === "appearance" && (
              <section className="fade-in-up">
                <DocuGridAppearancePanel />
              </section>
            )}

            {canShowActiveCategory && activeCategory === "billing" && (
              <section className="fade-in-up">
                <BillingSettingsPanel
                  checkoutResult={billingCheckoutResult}
                  topupResult={billingTopupResult}
                  isPlatformAdmin={canEditPlatformSettings}
                />
              </section>
            )}

            {canShowActiveCategory && activeCategory === "screens" && <ScreenDesignPanel />}
            {canShowActiveCategory && activeCategory === "featureSurfaces" && <FeatureSurfacesPanel />}
            {canShowActiveCategory && activeCategory === "addons" && (
              <AddonsSettingsTab
                isPlatformAdmin={canEditPlatformSettings}
                consoleKind={settingsConsole}
              />
            )}

            {canShowActiveCategory && activeCategory === "audit" && (
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

            {canShowActiveCategory && activeCategory === "mcp" && (
              <section className="fade-in-up space-y-8">
                <McpConnectPanel user={currentUser} embedded />
                <OcrIndexLabPanel />
              </section>
            )}

            {canShowActiveCategory && activeCategory === "messaging" && (
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

            {canShowActiveCategory && activeCategory === "drive" && (
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

            {canShowActiveCategory && activeCategory === "integrations" && (
              <IntegrationsSettingsTab
                {...integration}
                canEditPlatformSettings={canEditPlatformSettings}
              />
            )}

            {canShowActiveCategory &&
            settingsConsole === "firm" &&
            (activeCategory === "clients" || activeCategory === "drive") ? (
              <div className="mt-8 space-y-4 border-t border-dashed border-slate-200 pt-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  本格稼働のセットアップ（あまり使わない）
                </p>
                {showMigrationPanel && activeCategory === "clients" ? (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowMigrationPanel(false)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        初回整理パネルを閉じる
                      </button>
                    </div>
                    <MigrationIngestPanel
                      clients={clientMaster.editableClients}
                      canEdit={canEditFirmSettings}
                    />
                  </div>
                ) : null}
                <GoLiveSetupBanner
                  clientCount={clientMaster.editableClients.length}
                  driveConnected={integration.isDriveConnected}
                  driveConfigured={
                    integration.driveCredentialsConfigured && Boolean(integration.driveRootFolderId)
                  }
                  onOpenClients={() => {
                    setShowMigrationPanel(false);
                    setActiveCategory("clients");
                  }}
                  onOpenMigration={() => {
                    setActiveCategory("clients");
                    setShowMigrationPanel(true);
                  }}
                  onOpenDrive={() => setActiveCategory("drive")}
                  onStartTour={() => setGoLiveTourId("go_live_setup")}
                />
              </div>
            ) : null}
          </div>
        </main>
      </div>
      <FeatureTourHost
        user={currentUser}
        triggerTourId={goLiveTourId}
        onTriggerConsumed={() => setGoLiveTourId(null)}
      />
      <WorkAssistantFab
        enabled={
          Boolean(currentUser) &&
          (hasPermission(currentUser, "document.view") ||
            hasPermission(currentUser, "dashboard.view"))
        }
      />
    </div>
  );
}
