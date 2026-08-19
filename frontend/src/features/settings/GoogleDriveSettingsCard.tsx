"use client";

import { useState } from "react";
import Link from "next/link";

type SharedDriveOption = { id: string; name: string };

type Props = {
  canEdit: boolean;
  isDriveConnected: boolean;
  setIsDriveConnected: (updater: (prev: boolean) => boolean) => void;
  driveRootFolderId: string;
  setDriveRootFolderId: (value: string) => void;
  driveCredentialsConfigured: boolean;
  driveMode: "live" | "unconfigured";
  driveServiceAccountEmail: string;
  driveAuthMethod: "none" | "oauth" | "service_account";
  driveConnectedEmail: string;
  driveOauthAvailable: boolean;
  driveRootLocation: "none" | "my_drive" | "shared_drive";
  driveSharedDriveName: string;
  driveOfficeVisible: boolean;
  driveNeedsOfficeShare: boolean;
  driveSharedMemberEmails: string[];
  driveEligibleMemberEmails: string[];
  driveOfficeHints: string[];
  sharedDrivesEmptyHint: string;
  sharedDrives: SharedDriveOption[];
  selectedSharedDriveId: string;
  setSelectedSharedDriveId: (value: string) => void;
  isLoadingSharedDrives: boolean;
  isApplyingSharedDrive: boolean;
  isSharingWithFirm: boolean;
  isStartingDriveOauth: boolean;
  isTestingDrive: boolean;
  driveTestMessage: string;
  isUploadingDriveCredentials: boolean;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  configMessage: string;
  onSave: () => void;
  onTest: () => void;
  onUploadCredentials: (file: File | null) => void;
  onStartOauth: () => void;
  onDisconnectOauth: () => void;
  onLoadSharedDrives: () => void;
  onUseSharedDrive: () => void;
  onShareWithFirm: () => void;
};

