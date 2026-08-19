"use client";

import { createPortal } from "react-dom";
import { usePdfViewerSession } from "./hooks/usePdfViewerSession";
import { PdfViewerShellLayout } from "./PdfViewerShellLayout";
import type { ViewerModalProps } from "./types";

export default function PdfViewerShell(props: ViewerModalProps) {
  const vm = usePdfViewerSession(props);
  if (!props.isOpen || typeof document === "undefined") return null;
  return createPortal(<PdfViewerShellLayout vm={vm} />, document.body);
}
