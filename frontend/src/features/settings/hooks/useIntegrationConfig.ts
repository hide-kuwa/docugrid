"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import {
  DEFAULT_PACKAGE_SORT_ORDER,
  type TaxDocumentType,
} from "@/features/docugrid/schema/tax-document";

export function useIntegrationConfig(canEditPlatformSettings: boolean) {
  const systemConfigEndpoint = `${API_BASE}/system-config`;
  const driveStatusEndpoint = `${API_BASE}/drive/status`;
  const driveTestEndpoint = `${API_BASE}/drive/test`;
  const driveCredentialsEndpoint = `${API_BASE}/drive/credentials`;
  const driveOauthStartEndpoint = `${API_BASE}/drive/oauth/start`;
  const driveOauthDisconnectEndpoint = `${API_BASE}/drive/oauth`;
  const driveSharedDrivesEndpoint = `${API_BASE}/drive/shared-drives`;
  const driveUseSharedDriveEndpoint = `${API_BASE}/drive/use-shared-drive`;
  const driveShareWithFirmEndpoint = `${API_BASE}/drive/share-with-firm`;
  const documentTemplatesEndpoint = `${API_BASE}/document-templates`;

  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [driveRootFolderId, setDriveRootFolderId] = useState("");
  const [driveCredentialsConfigured, setDriveCredentialsConfigured] = useState(false);
  const [driveMode, setDriveMode] = useState<"live" | "unconfigured">("unconfigured");
  const [driveServiceAccountEmail, setDriveServiceAccountEmail] = useState("");
  const [driveAuthMethod, setDriveAuthMethod] = useState<"none" | "oauth" | "service_account">("none");
  const [driveConnectedEmail, setDriveConnectedEmail] = useState("");
  const [driveOauthAvailable, setDriveOauthAvailable] = useState(false);
  const [driveRootLocation, setDriveRootLocation] = useState<"none" | "my_drive" | "shared_drive">("none");
  const [driveSharedDriveName, setDriveSharedDriveName] = useState("");
  const [driveOfficeVisible, setDriveOfficeVisible] = useState(false);
  const [driveNeedsOfficeShare, setDriveNeedsOfficeShare] = useState(false);
  const [driveSharedMemberEmails, setDriveSharedMemberEmails] = useState<string[]>([]);
  const [driveEligibleMemberEmails, setDriveEligibleMemberEmails] = useState<string[]>([]);
  const [driveOfficeHints, setDriveOfficeHints] = useState<string[]>([]);
  const [sharedDrivesEmptyHint, setSharedDrivesEmptyHint] = useState("");
  const [sharedDrives, setSharedDrives] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSharedDriveId, setSelectedSharedDriveId] = useState("");
  const [isLoadingSharedDrives, setIsLoadingSharedDrives] = useState(false);
  const [isApplyingSharedDrive, setIsApplyingSharedDrive] = useState(false);
  const [isSharingWithFirm, setIsSharingWithFirm] = useState(false);
  const [isStartingDriveOauth, setIsStartingDriveOauth] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestMessage, setDriveTestMessage] = useState("");
  const [isUploadingDriveCredentials, setIsUploadingDriveCredentials] = useState(false);
  const [notificationEmailEnabled, setNotificationEmailEnabled] = useState(true);
  const [ocrAutoExtractEnabled, setOcrAutoExtractEnabled] = useState(true);
  const [aiOpenaiEnabled, setAiOpenaiEnabled] = useState(false);
  const [aiOpenaiModel, setAiOpenaiModel] = useState("gpt-4o-mini");
  const [aiOpenaiKeyConfigured, setAiOpenaiKeyConfigured] = useState(false);
  const [aiOpenaiKeyLast4, setAiOpenaiKeyLast4] = useState<string | null>(null);
  const [aiOpenaiApiKey, setAiOpenaiApiKey] = useState("");
  const [aiGeminiEnabled, setAiGeminiEnabled] = useState(false);
  const [aiGeminiModel, setAiGeminiModel] = useState("gemini-2.5-flash");
  const [aiGeminiKeyConfigured, setAiGeminiKeyConfigured] = useState(false);
  const [aiGeminiKeyLast4, setAiGeminiKeyLast4] = useState<string | null>(null);
  const [aiGeminiApiKey, setAiGeminiApiKey] = useState("");
  const [alertConsumptionTaxMonthsBeforeDue, setAlertConsumptionTaxMonthsBeforeDue] = useState(2);
  const [alertCorporateTaxMonthsBeforeDue, setAlertCorporateTaxMonthsBeforeDue] = useState(2);
  const [matrixYearDisplayCount, setMatrixYearDisplayCount] = useState(5);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState("");
  const [packageTemplateName, setPackageTemplateName] = useState("標準顧客納品用パッケージ");
  const [packageSortOrder, setPackageSortOrder] = useState<TaxDocumentType[]>([
    ...DEFAULT_PACKAGE_SORT_ORDER,
  ]);
  const [isLoadingPackageTemplate, setIsLoadingPackageTemplate] = useState(false);
  const [isSavingPackageTemplate, setIsSavingPackageTemplate] = useState(false);
  const [packageTemplateMessage, setPackageTemplateMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadSystemConfig = async () => {
      setIsLoadingConfig(true);
      setConfigMessage("");
      try {
        const res = await authFetch(systemConfigEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) throw new Error("config-load-failed");
        const data = (await res.json()) as {
          google_drive_connected?: boolean;
          notification_email_enabled?: boolean;
          ocr_auto_extract_enabled?: boolean;
          alert_consumption_tax_months_before_due?: number;
          alert_corporate_tax_months_before_due?: number;
          matrix_year_display_count?: number;
          ai_openai_enabled?: boolean;
          ai_openai_model?: string;
          ai_openai_key_configured?: boolean;
          ai_openai_key_last4?: string | null;
          ai_gemini_enabled?: boolean;
          ai_gemini_model?: string;
          ai_gemini_key_configured?: boolean;
          ai_gemini_key_last4?: string | null;
          drive_root_folder_id?: string | null;
          drive_credentials_configured?: boolean;
          drive_mode?: string;
        };
        if (active) {
          setIsDriveConnected(!!data.google_drive_connected);
          setDriveRootFolderId(data.drive_root_folder_id ?? "");
          setDriveCredentialsConfigured(!!data.drive_credentials_configured);
          setDriveMode(data.drive_mode === "live" ? "live" : "unconfigured");
          setNotificationEmailEnabled(data.notification_email_enabled ?? true);
          setOcrAutoExtractEnabled(data.ocr_auto_extract_enabled ?? true);
          setAlertConsumptionTaxMonthsBeforeDue(data.alert_consumption_tax_months_before_due ?? 2);
          setAlertCorporateTaxMonthsBeforeDue(data.alert_corporate_tax_months_before_due ?? 2);
          setMatrixYearDisplayCount(
            Math.min(30, Math.max(1, data.matrix_year_display_count ?? 5)),
          );
          setAiOpenaiEnabled(!!data.ai_openai_enabled);
          setAiOpenaiModel(data.ai_openai_model ?? "gpt-4o-mini");
          setAiOpenaiKeyConfigured(!!data.ai_openai_key_configured);
          setAiOpenaiKeyLast4(data.ai_openai_key_last4 ?? null);
          setAiGeminiEnabled(!!data.ai_gemini_enabled);
          setAiGeminiModel(data.ai_gemini_model ?? "gemini-2.5-flash");
          setAiGeminiKeyConfigured(!!data.ai_gemini_key_configured);
          setAiGeminiKeyLast4(data.ai_gemini_key_last4 ?? null);
        }
      } catch {
        if (active) {
          setConfigMessage("設定の読込に失敗しました。権限を確認してください。");
        }
      } finally {
        if (active) setIsLoadingConfig(false);
      }
    };
    const loadDriveStatus = async () => {
      try {
        const res = await authFetch(driveStatusEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as {
          service_account_email?: string | null;
          drive_mode?: string;
          drive_credentials_configured?: boolean;
          google_drive_connected?: boolean;
          drive_root_folder_id?: string | null;
          auth_method?: string;
          connected_email?: string | null;
          oauth_available?: boolean;
          root_location?: string;
          shared_drive_name?: string | null;
          office_visible?: boolean;
          needs_office_share?: boolean;
          shared_member_emails?: string[];
          eligible_member_emails?: string[];
          office_hints?: string[];
        };
        if (!active) return;
        setDriveServiceAccountEmail(data.service_account_email ?? "");
        if (data.drive_mode) setDriveMode(data.drive_mode === "live" ? "live" : "unconfigured");
        setDriveCredentialsConfigured(!!data.drive_credentials_configured);
        if (typeof data.google_drive_connected === "boolean") {
          setIsDriveConnected(data.google_drive_connected);
        }
        if (data.drive_root_folder_id != null) {
          setDriveRootFolderId(data.drive_root_folder_id);
        }
        const method = data.auth_method;
        setDriveAuthMethod(
          method === "oauth" || method === "service_account" ? method : "none",
        );
        setDriveConnectedEmail(data.connected_email ?? data.service_account_email ?? "");
        setDriveOauthAvailable(!!data.oauth_available);
        const loc = data.root_location;
        setDriveRootLocation(
          loc === "shared_drive" || loc === "my_drive" ? loc : "none",
        );
        setDriveSharedDriveName(data.shared_drive_name ?? "");
        setDriveOfficeVisible(!!data.office_visible);
        setDriveNeedsOfficeShare(!!data.needs_office_share);
        setDriveSharedMemberEmails(
          Array.isArray(data.shared_member_emails) ? data.shared_member_emails : [],
        );
        setDriveEligibleMemberEmails(
          Array.isArray(data.eligible_member_emails) ? data.eligible_member_emails : [],
        );
        setDriveOfficeHints(Array.isArray(data.office_hints) ? data.office_hints : []);
      } catch {
        /* optional */
      }
    };
    const loadSharedDrives = async () => {
      try {
        const res = await authFetch(driveSharedDrivesEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as {
          drives?: Array<{ id: string; name: string }>;
          empty_hint?: string | null;
        };
        if (!active) return;
        const list = Array.isArray(data.drives) ? data.drives : [];
        setSharedDrives(list);
        setSharedDrivesEmptyHint(list.length === 0 ? data.empty_hint || "" : "");
        setSelectedSharedDriveId((prev) => prev || list[0]?.id || "");
      } catch {
        /* optional until connected */
      }
    };
    void loadSystemConfig();
    void loadDriveStatus().then(() => {
      void loadSharedDrives();
    });
    return () => {
      active = false;
    };
  }, [systemConfigEndpoint, driveStatusEndpoint, driveSharedDrivesEndpoint]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("drive_oauth");
    if (status === "ok") {
      setDriveTestMessage("Google Drive を接続しました。ミラーがオンになっていることを確認し、必要なら接続テストしてください。");
    } else if (status === "error") {
      const detail = params.get("drive_oauth_error") || "接続に失敗しました";
      setDriveTestMessage(`Google Drive 接続エラー: ${detail}`);
    }
    if (status === "ok" || status === "error") {
      params.delete("drive_oauth");
      params.delete("drive_oauth_error");
      const next = params.toString();
      const path = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", path);
    }
  }, []);

  useEffect(() => {
    if (!canEditPlatformSettings) return;
    let active = true;
    const loadPackageTemplate = async () => {
      setIsLoadingPackageTemplate(true);
      setPackageTemplateMessage("");
      try {
        const res = await authFetch(documentTemplatesEndpoint, { headers: buildAuthHeaders() });
        if (!res.ok) throw new Error("template-load-failed");
        const data = (await res.json()) as {
          templateName?: string;
          sortOrder?: TaxDocumentType[];
        };
        if (!active) return;
        setPackageTemplateName(data.templateName ?? "標準顧客納品用パッケージ");
        if (Array.isArray(data.sortOrder) && data.sortOrder.length > 0) {
          setPackageSortOrder(data.sortOrder);
        }
      } catch {
        if (active) setPackageTemplateMessage("並び順テンプレの読込に失敗しました。");
      } finally {
        if (active) setIsLoadingPackageTemplate(false);
      }
    };
    void loadPackageTemplate();
    return () => {
      active = false;
    };
  }, [canEditPlatformSettings, documentTemplatesEndpoint]);

  const handleSaveIntegrationConfig = useCallback(async () => {
    setIsSavingConfig(true);
    setConfigMessage("");
    try {
      const res = await authFetch(systemConfigEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({
          google_drive_connected: isDriveConnected,
          notification_email_enabled: notificationEmailEnabled,
          ocr_auto_extract_enabled: ocrAutoExtractEnabled,
          alert_consumption_tax_months_before_due: alertConsumptionTaxMonthsBeforeDue,
          alert_corporate_tax_months_before_due: alertCorporateTaxMonthsBeforeDue,
          matrix_year_display_count: matrixYearDisplayCount,
          ai_openai_enabled: aiOpenaiEnabled,
          ai_openai_model: aiOpenaiModel,
          ai_gemini_enabled: aiGeminiEnabled,
          ai_gemini_model: aiGeminiModel,
          drive_root_folder_id: driveRootFolderId.trim() || null,
          ...(aiOpenaiApiKey.trim() ? { ai_openai_api_key: aiOpenaiApiKey.trim() } : {}),
          ...(aiGeminiApiKey.trim() ? { ai_gemini_api_key: aiGeminiApiKey.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error("config-save-failed");
      const saved = (await res.json()) as {
        ai_openai_key_configured?: boolean;
        ai_openai_key_last4?: string | null;
        ai_gemini_key_configured?: boolean;
        ai_gemini_key_last4?: string | null;
      };
      setAiOpenaiKeyConfigured(!!saved.ai_openai_key_configured);
      setAiOpenaiKeyLast4(saved.ai_openai_key_last4 ?? null);
      setAiGeminiKeyConfigured(!!saved.ai_gemini_key_configured);
      setAiGeminiKeyLast4(saved.ai_gemini_key_last4 ?? null);
      setAiOpenaiApiKey("");
      setAiGeminiApiKey("");
      setConfigMessage("保存しました。");
    } catch {
      setConfigMessage("保存に失敗しました。設定権限を確認してください。");
    } finally {
      setIsSavingConfig(false);
    }
  }, [
    systemConfigEndpoint,
    isDriveConnected,
    notificationEmailEnabled,
    ocrAutoExtractEnabled,
    alertConsumptionTaxMonthsBeforeDue,
    alertCorporateTaxMonthsBeforeDue,
    matrixYearDisplayCount,
    aiOpenaiEnabled,
    aiOpenaiModel,
    aiGeminiEnabled,
    aiGeminiModel,
    driveRootFolderId,
    aiOpenaiApiKey,
    aiGeminiApiKey,
  ]);

  const handleStartDriveOauth = useCallback(async () => {
    setIsStartingDriveOauth(true);
    setDriveTestMessage("");
    try {
      const res = await authFetch(driveOauthStartEndpoint, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      const data = (await res.json()) as { authorize_url?: string; detail?: string };
      if (!res.ok || !data.authorize_url) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Google Drive 接続を開始できませんでした。クライアントシークレットを確認してください。",
        );
      }
      window.location.assign(data.authorize_url);
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "Google 接続の開始に失敗しました。");
      setIsStartingDriveOauth(false);
    }
  }, [driveOauthStartEndpoint]);

  const handleDisconnectDriveOauth = useCallback(async () => {
    setDriveTestMessage("");
    try {
      const res = await authFetch(driveOauthDisconnectEndpoint, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error("oauth-disconnect-failed");
      setDriveAuthMethod("none");
      setDriveConnectedEmail("");
      setDriveCredentialsConfigured(false);
      setDriveMode("unconfigured");
      setIsDriveConnected(false);
      setDriveTestMessage("Google Drive の接続を解除しました。");
    } catch {
      setDriveTestMessage("接続解除に失敗しました。");
    }
  }, [driveOauthDisconnectEndpoint]);

  const refreshDriveStatus = useCallback(async () => {
    try {
      const res = await authFetch(driveStatusEndpoint, { headers: buildAuthHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as {
        service_account_email?: string | null;
        drive_mode?: string;
        drive_credentials_configured?: boolean;
        google_drive_connected?: boolean;
        drive_root_folder_id?: string | null;
        auth_method?: string;
        connected_email?: string | null;
        oauth_available?: boolean;
        root_location?: string;
        shared_drive_name?: string | null;
        office_visible?: boolean;
        needs_office_share?: boolean;
        shared_member_emails?: string[];
        eligible_member_emails?: string[];
        office_hints?: string[];
      };
      setDriveServiceAccountEmail(data.service_account_email ?? "");
      if (data.drive_mode) setDriveMode(data.drive_mode === "live" ? "live" : "unconfigured");
      setDriveCredentialsConfigured(!!data.drive_credentials_configured);
      if (typeof data.google_drive_connected === "boolean") {
        setIsDriveConnected(data.google_drive_connected);
      }
      if (data.drive_root_folder_id != null) setDriveRootFolderId(data.drive_root_folder_id);
      const method = data.auth_method;
      setDriveAuthMethod(
        method === "oauth" || method === "service_account" ? method : "none",
      );
      setDriveConnectedEmail(data.connected_email ?? data.service_account_email ?? "");
      setDriveOauthAvailable(!!data.oauth_available);
      const loc = data.root_location;
      setDriveRootLocation(loc === "shared_drive" || loc === "my_drive" ? loc : "none");
      setDriveSharedDriveName(data.shared_drive_name ?? "");
      setDriveOfficeVisible(!!data.office_visible);
      setDriveNeedsOfficeShare(!!data.needs_office_share);
      setDriveSharedMemberEmails(
        Array.isArray(data.shared_member_emails) ? data.shared_member_emails : [],
      );
      setDriveEligibleMemberEmails(
        Array.isArray(data.eligible_member_emails) ? data.eligible_member_emails : [],
      );
      setDriveOfficeHints(Array.isArray(data.office_hints) ? data.office_hints : []);
    } catch {
      /* ignore */
    }
  }, [driveStatusEndpoint]);

  const handleLoadSharedDrives = useCallback(async () => {
    setIsLoadingSharedDrives(true);
    try {
      const res = await authFetch(driveSharedDrivesEndpoint, { headers: buildAuthHeaders() });
      const data = (await res.json()) as {
        drives?: Array<{ id: string; name: string }>;
        empty_hint?: string | null;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "共有ドライブ一覧に失敗");
      }
      const list = Array.isArray(data.drives) ? data.drives : [];
      setSharedDrives(list);
      setSelectedSharedDriveId((prev) => prev || list[0]?.id || "");
      setSharedDrivesEmptyHint(list.length === 0 ? data.empty_hint || "共有ドライブが見つかりません。" : "");
      if (list.length === 0 && data.empty_hint) {
        setDriveTestMessage(data.empty_hint);
      }
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "共有ドライブ一覧に失敗しました。");
    } finally {
      setIsLoadingSharedDrives(false);
    }
  }, [driveSharedDrivesEndpoint]);

  const handleUseSharedDrive = useCallback(async () => {
    if (!selectedSharedDriveId) {
      setDriveTestMessage("共有ドライブを選んでください。");
      return;
    }
    setIsApplyingSharedDrive(true);
    setDriveTestMessage("");
    try {
      const res = await authFetch(driveUseSharedDriveEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({ shared_drive_id: selectedSharedDriveId }),
      });
      const data = (await res.json()) as {
        root_folder_id?: string;
        label?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "共有ドライブ設定に失敗");
      }
      if (data.root_folder_id) setDriveRootFolderId(data.root_folder_id);
      setIsDriveConnected(true);
      await refreshDriveStatus();
      setDriveTestMessage(
        `共有ドライブに DocuGrid フォルダを用意しました（${data.label ?? "共有ドライブ"}）。事務所メンバーは Drive から見られます。`,
      );
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "共有ドライブ設定に失敗しました。");
    } finally {
      setIsApplyingSharedDrive(false);
    }
  }, [driveUseSharedDriveEndpoint, selectedSharedDriveId, refreshDriveStatus]);

  const handleShareWithFirm = useCallback(async () => {
    setIsSharingWithFirm(true);
    setDriveTestMessage("");
    try {
      const res = await authFetch(driveShareWithFirmEndpoint, {
        method: "POST",
        headers: buildAuthHeaders(),
      });
      const data = (await res.json()) as {
        message?: string;
        detail?: string;
        tip?: string | null;
        failed?: Array<{ email?: string; error?: string }>;
        eligible_member_emails?: string[];
      };
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "メンバー共有に失敗");
      }
      if (Array.isArray(data.eligible_member_emails)) {
        setDriveEligibleMemberEmails(data.eligible_member_emails);
      }
      await refreshDriveStatus();
      const failed = Array.isArray(data.failed) ? data.failed : [];
      const failedLine =
        failed.length > 0
          ? ` 失敗: ${failed
              .map((f) => f.email || "?")
              .slice(0, 5)
              .join(", ")}${failed.length > 5 ? "…" : ""}`
          : "";
      setDriveTestMessage(
        `${data.message || "メンバーに共有しました。"}${failedLine}${data.tip ? ` ${data.tip}` : ""}`,
      );
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "メンバー共有に失敗しました。");
    } finally {
      setIsSharingWithFirm(false);
    }
  }, [driveShareWithFirmEndpoint, refreshDriveStatus]);

  const handleTestDriveConnection = useCallback(async () => {
    setIsTestingDrive(true);
    setDriveTestMessage("");
    try {
      const res = await authFetch(driveTestEndpoint, {
        method: "POST",
        headers: buildAuthHeaders(),
      });
      const data = (await res.json()) as { ok?: boolean; mode?: string; message?: string; root_folder_name?: string };
      if (!res.ok) {
        throw new Error((data as { detail?: string }).detail || "drive-test-failed");
      }
      if (data.mode === "live") {
        setDriveTestMessage(
          `本番接続 OK（ルート: ${data.root_folder_name ?? driveRootFolderId}）`,
        );
        setDriveMode("live");
      }
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "接続テストに失敗しました。");
    } finally {
      setIsTestingDrive(false);
    }
  }, [driveTestEndpoint, driveRootFolderId]);

  const handleUploadDriveCredentials = useCallback(async (file: File | null) => {
    if (!file) return;
    setIsUploadingDriveCredentials(true);
    setDriveTestMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch(driveCredentialsEndpoint, {
        method: "POST",
        body: form,
        headers: buildAuthHeaders(),
      });
      const data = (await res.json()) as { service_account_email?: string; detail?: string };
      if (!res.ok) throw new Error(data.detail || "credentials-upload-failed");
      setDriveCredentialsConfigured(true);
      setDriveServiceAccountEmail(data.service_account_email ?? "");
      setDriveMode("live");
      setDriveTestMessage("サービスアカウントを保存しました。");
    } catch (err) {
      setDriveTestMessage(err instanceof Error ? err.message : "クレデンシャル保存に失敗しました。");
    } finally {
      setIsUploadingDriveCredentials(false);
    }
  }, [driveCredentialsEndpoint]);

  const movePackageSortItem = useCallback((index: number, direction: -1 | 1) => {
    setPackageSortOrder((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  const handleSavePackageTemplate = useCallback(async () => {
    setIsSavingPackageTemplate(true);
    setPackageTemplateMessage("");
    try {
      const res = await authFetch(documentTemplatesEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({
          templateName: packageTemplateName.trim() || "標準顧客納品用パッケージ",
          sortOrder: packageSortOrder,
        }),
      });
      if (!res.ok) throw new Error("template-save-failed");
      const saved = (await res.json()) as { templateName?: string; sortOrder?: TaxDocumentType[] };
      if (saved.templateName) setPackageTemplateName(saved.templateName);
      if (Array.isArray(saved.sortOrder)) setPackageSortOrder(saved.sortOrder);
      setPackageTemplateMessage("並び順テンプレを保存しました。");
    } catch {
      setPackageTemplateMessage("保存に失敗しました。プラットフォーム設定権限を確認してください。");
    } finally {
      setIsSavingPackageTemplate(false);
    }
  }, [documentTemplatesEndpoint, packageTemplateName, packageSortOrder]);

  return {
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
  };
}
