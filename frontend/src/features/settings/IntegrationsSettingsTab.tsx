"use client";

import { AiPromptEditorPanel } from "@/features/dev/components/AiPromptEditorPanel";
import { MoneytreeFirmOverview } from "@/features/integrations/MoneytreeFirmOverview";
import { TAX_DOCUMENT_TYPE_LABELS } from "@/features/docugrid/schema/tax-document";
import { GoogleDriveSettingsCard } from "@/features/settings/GoogleDriveSettingsCard";
import type { useIntegrationConfig } from "@/features/settings/hooks/useIntegrationConfig";

type IntegrationState = ReturnType<typeof useIntegrationConfig>;

type IntegrationsSettingsTabProps = IntegrationState & {
  canEditPlatformSettings: boolean;
};

export function IntegrationsSettingsTab({
  canEditPlatformSettings,
  isDriveConnected,
  setIsDriveConnected,
  driveRootFolderId,
  setDriveRootFolderId,
  driveCredentialsConfigured,
  driveMode,
  driveServiceAccountEmail,
  driveAuthMethod,
  driveConnectedEmail,
  driveOauthAvailable,
  driveRootLocation,
  driveSharedDriveName,
  driveOfficeVisible,
  driveNeedsOfficeShare,
  driveSharedMemberEmails,
  driveEligibleMemberEmails,
  driveOfficeHints,
  sharedDrivesEmptyHint,
  sharedDrives,
  selectedSharedDriveId,
  setSelectedSharedDriveId,
  isLoadingSharedDrives,
  isApplyingSharedDrive,
  isSharingWithFirm,
  isStartingDriveOauth,
  isTestingDrive,
  driveTestMessage,
  isUploadingDriveCredentials,
  notificationEmailEnabled,
  setNotificationEmailEnabled,
  ocrAutoExtractEnabled,
  setOcrAutoExtractEnabled,
  aiOpenaiEnabled,
  setAiOpenaiEnabled,
  aiOpenaiModel,
  setAiOpenaiModel,
  aiOpenaiKeyConfigured,
  aiOpenaiKeyLast4,
  aiOpenaiApiKey,
  setAiOpenaiApiKey,
  aiGeminiEnabled,
  setAiGeminiEnabled,
  aiGeminiModel,
  setAiGeminiModel,
  aiGeminiKeyConfigured,
  aiGeminiKeyLast4,
  aiGeminiApiKey,
  setAiGeminiApiKey,
  alertConsumptionTaxMonthsBeforeDue,
  setAlertConsumptionTaxMonthsBeforeDue,
  alertCorporateTaxMonthsBeforeDue,
  setAlertCorporateTaxMonthsBeforeDue,
  matrixYearDisplayCount,
  setMatrixYearDisplayCount,
  isLoadingConfig,
  isSavingConfig,
  configMessage,
  packageTemplateName,
  setPackageTemplateName,
  packageSortOrder,
  isLoadingPackageTemplate,
  isSavingPackageTemplate,
  packageTemplateMessage,
  handleSaveIntegrationConfig,
  handleTestDriveConnection,
  handleUploadDriveCredentials,
  handleStartDriveOauth,
  handleDisconnectDriveOauth,
  handleLoadSharedDrives,
  handleUseSharedDrive,
  handleShareWithFirm,
  movePackageSortItem,
  handleSavePackageTemplate,
}: IntegrationsSettingsTabProps) {
  return (
    <section className="fade-in-up space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">外部連携</h2>
        <p className="mt-1 text-xs text-slate-500">
          プラットフォーム管理者向け。顧問先の口座連携は各クライアントのワークスペースで行います。
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          銀行・クレカ（Moneytree）
        </h3>
        <MoneytreeFirmOverview />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Google Drive</h3>
        <GoogleDriveSettingsCard
          canEdit={canEditPlatformSettings}
          isDriveConnected={isDriveConnected}
          setIsDriveConnected={setIsDriveConnected}
          driveRootFolderId={driveRootFolderId}
          setDriveRootFolderId={setDriveRootFolderId}
          driveCredentialsConfigured={driveCredentialsConfigured}
          driveMode={driveMode}
          driveServiceAccountEmail={driveServiceAccountEmail}
          driveAuthMethod={driveAuthMethod}
          driveConnectedEmail={driveConnectedEmail}
          driveOauthAvailable={driveOauthAvailable}
          driveRootLocation={driveRootLocation}
          driveSharedDriveName={driveSharedDriveName}
          driveOfficeVisible={driveOfficeVisible}
          driveNeedsOfficeShare={driveNeedsOfficeShare}
          driveSharedMemberEmails={driveSharedMemberEmails}
          driveEligibleMemberEmails={driveEligibleMemberEmails}
          driveOfficeHints={driveOfficeHints}
          sharedDrivesEmptyHint={sharedDrivesEmptyHint}
          sharedDrives={sharedDrives}
          selectedSharedDriveId={selectedSharedDriveId}
          setSelectedSharedDriveId={setSelectedSharedDriveId}
          isLoadingSharedDrives={isLoadingSharedDrives}
          isApplyingSharedDrive={isApplyingSharedDrive}
          isSharingWithFirm={isSharingWithFirm}
          isStartingDriveOauth={isStartingDriveOauth}
          isTestingDrive={isTestingDrive}
          driveTestMessage={driveTestMessage}
          isUploadingDriveCredentials={isUploadingDriveCredentials}
          isLoadingConfig={isLoadingConfig}
          isSavingConfig={isSavingConfig}
          configMessage={configMessage}
          onSave={() => void handleSaveIntegrationConfig()}
          onTest={() => void handleTestDriveConnection()}
          onUploadCredentials={(f) => void handleUploadDriveCredentials(f)}
          onStartOauth={() => void handleStartDriveOauth()}
          onDisconnectOauth={() => void handleDisconnectDriveOauth()}
          onLoadSharedDrives={() => void handleLoadSharedDrives()}
          onUseSharedDrive={() => void handleUseSharedDrive()}
          onShareWithFirm={() => void handleShareWithFirm()}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">AI / OCR</h3>
        <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">AI / OCR 分類（システム管理者）</div>
              <p className="mt-1 text-xs text-slate-500">
                API キーはサーバーで暗号化保存され、画面には表示されません。Gemini のみ、または OpenAI → Gemini の順で補助分類・Vision 分類に使います。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveIntegrationConfig()}
              disabled={!canEditPlatformSettings || isLoadingConfig || isSavingConfig}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isSavingConfig ? "保存中..." : "設定保存"}
            </button>
          </div>
          {!canEditPlatformSettings && (
            <p className="mt-3 text-xs text-amber-700">
              保存にはプラットフォーム管理者権限（settings.platform）が必要です。
            </p>
          )}
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>OCR 自動抽出を有効化</span>
              <input
                type="checkbox"
                checked={ocrAutoExtractEnabled}
                onChange={(e) => setOcrAutoExtractEnabled(e.target.checked)}
              />
            </label>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>OpenAI 補助分類</span>
                <input
                  type="checkbox"
                  checked={aiOpenaiEnabled}
                  onChange={(e) => setAiOpenaiEnabled(e.target.checked)}
                />
              </label>
              <label className="mt-2 block text-xs text-slate-600">
                モデル
                <input
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                  value={aiOpenaiModel}
                  onChange={(e) => setAiOpenaiModel(e.target.value)}
                />
              </label>
              <label className="mt-2 block text-xs text-slate-600">
                API キー
                {aiOpenaiKeyConfigured && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                    saved ****{aiOpenaiKeyLast4 ?? "????"}
                  </span>
                )}
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                  value={aiOpenaiApiKey}
                  onChange={(e) => setAiOpenaiApiKey(e.target.value)}
                  placeholder={aiOpenaiKeyConfigured ? "設定済み（変更時のみ入力）" : "sk-..."}
                />
              </label>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Gemini 補助分類</span>
                <input
                  type="checkbox"
                  checked={aiGeminiEnabled}
                  onChange={(e) => setAiGeminiEnabled(e.target.checked)}
                />
              </label>
              <p className="mt-1 text-[10px] text-slate-500">
                OpenAI より確信度が低い場合のフォールバックとして利用します。
              </p>
              <label className="mt-2 block text-xs text-slate-600">
                モデル
                <input
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                  value={aiGeminiModel}
                  onChange={(e) => setAiGeminiModel(e.target.value)}
                />
              </label>
              <label className="mt-2 block text-xs text-slate-600">
                API キー
                {aiGeminiKeyConfigured && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                    saved ****{aiGeminiKeyLast4 ?? "????"}
                  </span>
                )}
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                  value={aiGeminiApiKey}
                  onChange={(e) => setAiGeminiApiKey(e.target.value)}
                  placeholder={aiGeminiKeyConfigured ? "設定済み（変更時のみ入力）" : "AIza..."}
                />
              </label>
            </div>
          </div>
          {configMessage && <p className="mt-3 text-xs text-slate-500">{configMessage}</p>}
        </article>

        <article className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <AiPromptEditorPanel scope="firm" />
        </article>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">DocuGrid</h3>
        <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">申告パッケージ並び順テンプレ</div>
              <p className="mt-1 text-xs text-slate-500">
                「申告パッケージ自動整列」で PDF を並べる順序です。上から順に結合・表示されます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSavePackageTemplate()}
              disabled={!canEditPlatformSettings || isLoadingPackageTemplate || isSavingPackageTemplate}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isSavingPackageTemplate ? "保存中..." : "テンプレ保存"}
            </button>
          </div>
          <label className="mt-4 block text-xs text-slate-600">
            テンプレ名
            <input
              className="mt-1 block w-full rounded border border-slate-200 px-2 py-1 text-xs"
              value={packageTemplateName}
              onChange={(e) => setPackageTemplateName(e.target.value)}
              disabled={!canEditPlatformSettings || isLoadingPackageTemplate}
            />
          </label>
          <ol className="mt-3 space-y-1.5">
            {packageSortOrder.map((type, index) => (
              <li
                key={type}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
              >
                <span>
                  {index + 1}. {TAX_DOCUMENT_TYPE_LABELS[type]} ({type})
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0 || !canEditPlatformSettings}
                    onClick={() => movePackageSortItem(index, -1)}
                    className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === packageSortOrder.length - 1 || !canEditPlatformSettings}
                    onClick={() => movePackageSortItem(index, 1)}
                    className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {packageTemplateMessage && (
            <p className="mt-3 text-xs text-slate-500">{packageTemplateMessage}</p>
          )}
        </article>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">マトリクス表示</h3>
        <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-bold text-slate-800">年度ドラム</div>
          <p className="mt-1 text-xs text-slate-500">
            最新年度は自動で更新されます。表示する年数（1〜30、既定5）より前の資料は OLD にまとめて表示します。
          </p>
          <label className="mt-3 flex items-center justify-between text-xs text-slate-600">
            <span>表示年数</span>
            <input
              type="number"
              min={1}
              max={30}
              value={matrixYearDisplayCount}
              onChange={(e) =>
                setMatrixYearDisplayCount(Math.min(30, Math.max(1, Number(e.target.value) || 5)))
              }
              className="w-20 rounded border border-slate-300 px-2 py-1"
            />
          </label>
        </article>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">通知・アラート</h3>
        <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-bold text-slate-800">通知・アラート設定</div>
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>メール通知を有効化</span>
              <input
                type="checkbox"
                checked={notificationEmailEnabled}
                onChange={(e) => setNotificationEmailEnabled(e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>消費税届出アラート（月前）</span>
              <input
                type="number"
                min={0}
                value={alertConsumptionTaxMonthsBeforeDue}
                onChange={(e) => setAlertConsumptionTaxMonthsBeforeDue(Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>法人税届出アラート（月前）</span>
              <input
                type="number"
                min={0}
                value={alertCorporateTaxMonthsBeforeDue}
                onChange={(e) => setAlertCorporateTaxMonthsBeforeDue(Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
        </article>
      </div>
    </section>
  );
}
