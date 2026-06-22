"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { clearAuthSession, loadCurrentUser } from "@/lib/auth";

type Props = {
  variant?: "dark" | "light" | "sidebar";
};

export function AuthNavButtons({ variant = "dark" }: Props) {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!loadCurrentUser()?.email);
  }, []);

  const baseClass =
    variant === "sidebar"
      ? "flex w-full flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-slate-800/90 px-1 py-2 text-[9px] font-bold text-slate-400 shadow-lg transition-all hover:bg-slate-800 hover:text-white"
      : variant === "dark"
        ? "flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-slate-800 px-3 text-xs font-bold text-slate-400 shadow-lg transition-all hover:text-white"
        : "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50";

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (loggedIn) {
      clearAuthSession();
      router.push("/login");
      return;
    }
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={baseClass}
      title={loggedIn ? "ログアウト" : "ログイン"}
    >
      {loggedIn ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
      <span className={variant === "sidebar" ? "text-center leading-tight" : "hidden sm:inline"}>
        {loggedIn ? "ログアウト" : "ログイン"}
      </span>
    </button>
  );
}
