"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface DashboardNavLinkProps {
  href: string;
  label: string;
}

export function DashboardNavLink({ href, label }: DashboardNavLinkProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-slate-900 text-white shadow"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {label}
    </Link>
  );
}
