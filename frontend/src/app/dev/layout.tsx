import type { ReactNode } from "react";
import { DevScrollShell } from "@/components/dev/DevScrollShell";

export default function DevLayout({ children }: { children: ReactNode }) {
  return <DevScrollShell>{children}</DevScrollShell>;
}
