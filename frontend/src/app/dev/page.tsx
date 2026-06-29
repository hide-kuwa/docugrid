"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  LineChart,
  Loader2,
  Monitor,
  Plug,
  Presentation,
  Scale,
  Shield,
  Table2,
  GitBranch,
} from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import {
  canAccessDevConsole,
  canAccessFirmSettings,
  canAccessPlatformSettings,
  settingsHref,
  visibleDevSettingsCategories,
} from "@/lib/app-surface";
import { audienceLabel, inScopePersonas } from "@/lib/product-scope";

type DevLink = {
  href: string;
  label: string;
  description: string;
  icon: typeof Table2;
};

type Gate = "loading" | "ready" | "denied" | "offline";

export default function DevConsolePage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("loading");
  const [user, setUser] = useState(loadCurrentUser());

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session === "offline") {
        setGate("offline");
        return;
      }
      if (session === "missing") {
        router.replace("/login");
        return;
      }
      if (session === "invalid") {
        router.replace("/login?reason=session");
        return;
      }
      const u = loadCurrentUser();
      setUser(u);
      if (!canAccessDevConsole(u)) {
        if (canAccessFirmSettings(u)) {
          router.replace("/settings");
          return;
        }
        setGate("denied");
        return;
      }
      setGate("ready");
    })();
  }, [router]);

  if (gate === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (gate === "offline") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm font-bold text-white">サーバーに接続できません</p>
          <p className="mt-2 text-xs text-slate-400">
            バックエンド（ポート 8000）が起動しているか確認してください。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"
          >
            業務画面へ
          </Link>
        </div>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm font-bold text-white">開発コンソールへのアクセス権がありません</p>
          <p className="mt-2 text-xs text-slate-400">
            所長・管理者（settings.manage）またはプラットフォーム運用アカウントでログインしてください。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"
          >
            資料マトリクスへ
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const devTabs = new Set(visibleDevSettingsCategories(user));
  const links: DevLink[] = [];

  if (devTabs.has("roles")) {
    links.push({
      href: settingsHref("dev", "roles"),
      label: "権限ロール",
      description: "AppRole と permission のマトリクス",
      icon: Shield,
    });
  }
  if (devTabs.has("documents")) {
    links.push({
      href: settingsHref("dev", "documents"),
      label: "書類カテゴリ定義",
      description: "スロット・OCR フラグ（コード SSOT の参照）",
      icon: Database,
    });
  }
  if (devTabs.has("screens")) {
    links.push({
      href: settingsHref("dev", "screens"),
      label: "画面設計",
      description: "ペルソナ別ワークスペースの見た目",
      icon: Monitor,
    });
  }
  if (devTabs.has("integrations")) {
    links.push({
      href: settingsHref("dev", "integrations"),
      label: "外部連携",
      description: "Drive・AI キー・通知",
      icon: Plug,
    });
  }
  if (canAccessPlatformSettings(user)) {
    links.push({
      href: "/dev/executive/ma-goals",
      label: "MA ロードマップ",
      description: "10億円 ARR · 獲得ペース · チャーン目標",
      icon: LineChart,
    });
    links.push({
      href: "/dev/executive",
      label: "経営ダッシュボード",
      description: "MRR / ARR / チャーン · 全事務所・顧問先",
      icon: LineChart,
    });
    links.push({
      href: "/dev/integration-ports",
      label: "連携ポートカタログ",
      description: "API-first 連携の port_id 正本（YAML）",
      icon: Table2,
    });
    links.push({
      href: "/dev/legal-master",
      label: "法定マスタ",
      description: "税率・控除の valid_from / valid_to（CSV）",
      icon: Scale,
    });
    links.push({
      href: "/dev/metric-mappings",
      label: "指標マップ",
      description: "metric_key ↔ 科目 / field_id / スロット",
      icon: GitBranch,
    });
  }

  links.push({
    href: "/catalog",
    label: "書類カタログ",
    description: "顧問先横断の提出状況・OCR 要確認",
    icon: Table2,
  });

  const firmPersonas = inScopePersonas().filter((p) => p.audience === "firm");
  const clientPersonas = inScopePersonas().filter((p) => p.audience === "client");

  return (
    <>
      <DevConsoleChrome
        title="開発コンソール"
        subtitle="優先: 税理士事務所 · クライアント · 設計ツール（銀行・税務署は保留）"
      />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/50 to-slate-900 p-5">
          <div className="flex items-start gap-3">
            <Presentation className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-amber-100">ロール画面デモ（営業用）</h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                資料マトリクスと同じカード感覚で、所長・担当・クライアント各ロールの画面を切り替えてプレビューできます。
                本番データは変更されません。
              </p>
              <Link
                href="/dev/demo"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-400"
              >
                <Presentation className="h-4 w-4" />
                ロール画面デモを開く
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-blue-800/50 bg-slate-900/80 p-5">
          <h2 className="text-sm font-bold text-blue-200">{audienceLabel("firm")}（業務）</h2>
          <p className="mt-1 text-xs text-slate-400">マトリクス中心の事務所向け画面です。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
            >
              資料マトリクス
            </Link>
            <Link
              href="/tasks"
              className="rounded-lg border border-blue-700/50 px-4 py-2 text-xs font-bold text-blue-100 hover:bg-blue-950/50"
            >
              タスク一覧
            </Link>
            <Link
              href="/capture"
              className="rounded-lg border border-blue-700/50 px-4 py-2 text-xs font-bold text-blue-100 hover:bg-blue-950/50"
            >
              撮影
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-500">
            {firmPersonas.map((p) => (
              <li key={p.id} className="rounded-full border border-slate-700 px-2 py-0.5">
                {p.shortLabel}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-emerald-800/50 bg-slate-900/80 p-5">
          <h2 className="text-sm font-bold text-emerald-200">{audienceLabel("client")}（業務）</h2>
          <p className="mt-1 text-xs text-slate-400">提出・経営サマリーなどワークスペース向けです。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {clientPersonas.map((p) => (
              <Link
                key={p.id}
                href={p.homePath}
                className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-950/50"
              >
                {p.shortLabel}
              </Link>
            ))}
          </div>
        </section>

        {canAccessFirmSettings(user) ? (
          <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <h2 className="text-sm font-bold text-slate-300">事務所設定（運用）</h2>
            <p className="mt-1 text-xs text-slate-500">顧客マスタ・担当・ひな形など。</p>
            <Link
              href="/settings"
              className="mt-3 inline-block rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              事務所設定を開く
            </Link>
          </section>
        ) : null}

        <section>
          <h2 className="text-sm font-bold text-amber-300/90">{audienceLabel("platform")}</h2>
          <p className="mt-1 text-xs text-slate-500">ロール設計・画面設計・カタログなど。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-amber-500/40 hover:bg-slate-800"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div>
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
