import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type CalendarEvent = {
  id: string;
  client_id: string;
  date: string;
  time?: string | null;
  title: string;
  company?: string | null;
  contact?: string | null;
  attendees: number;
  type: string;
  source_type: string;
  updated_at: string;
};

export async function fetchCalendarEvents(
  clientId: string,
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/calendar/events`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`calendar-fetch-failed:${res.status}`);
  const data = (await res.json()) as { events: CalendarEvent[] };
  return data.events ?? [];
}

export async function upsertCalendarEvent(
  clientId: string,
  event: Partial<CalendarEvent> & { date: string; title: string },
): Promise<CalendarEvent> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/calendar/events`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) throw new Error(`calendar-upsert-failed:${res.status}`);
  return (await res.json()) as CalendarEvent;
}