export function GoogleDriveSettingsCard({
  canEdit,
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
  isLoadingConfig,
  isSavingConfig,
  configMessage,
  onSave,
  onTest,
  onUploadCredentials,
  onStartOauth,
  onDisconnectOauth,
  onLoadSharedDrives,
  onUseSharedDrive,
  onShareWithFirm,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(driveAuthMethod === "service_account");
  const linkedLabel = driveConnectedEmail || driveServiceAccountEmail || "未接続";
  const ready = driveMode === "live" && driveCredentialsConfigured;
  const authLabel =
    driveAuthMethod === "oauth"
      ? "Google 接続"
      : driveAuthMethod === "service_account"
        ? "サービスアカウント"
        : "未接続";
  const locationLabel =
    driveRootLocation === "shared_drive"
      ? `共有ドライブ${driveSharedDriveName ? `「${driveSharedDriveName}」` : ""}`
      : driveRootLocation === "my_drive"
        ? "マイドライブ"
        : "未設定";

  return (
    <article
      data-tour="settings-drive"
      className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">Google Drive 連携</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            DocuGrid に保存した PDF を、事務所の Drive にもミラーします。認可の正は DocuGrid
            側です。スタッフ各自が Drive を繋ぐ必要はありません。
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            isDriveConnected && ready
              ? "bg-emerald-100 text-emerald-800"
              : ready
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {isDriveConnected && ready ? `ミラー ON · ${authLabel}` : ready ? `認証済み · ${authLabel}` : "未接続"}
        </span>
      </div>

      <div
        data-tour="settings-drive-account"
        className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-600"
      >
        <p className="font-bold text-slate-800">接続アカウント（事務所の保管庫）</p>
        <p className="mt-1 font-mono text-[11px] text-slate-700">{linkedLabel}</p>
        <p className="mt-2 leading-relaxed text-slate-500">
          <strong className="font-semibold text-slate-700">ログイン用 Google</strong>
          （各スタッフ・所長の個人）とは別にできます。事務所全体で使うなら、共有ドライブに入れる
          <strong className="font-semibold text-slate-700"> 事務所用アカウント</strong>
          で接続するのがおすすめです。
        </p>
        <p className="mt-2">
          <Link href="/help?id=google-drive" className="font-bold text-emerald-700 hover:underline">
            アカウントの選び方（ヘルプ）
          </Link>
        </p>
      </div>

      <div
        data-tour="settings-drive-oauth"
        className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-4"
      >
        <p className="text-sm font-bold text-slate-800">Google で接続（おすすめ）</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Google の同意画面で許可します。接続後、下の「事務所で見えるようにする」で共有ドライブへ移すか、メンバー共有してください。
        </p>
        {canEdit ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onStartOauth}
              disabled={!driveOauthAvailable || isStartingDriveOauth || isLoadingConfig}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isStartingDriveOauth
                ? "Google へ移動中…"
                : driveAuthMethod === "oauth"
                  ? "Google で再接続"
                  : "Google Drive を接続"}
            </button>
            {driveAuthMethod === "oauth" ? (
              <button
                type="button"
                onClick={onDisconnectOauth}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Google 接続を解除
              </button>
            ) : null}
          </div>
        ) : null}
        {!driveOauthAvailable ? (
          <p className="mt-2 text-[11px] text-amber-800">
            サーバーに <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> が未設定です。当面は下の上級設定も使えます。
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">接続は所長・設定担当だけで十分です。</p>
        )}
      </div>

      {ready ? (
        <div
          data-tour="settings-drive-office"
          className={`rounded-xl border px-4 py-4 ${
            driveOfficeVisible
              ? "border-emerald-100 bg-emerald-50/40"
              : "border-amber-100 bg-amber-50/50"
          }`}
        >
          <p className="text-sm font-bold text-slate-800">事務所で見えるようにする</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            いまの置き場: <strong className="font-semibold text-slate-800">{locationLabel}</strong>
            {driveOfficeVisible
              ? " — 事務所メンバーが Drive から開けます。"
              : " — 接続者だけが見える状態です。共有ドライブへ移すか、メンバー共有してください。"}
          </p>

          {canEdit ? (
            <div className="mt-3 space-y-3">
              {driveOfficeHints.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
                  {driveOfficeHints.slice(0, 3).map((hint) => (
                    <li key={hint.slice(0, 48)}>{hint}</li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-700">おすすめ: 共有ドライブを使う</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                    value={selectedSharedDriveId}
                    onChange={(e) => setSelectedSharedDriveId(e.target.value)}
                    disabled={!sharedDrives.length}
                  >
                    {sharedDrives.length === 0 ? (
                      <option value="">（共有ドライブなし）</option>
                    ) : (
                      sharedDrives.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.id}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={onLoadSharedDrives}
                    disabled={isLoadingSharedDrives}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isLoadingSharedDrives ? "取得中…" : "一覧を更新"}
                  </button>
                  <button
                    type="button"
                    onClick={onUseSharedDrive}
                    disabled={!selectedSharedDriveId || isApplyingSharedDrive}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {isApplyingSharedDrive ? "設定中…" : "この共有ドライブを使う"}
                  </button>
                </div>
                {sharedDrives.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                    <p className="font-bold">一覧が空のときの手順</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                      <li>
                        Google Drive で事務所の共有ドライブを開く（なければ新規作成）
                      </li>
                      <li>
                        メンバーに{" "}
                        <span className="font-mono">
                          {driveConnectedEmail || "接続アカウント"}
                        </span>{" "}
                        を追加（コンテンツ管理者推奨）
                      </li>
                      <li>ここに戻り「一覧を更新」→「この共有ドライブを使う」</li>
                    </ol>
                    {sharedDrivesEmptyHint ? (
                      <p className="mt-2 text-slate-600">{sharedDrivesEmptyHint}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    選んだ共有ドライブ内に DocuGrid フォルダを作ります。共有ドライブのメンバー全員が見られます。
                  </p>
                )}
              </div>

              {driveRootLocation !== "shared_drive" ? (
                <div className="space-y-2 border-t border-amber-100/80 pt-3">
                  <p className="text-[11px] font-bold text-slate-700">代替: マイドライブをメンバーに共有</p>
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    共有先は DocuGrid のメンバーメールです。必ず{" "}
                    <strong className="font-semibold text-slate-800">Google ログインと同じメール</strong>
                    で招待してください（開発用のパスワード専用メールは Drive に届きません）。
                  </p>
                  {driveEligibleMemberEmails.length > 0 ? (
                    <p className="text-[11px] text-slate-500">
                      共有対象予定: {driveEligibleMemberEmails.slice(0, 6).join(", ")}
                      {driveEligibleMemberEmails.length > 6
                        ? ` ほか ${driveEligibleMemberEmails.length - 6} 名`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-800">
                      いま共有できるアクティブメンバーがいません。メンバー招待で実在の Google
                      メールを追加してください。
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onShareWithFirm}
                    disabled={isSharingWithFirm || driveEligibleMemberEmails.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isSharingWithFirm ? "共有中…" : "事務所メンバーにフォルダを共有"}
                  </button>
                  {driveSharedMemberEmails.length > 0 ? (
                    <p className="text-[11px] text-slate-500">
                      共有済み: {driveSharedMemberEmails.slice(0, 6).join(", ")}
                      {driveSharedMemberEmails.length > 6
                        ? ` ほか ${driveSharedMemberEmails.length - 6} 名`
                        : ""}
                    </p>
                  ) : driveNeedsOfficeShare ? (
                    <p className="text-[11px] text-amber-800">
                      まだメンバー共有がありません。上の対象メールを確認してから実行してください。
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="border-t border-emerald-100/80 pt-3 text-[11px] text-slate-600">
                  共有ドライブ運用中です。新しいスタッフは Google 側の共有ドライブにメンバー追加すれば見えます（DocuGrid
                  のメンバー共有ボタンは不要）。
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">ミラーの ON / OFF</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-tour="settings-drive-toggle"
                onClick={() => setIsDriveConnected((prev) => !prev)}
                disabled={isLoadingConfig || isSavingConfig || !ready}
                className={`rounded-lg px-4 py-2 text-xs font-bold ${
                  isDriveConnected
                    ? "border border-red-200 bg-white text-red-500 hover:bg-red-50"
                    : "bg-emerald-700 text-white hover:bg-emerald-800"
                } disabled:opacity-50`}
              >
                {isDriveConnected ? "ミラーを止める" : "ミラーを開始"}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isLoadingConfig || isSavingConfig}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isSavingConfig ? "保存中..." : "設定保存"}
              </button>
            </div>
          </div>
          {!ready ? (
            <p className="text-[11px] text-amber-700">
              まだ認証されていません。上の Google 接続、または下の上級設定を使ってください。
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
          >
            {showAdvanced ? "上級設定を閉じる" : "上級設定（サービスアカウント JSON）"}
          </button>

          {showAdvanced ? (
            <div
              data-tour="settings-drive-advanced"
              className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4"
            >
              <p className="text-[11px] leading-relaxed text-slate-500">
                IT 担当や初期構築向けです。ルートフォルダ ID の変更もここで行えます。
              </p>
              <label className="block text-xs text-slate-600">
                ルートフォルダ ID（共有ドライブ内でも可）
                <input
                  data-tour="settings-drive-root"
                  className="mt-1 block w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs"
                  value={driveRootFolderId}
                  onChange={(e) => setDriveRootFolderId(e.target.value)}
                  placeholder="例: 1AbCdEfGhIjKlMnOpQrStUv"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                サービスアカウント（{driveServiceAccountEmail || "未設定"}）をルートの
                <strong> 編集者 </strong>
                として共有してください。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  data-tour="settings-drive-credentials"
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  {isUploadingDriveCredentials ? "アップロード中..." : "クレデンシャル JSON"}
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    disabled={isUploadingDriveCredentials}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      onUploadCredentials(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  data-tour="settings-drive-test"
                  onClick={onTest}
                  disabled={isTestingDrive || isLoadingConfig}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {isTestingDrive ? "テスト中..." : "接続テスト"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          Drive の接続変更には事務所設定権限が必要です。接続状況の確認のみできます。
        </p>
      )}

      {(configMessage || driveTestMessage) && (
        <p className="text-xs text-slate-500">{driveTestMessage || configMessage}</p>
      )}
    </article>
  );
}
