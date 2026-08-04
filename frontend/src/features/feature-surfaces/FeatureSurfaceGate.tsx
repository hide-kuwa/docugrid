"use client";

import type { ReactNode } from "react";
import { WipBanner, WipSection, type WipKind } from "@/components/work-in-progress";
import { useFeatureSurface } from "./useFeatureSurface";

/** 設定のモードに応じて工事中/見本バナーを出す（live なら何も出さない） */
export function FeatureSurfaceBanner({
  featureId,
  className = "",
  fallbackMessage,
}: {
  featureId: string;
  className?: string;
  fallbackMessage?: string;
}) {
  const gate = useFeatureSurface(featureId);
  if (gate.loading || gate.mode === "live" || !gate.wipKind) return null;
  return (
    <WipBanner
      kind={gate.wipKind}
      title={gate.title}
      message={fallbackMessage || gate.message}
      className={className}
    />
  );
}

/** live 以外のとき WipSection で包む。live なら children のみ */
export function FeatureSurfaceSection({
  featureId,
  children,
  className = "",
  bodyClassName = "",
  fallbackMessage,
}: {
  featureId: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  fallbackMessage?: string;
}) {
  const gate = useFeatureSurface(featureId);
  if (gate.loading) {
    return <div className={className}>{children}</div>;
  }
  if (gate.mode === "live" || !gate.wipKind) {
    return <div className={className}>{children}</div>;
  }
  return (
    <WipSection
      kind={gate.wipKind as WipKind}
      title={gate.title}
      message={fallbackMessage || gate.message}
      className={className}
      bodyClassName={bodyClassName}
    >
      {children}
    </WipSection>
  );
}
