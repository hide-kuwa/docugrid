"use client";

import { FirmDirectorDashboard } from "@/features/persona/FirmDirectorDashboard";
import { FirmStaffMainDashboard } from "@/features/persona/FirmStaffMainDashboard";
import { FirmStaffSupportDashboard } from "@/features/persona/FirmStaffSupportDashboard";
import type { DocugridUser } from "@/lib/auth";
import type { PersonaId } from "@/config/personas";

type Props = {
  personaId: PersonaId;
  user: DocugridUser | null;
  onSelectClient?: (clientId: string) => void;
};

export function InsightsPanel({ personaId, user, onSelectClient }: Props) {
  if (personaId === "firm_director") {
    return (
      <FirmDirectorDashboard
        user={user}
        onSelectClient={onSelectClient}
        variant="drawer"
      />
    );
  }
  if (personaId === "firm_staff_main") {
    return (
      <FirmStaffMainDashboard
        user={user}
        onSelectClient={onSelectClient}
        variant="drawer"
      />
    );
  }
  if (personaId === "firm_staff_support") {
    return (
      <FirmStaffSupportDashboard
        user={user}
        onSelectClient={onSelectClient}
        variant="drawer"
      />
    );
  }
  return null;
}

export const hasInsightsPanel = (personaId: PersonaId): boolean =>
  personaId === "firm_director" ||
  personaId === "firm_staff_main" ||
  personaId === "firm_staff_support";
