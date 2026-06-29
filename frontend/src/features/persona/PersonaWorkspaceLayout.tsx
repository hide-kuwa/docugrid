"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import type { PersonaDefinition } from "@/config/personas";
import type { AppPermission } from "@/config/organization";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { PersonalScreenDesignForm } from "@/features/screen-design/PersonalScreenDesignForm";
import type { DocugridUser } from "@/lib/auth";
import { clearAuthSession } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";
import { canShowDevConsoleNav, canShowFirmSettingsNav } from "@/lib/nav-policy";

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
  children: React.ReactNode;
  demoMode?: boolean;
};

function navItemActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0];
  if (base === pathname) return true;
  if (base !== "/" && pathname.startsWith(base)) return true;
  return false;
}

export function PersonaWorkspaceLayout({ persona, user, design, children, demoMode }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const accent = design?.accentColor || "#2563eb";
  const title = design?.pageTitle || persona.label;
  const welcome = design?.welcomeMessage || persona.description;
  const isClientPortal = persona.audience === "client";

  const visibleNavItems = persona.navItems.filter((item) => {
    if (item.permission && !hasPermission(user, item.permission as AppPermission)) return false;
    return true;
  });

  const showFirmSettings = !isClientPortal && canShowFirmSettingsNav(user);
  const showDevConsole = !isClientPortal && canShowDevConsoleNav(user);

  return (
    <div className="min-h-screen bg-slate-100">
      {demoMode ? (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[11px] font-bold text-amber-950">
          営業デモプレビュー · 本番のアカウントやデータは変更されません
          {" · "}
          <Link href="/dev/demo" className="underline hover:text-amber-800">
            ロール一覧へ
          </Link>
        </div>
      ) : null}
      <header
        className="border-b border-slate-200 bg-white shadow-sm"
        style={{ borderTopWidth: 4, borderTopColor: accent }}
      >
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                {isClientPortal ? "クライアントポータル" : "Workspace"}
              </p>
              <h1 className="text-xl font-black text-slate-800">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{welcome}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              {user?.firmLabel && (
                <div className="mb-1 rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-800">
                  {user.firmLabel}
                </div>
              )}
              <div>{user?.name || user?.email}</div>
              {demoMode ? (
                <Link
                  href="/dev/demo"
                  className="mt-2 inline-block text-[11px] font-bold text-amber-700 hover:text-amber-900"
                >
                  デモ終了
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    clearAuthSession();
                    router.push("/login");
                  }}
                  className="mt-2 text-[11px] font-bold text-slate-400 hover:text-slate-600"
                >
                  ログアウト
                </button>
              )}
            </div>
          </div>

          {!demoMode && visibleNavItems.length > 0 && (
            <nav className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {visibleNavItems.map((item) => {
                const active = navItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">{children}</main>

      {!isClientPortal && !demoMode && (
        <footer className="mx-auto max-w-4xl space-y-6 px-6 pb-8">
          <PersonalScreenDesignForm />

          {(showFirmSettings || showDevConsole) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">管理</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {showFirmSettings ? (
                  <Link
                    href="/settings"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    事務所設定
                  </Link>
                ) : null}
                {showDevConsole ? (
                  <Link
                    href="/dev"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  >
                    開発コンソール
                  </Link>
                ) : null}
                {persona.shell === "matrix" && (
                  <Link
                    href="/"
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"
                  >
                    資料マトリクスへ
                  </Link>
                )}
              </div>
            </section>
          )}
        </footer>
      )}
    </div>
  );
}
