"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkSession, clearAuthSession, loadAccessToken, loadCurrentUser, type DocugridUser } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";
import { getPostLoginPath, usesMatrixShell } from "@/lib/persona";
import { fetchBillingMe, type BillingMe } from "@/features/billing/billing-api";

export function useMatrixAuthBootstrap() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<DocugridUser | null>(null);
  const [billingMe, setBillingMe] = useState<BillingMe | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const user = loadCurrentUser();
      const status = await checkSession();
      if (!active) return;

      if (status === "missing") {
        clearAuthSession();
        router.replace("/welcome");
        return;
      }
      if (status === "invalid") {
        clearAuthSession();
        router.replace("/login?reason=session");
        return;
      }
      if (status === "offline") {
        const cached = loadCurrentUser();
        if (cached && loadAccessToken()) {
          setCurrentUser(cached);
          setAuthChecked(true);
          return;
        }
        router.replace("/login?reason=offline");
        return;
      }
      const synced = loadCurrentUser() ?? user;
      if (synced && !usesMatrixShell(synced)) {
        router.replace(getPostLoginPath(synced));
        return;
      }
      if (synced) setCurrentUser(synced);
      setAuthChecked(true);
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, [router]);

  const reloadBilling = useCallback(async () => {
    if (!hasPermission(currentUser, "dashboard.view")) return;
    setBillingLoading(true);
    try {
      setBillingMe(await fetchBillingMe());
    } catch {
      setBillingMe(null);
    } finally {
      setBillingLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!authChecked || !currentUser) return;
    void reloadBilling();
  }, [authChecked, currentUser, reloadBilling]);

  return {
    authChecked,
    currentUser,
    billingMe,
    billingLoading,
    reloadBilling,
  };
}
