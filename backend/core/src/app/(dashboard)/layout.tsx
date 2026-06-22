import type { ReactNode } from "react";

import { DashboardNavLink } from "../../components/dashboard/nav-link";

const navigation = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/journal", label: "仕訳帳" },
  { href: "/accounts", label: "勘定科目マスタ" },
  { href: "/ledger", label: "総勘定元帳" },
  { href: "/trial-balance", label: "試算表" }, 
];


export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 border-r bg-white p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">メニュー</h2>
          <p className="mt-1 text-xs text-slate-500">
            操作したい画面を選択してください。
          </p>
        </div>
        <nav className="flex flex-col gap-2">
          {navigation.map((item) => (
            <DashboardNavLink key={item.href} {...item} />
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
