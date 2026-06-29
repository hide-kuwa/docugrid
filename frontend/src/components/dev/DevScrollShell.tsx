"use client";

import { useEffect, type ReactNode } from "react";

/**
 * /dev 配下のスクロールを保証する。
 * マトリクス等で body { overflow: hidden } が残っている場合もここで解除する。
 */
export function DevScrollShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    const prevHtmlHeight = document.documentElement.style.height;
    const prevBodyHeight = document.body.style.height;
    document.documentElement.style.overflow = "";
    document.documentElement.style.height = "";
    document.body.style.overflow = "";
    document.body.style.height = "";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.documentElement.style.height = prevHtmlHeight;
      document.body.style.overflow = prevBody;
      document.body.style.height = prevBodyHeight;
    };
  }, []);

  return <div className="min-h-dvh overflow-y-auto overscroll-y-auto bg-slate-950">{children}</div>;
}
